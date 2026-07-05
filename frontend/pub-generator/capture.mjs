// ── Capture real gameplay clips from a selectable game HTML ──
// Opens the game in headless Chromium, auto-plays it with random inputs,
// records the canvas via MediaRecorder (webm), converts to mp4 (ffmpeg-static).
//
// Usage: node capture.mjs [count] [target]   (default 5, game/mob-control-clone.html)
//   target = chemin d'un .html (relatif à la racine du repo ou absolu) OU une URL http(s)
//            (ex. http://localhost:5173/?autostart — le jeu Vite complet, serveur requis).
import { chromium } from 'playwright'
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../..')
const DEFAULT_TARGET = resolve(REPO, 'game/mob-control-clone.html')
const OUT = join(__dir, 'output')
const CLIP_SECONDS = 9

// Résout la cible sélectionnée au début de la pipeline : URL http(s) telle quelle,
// sinon chemin de fichier (absolu ou relatif à la racine du repo) → URL file://.
function targetToUrl(raw) {
  const t = (raw || '').trim()
  if (!t) return 'file://' + DEFAULT_TARGET
  if (/^https?:\/\//i.test(t)) return t
  const p = t.startsWith('/') ? t : resolve(REPO, t)
  return 'file://' + p
}

// Runs BEFORE any page script: patch AudioContext so the game's WebAudio output
// is tapped into a MediaStreamDestination we can record. Exposes the audio
// track on window.__gameAudioStream.
const TAP_AUDIO = () => {
  const Orig = window.AudioContext || window.webkitAudioContext
  if (!Orig) return
  const Patched = function (...args) {
    const ctx = new Orig(...args)
    try {
      const dest = ctx.createMediaStreamDestination()
      // mirror the real destination: anything connected to ctx.destination
      // is also connected to our recordable dest via a shared gain node.
      const tap = ctx.createGain()
      tap.connect(dest)
      // when a node connects to ctx.destination, also connect it to our tap
      ctx.__tapNode = tap
      window.__gameAudioStream = dest.stream
    } catch (_) { /* ignore */ }
    return ctx
  }
  Patched.prototype = Orig.prototype
  window.AudioContext = Patched
  window.webkitAudioContext = Patched

  // Route every connect-to-destination through the tap too.
  const realConnect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (target, ...rest) {
    const out = realConnect.call(this, target, ...rest)
    try {
      if (target && target.context && target === target.context.destination && target.context.__tapNode) {
        realConnect.call(this, target.context.__tapNode)
      }
    } catch (_) { /* ignore */ }
    return out
  }
}

// Injected into the page: record canvas video + tapped game audio → webm base64.
const RECORD_FN = (seconds) => new Promise((res) => {
  const canvas = document.querySelector('#game canvas') || document.querySelector('canvas')
  if (!canvas) { res(null); return }
  const stream = canvas.captureStream(60) // 60 fps : fluide (le jeu tourne à 60 sur GPU réel)
  const audio = window.__gameAudioStream
  if (audio) for (const t of audio.getAudioTracks()) stream.addTrack(t)
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 8_000_000 })
  const chunks = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  rec.onstop = async () => {
    const blob = new Blob(chunks, { type: 'video/webm' })
    const buf = await blob.arrayBuffer()
    let bin = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    res(btoa(bin))
  }
  rec.start()
  setTimeout(() => rec.stop(), seconds * 1000)
})

