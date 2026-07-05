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
  ctx.font = `${weight} ${size}px Helvetica`
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
  ctx.font = `${weight} ${size}px Helvetica`
  ctx.fillText(text, W / 2, boxH / 2, W - 80)
  writeFileSync(outFile, canvas.toBuffer('image/png'))
  return { w: boxW, h: boxH }
}

// End card (720×1280): black background, game title, big "Download the game" button.
function endCardPng(outFile, { title = 'MOB RUSH', cta = 'Download the game' } = {}) {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)
  // titre
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 84px Helvetica'
  ctx.fillText(title, W / 2, H * 0.36)
  // sous-ligne
  ctx.font = '500 34px Helvetica'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillText('Join the crowd. Crush the base.', W / 2, H * 0.36 + 76)
  // bouton pilule bleue avec ombre dure (style candy du jeu)
  const bw = 480, bh = 108, bx = (W - bw) / 2, by = H * 0.52, r = bh / 2
  const pill = (x, y, w, h, fill) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }
  pill(bx, by + 8, bw, bh, '#1c4fd6')       // ombre dure
  const grad = ctx.createLinearGradient(0, by, 0, by + bh)
  grad.addColorStop(0, '#4dc9ff')
  grad.addColorStop(1, '#2d7dff')
  pill(bx, by, bw, bh, grad)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 44px Helvetica'
  ctx.fillText(cta, W / 2, by + bh / 2)
  writeFileSync(outFile, canvas.toBuffer('image/png'))
}

const END_DUR = 2.6   // durée de l'écran de fin
const FADE = 0.5      // fondu au noir avant l'écran de fin

export async function composeAd(videoPath, plan, outPath, workDir, { voPath = null } = {}) {
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

  // End card: fade to black, then "Download the game" card (fade-in).
  const endFile = join(workDir, 'endcard.png')
  endCardPng(endFile, { cta: 'Download the game' })
  const totalDur = dur + END_DUR

  // Détection audio du clip source.
  let hasAudio = false
  try {
    await run(ffmpegPath, ['-hide_banner', '-i', videoPath])
  } catch (err) {
    hasAudio = /Stream #0:\d+.*Audio/.test(String(err.stderr || ''))
  }

  // Entrées : [0]=gameplay, [1..n]=captions, [n+1]=endcard (image bouclée), [n+2]=voix off (option)
  const inputs = ['-i', videoPath, ...bands.flatMap(b => ['-i', b.file])]
  const endIdx = 1 + bands.length
  inputs.push('-loop', '1', '-t', String(END_DUR), '-i', endFile)
  const voIdx = endIdx + 1
  if (voPath) inputs.push('-i', voPath)

  const parts = []
  // base video → portrait 720x1280 avec zoom lent
  parts.push(
    `[0:v]scale=${W}:-2,crop=${W}:${H}:(iw-${W})/2:(ih-${H})/2,` +
    `zoompan=z='min(zoom+0.0006,1.15)':d=1:s=${W}x${H}:fps=30[base]`,
  )
  let last = 'base'
  bands.forEach((b, i) => {
    const inLabel = `${i + 1}:v`
    parts.push(
      `[${last}][${inLabel}]overlay=x=(W-w)/2:y=${b.y}:` +
      `enable='between(t,${b.t0},${b.t1})'[ov${i}]`,
    )
    last = `ov${i}`
  })
  // fondu au noir en fin de gameplay, carte de fin en fade-in, concaténation
  parts.push(`[${last}]trim=0:${dur},setpts=PTS-STARTPTS,setsar=1,fade=t=out:st=${(dur - FADE).toFixed(2)}:d=${FADE}[mainv]`)
  parts.push(`[${endIdx}:v]scale=${W}:${H},setsar=1,fps=30,fade=t=in:st=0:d=0.45[endv]`)
  parts.push(`[mainv][endv]concat=n=2:v=1:a=0[outv]`)

  // Audio : jeu (ducké sous la voix) + voix off décalée de 0.6 s, fondu de fin, silence sur la carte.
  const audioArgs = []
  if (hasAudio || voPath) {
    const chains = []
    if (hasAudio && voPath) {
      chains.push(`[0:a]volume=0.35[ga]`)
      chains.push(`[${voIdx}:a]adelay=600|600,volume=1.9[vo]`)
      chains.push(`[ga][vo]amix=inputs=2:duration=first:dropout_transition=0[mix]`)
    } else if (hasAudio) {
      chains.push(`[0:a]anull[mix]`)
    } else {
      chains.push(`[${voIdx}:a]adelay=600|600[mix]`)
    }
    chains.push(`[mix]atrim=0:${dur},asetpts=PTS-STARTPTS,afade=t=out:st=${(dur - FADE).toFixed(2)}:d=${FADE},apad=pad_dur=${END_DUR}[outa]`)
    parts.push(...chains)
    audioArgs.push('-map', '[outa]', '-c:a', 'aac', '-b:a', '128k')
  } else {
    audioArgs.push('-an')
  }

  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '[outv]',
    ...audioArgs,
    '-t', String(totalDur),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-y', outPath,
  ])

  return outPath
}