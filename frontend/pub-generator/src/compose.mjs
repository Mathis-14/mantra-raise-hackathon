// ── Composition (FFmpeg) — applies Nemotron's EDL to the source gameplay ──
// ffmpeg-static ships without the `drawtext` filter (no libfreetype), so we
// render each caption to a PNG with canvas and overlay it with the `overlay`
// filter, timed via `enable='between(t,..)'`. FFmpeg-only, runs anywhere.
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createCanvas } from '@napi-rs/canvas'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const run = promisify(execFile)

const W = 720, H = 1280

// Render a caption band to a transparent PNG sized to the video width.
function captionPng(text, outFile, { size = 46, weight = 'bold' } = {}) {
  const padX = 28, padY = 16
  const canvas = createCanvas(W, 200)
  const ctx = canvas.getContext('2d')
  ctx.font = `${weight} ${size}px sans-serif`
  const metrics = ctx.measureText(text)
  const tw = Math.min(W - 40, metrics.width)
  const boxW = tw + padX * 2
  const boxH = size + padY * 2
  const bx = (W - boxW) / 2
  // rounded dark box
  ctx.fillStyle = 'rgba(0,0,0,0.58)'
  const r = 14
  ctx.beginPath()
  ctx.moveTo(bx + r, 0)
  ctx.arcTo(bx + boxW, 0, bx + boxW, boxH, r)
  ctx.arcTo(bx + boxW, boxH, bx, boxH, r)
  ctx.arcTo(bx, boxH, bx, 0, r)
  ctx.arcTo(bx, 0, bx + boxW, 0, r)
  ctx.closePath()
  ctx.fill()
  // text
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${weight} ${size}px sans-serif`
  ctx.fillText(text, W / 2, boxH / 2, W - 80)
  writeFileSync(outFile, canvas.toBuffer('image/png'))
  return { w: boxW, h: boxH }
}

export async function composeAd(videoPath, plan, outPath, workDir) {
  const dur = Math.max(6, Math.min(20, plan.duration_s || 12))
  mkdirSync(workDir, { recursive: true })

  // Collect timed captions: hook (top), EDL captions (mid), CTA (lower).
  const bands = []
  if (plan.hook) bands.push({ text: plan.hook, t0: 0, t1: 2.6, y: Math.round(H * 0.12), size: 44 })
  for (const step of plan.edl || []) {
    if (step.caption) {
      const t0 = Math.min(dur - 0.5, step.time ?? 0)
      bands.push({ text: step.caption, t0, t1: Math.min(dur, t0 + 2), y: Math.round(H * 0.70), size: 46 })
    }
  }
  if (plan.cta) bands.push({ text: plan.cta, t0: Math.max(0, dur - 3), t1: dur, y: Math.round(H * 0.82), size: 48 })

  // Render each band to a PNG.
  bands.forEach((b, i) => {
    b.file = join(workDir, `cap_${i}.png`)
    captionPng(b.text, b.file, { size: b.size })
  })

  // Build the filter graph: base scale+zoom, then chained overlays.
  const inputs = ['-i', videoPath, ...bands.flatMap(b => ['-i', b.file])]
  const parts = []
  // base video → portrait 720x1280 with a slow zoom-in
  parts.push(
    `[0:v]scale=${W}:-2,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2,` +
    `zoompan=z='min(zoom+0.0006,1.15)':d=1:s=${W}x${H}:fps=30[base]`,
  )
  let last = 'base'
  bands.forEach((b, i) => {
    const inLabel = `${i + 1}:v`
    const out = i === bands.length - 1 ? 'outv' : `ov${i}`
    parts.push(
      `[${last}][${inLabel}]overlay=x=(W-w)/2:y=${b.y}:` +
      `enable='between(t,${b.t0},${b.t1})'[${out}]`,
    )
    last = out
  })
  const map = bands.length ? 'outv' : 'base'

  // Detect whether the source clip carries an audio stream; if so, keep it.
  let hasAudio = false
  try {
    await run(ffmpegPath, ['-hide_banner', '-i', videoPath])
  } catch (err) {
    hasAudio = /Stream #0:\d+.*Audio/.test(String(err.stderr || ''))
  }

  const audioMap = hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-shortest'] : ['-an']

  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', `[${map}]`,
    ...audioMap,
    '-t', String(dur),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-y', outPath,
  ])

  return outPath
}