// Drive the game with pseudo-random taps so each clip differs.
async function playRandomly(page, seconds, seed) {
  const box = await page.evaluate(() => {
    const c = document.querySelector('#game canvas') || document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  const end = Date.now() + seconds * 1000
  let n = seed
  while (Date.now() < end) {
    n = (n * 1103515245 + 12345) & 0x7fffffff
    const px = box.x + (0.2 + (n % 1000) / 1000 * 0.6) * box.w
    const py = box.y + (0.55 + ((n >> 5) % 1000) / 1000 * 0.4) * box.h
    await page.mouse.click(px, py).catch(() => {})
    await page.waitForTimeout(180 + (n % 220))
  }
}

async function tryStart(page) {
  // click any obvious start control, else click center to kick off
  for (const sel of ['#startBtn', 'button', '#game']) {
    const el = await page.$(sel)
    if (el) { await el.click({ timeout: 500 }).catch(() => {}); break }
  }
  await page.mouse.click(200, 400).catch(() => {})
}

async function captureOne(browser, index, targetUrl) {
  const name = index === 0 ? 'variant-1' : `variant-${index + 1}`
  const page = await browser.newPage({ viewport: { width: 420, height: 740 } })
  await page.addInitScript(TAP_AUDIO)      // patch AudioContext before game loads
  await page.goto(targetUrl, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  await tryStart(page)
  await page.waitForTimeout(400)

  // start recording, then drive inputs for the same window
  const recording = page.evaluate(RECORD_FN, CLIP_SECONDS)
  await playRandomly(page, CLIP_SECONDS, (index + 1) * 7919)
  const b64 = await recording
  await page.close()
  if (!b64) throw new Error(`no canvas captured for ${name}`)

  const webm = join(OUT, `${name}.webm`)
  const mp4 = join(OUT, `${name}.mp4`)
  writeFileSync(webm, Buffer.from(b64, 'base64'))

  // A/V SYNC : le webm de MediaRecorder est en VFR avec des timestamps qui dérivent
  // (vidéo légèrement « lente » → décalage sous-titres/son). On normalise dès ici :
  // fps=30 CFR côté vidéo + aresample async côté audio → timeline verrouillée.
  const vfCrop = 'scale=720:-2,crop=720:1280:(iw-720)/2:(ih-1280)/2,fps=30,format=yuv420p'
  const vfPad = 'scale=720:-2,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p'
  const audioArgs = ['-af', 'aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '128k', '-shortest']

  // webm → mp4, keep audio (AAC). crop to fill; pad on failure.
  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-fflags', '+genpts',
    '-i', webm,
    '-vf', vfCrop,
    '-vsync', 'cfr',
    '-c:v', 'libx264', '-preset', 'veryfast', '-movflags', '+faststart',
    ...audioArgs,
    '-y', mp4,
  ]).catch(async () => {
    await run(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-fflags', '+genpts',
      '-i', webm,
      '-vf', vfPad,
      '-vsync', 'cfr',
      '-c:v', 'libx264', '-preset', 'veryfast', '-movflags', '+faststart',
      ...audioArgs,
      '-y', mp4,
    ])
  })
  rmSync(webm, { force: true })
  console.log(`captured ${name}.mp4`)
  return mp4
}

async function main() {
  // Usage : node capture.mjs [count] [target] [startIndex]
  // startIndex décale le nommage (variant-<startIndex+1>…) → le serveur peut capturer
  // chaque clip depuis une CIBLE DIFFÉRENTE (5 pubs = 5 variantes de gameplay).
  const count = +(process.argv[2] || 5)
  const targetUrl = targetToUrl(process.argv[3])
  const startIndex = +(process.argv[4] || 0)
  console.log(`capture target: ${targetUrl}`)
  mkdirSync(OUT, { recursive: true })
  // FLUIDITÉ : headless AVEC GPU réel via ANGLE Metal (mesuré : 116 fps sur Apple Silicon,
  // contre 27 fps en swiftshader logiciel — la cause des vidéos saccadées). Aucune fenêtre.
  // PUBGEN_SOFTWARE=1 pour forcer swiftshader (machines sans GPU/Metal).
  const software = process.env.PUBGEN_SOFTWARE === '1'
  const browser = await chromium.launch({
    args: software
      ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
      : ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
  })
  try {
    for (let i = 0; i < count; i++) {
      try { await captureOne(browser, startIndex + i, targetUrl) }
      catch (e) { console.error(`clip ${startIndex + i + 1} failed:`, e.message) }
    }
  } finally {
    await browser.close()
  }
}

main().catch(e => { console.error(e); process.exit(1) })