// ── Frame extraction (FFmpeg) ──
// Sample one frame every FPS_SAMPLE seconds from the gameplay video.
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const run = promisify(execFile)

const FPS_SAMPLE = 3 // one frame every 3s — fewer VLM calls, faster runs

export async function extractFrames(videoPath, outDir) {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  // scale down to keep VLM payloads light; sample at fixed rate
  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    '-vf', `fps=1/${FPS_SAMPLE},scale=512:-1`,
    '-q:v', '4',
    join(outDir, 'frame_%04d.jpg'),
  ])

  const files = readdirSync(outDir).filter(f => f.endsWith('.jpg')).sort()
  // map each frame index back to its approximate source timestamp
  return files.map((file, i) => ({
    path: join(outDir, file),
    timestamp: +(i * FPS_SAMPLE).toFixed(1),
  }))
}

// Probe video duration (seconds) via ffmpeg stderr parsing.
export async function videoDuration(videoPath) {
  try {
    await run(ffmpegPath, ['-hide_banner', '-i', videoPath])
  } catch (err) {
    const m = String(err.stderr || '').match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/)
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
  }
  return 0
}

export { ffmpegPath }