// ── pub-generator: gameplay.mp4 → exploitable ad ──
//
//   Gameplay.mp4
//     └─ Frame Extraction (FFmpeg)
//         └─ Vision Agent (VLM via NVIDIA NIM)  → Scene Timeline JSON
//             └─ Nemotron 3 (Creative Director) → Ad Plan / EDL JSON
//                 ├─ Asset Agent (Flux.1, stub)
//                 ├─ Voice Script (Kokoro TTS, stub)
//                 └─ Composition (FFmpeg)        → ad.mp4
//
// Every downstream module is driven by Nemotron's JSON — that JSON is the hero.
//
// Usage:  node generate.mjs <path-to-gameplay.mp4> [game-name]
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFrames, videoDuration } from './src/frames.mjs'
import { vlmDescribeFrame, nemotronPlanAd, MODELS } from './src/nim.mjs'
import { fluxGenerateAssets, kokoroTts } from './src/downstream.mjs'
import { composeAd } from './src/compose.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, 'output')

// Concurrency-limited map so we don't fire 60 VLM calls at once.
async function mapLimit(items, limit, fn) {
  const out = []
  let i = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

function log(step, msg) { console.log(`\x1b[36m[${step}]\x1b[0m ${msg}`) }

async function main() {
  const videoPath = process.argv[2]
  const game = process.argv[3] || 'Mob Control clone'
  if (!videoPath) {
    console.error('Usage: node generate.mjs <gameplay.mp4> [game-name]')
    process.exit(1)
  }
  const runName = basename(videoPath).replace(/\.[^.]+$/, '')
  const runDir = join(OUT, runName)
  mkdirSync(runDir, { recursive: true })
  const framesDir = join(runDir, 'frames')

  const started = Date.now()

  // 1 ─ Frame extraction
  const dur = await videoDuration(videoPath)
  const frames = await extractFrames(videoPath, framesDir)
  log('frames', `extracted ${frames.length} frames (video ~${dur.toFixed(1)}s)`)

  // 2 ─ Vision agent: describe each frame (parallel, capped)
  log('vlm', `analysing frames with ${MODELS.vlm} …`)
  const sceneTimeline = await mapLimit(frames, 4, async (f) => {
    try {
      return await vlmDescribeFrame(f.path, f.timestamp)
    } catch (err) {
      log('vlm', `frame @${f.timestamp}s failed: ${err.message}`)
      return { timestamp: f.timestamp, event: 'unreadable', visual_importance: 0 }
    }
  })
  writeFileSync(join(runDir, 'scene-timeline.json'), JSON.stringify(sceneTimeline, null, 2))
  log('vlm', `scene-timeline.json written (${sceneTimeline.length} events)`)

  // 3 ─ Nemotron: plan the ad (the brain)
  log('nemotron', `planning ad with ${MODELS.nemotron} …`)
  const plan = await nemotronPlanAd(game, sceneTimeline)
  writeFileSync(join(runDir, 'ad-plan.json'), JSON.stringify(plan, null, 2))
  log('nemotron', `ad-plan.json written — hook: "${plan.hook}"`)

  // 4 ─ Downstream, all driven by the plan
  const assets = await fluxGenerateAssets(plan.assets)
  const voice = await kokoroTts(plan.voiceover)
  writeFileSync(join(runDir, 'assets.json'), JSON.stringify(assets, null, 2))
  writeFileSync(join(runDir, 'voiceover.json'), JSON.stringify(voice, null, 2))
  log('flux', `${assets.length} assets planned (stub)`)
  log('tts', `voiceover script ready (stub)`)

  // 5 ─ Composition: apply the EDL to the gameplay → ad.mp4
  const adPath = join(runDir, 'ad.mp4')
  await composeAd(videoPath, plan, adPath, join(runDir, 'overlays'))
  log('compose', `ad.mp4 rendered`)

  // Manifest ties it all together for the frontend viewer.
  const manifest = {
    game,
    source: basename(videoPath),
    createdAt: new Date().toISOString(),
    tookMs: Date.now() - started,
    models: MODELS,
    artifacts: {
      sceneTimeline: 'scene-timeline.json',
      adPlan: 'ad-plan.json',
      assets: 'assets.json',
      voiceover: 'voiceover.json',
      video: 'ad.mp4',
    },
    plan,
  }
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  log('done', `→ ${resolve(runDir)}`)
  console.log(`\nAd: ${plan.hook}\nCTA: ${plan.cta}\nTone: ${plan.tone} · ${plan.duration_s}s\n`)
}

main().catch(err => { console.error('\x1b[31m[fatal]\x1b[0m', err); process.exit(1) })