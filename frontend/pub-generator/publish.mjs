// ── Publish generated ads into the Vite frontend (public/ads/) ──
// Copies each output/<clip>/{ad.mp4, manifest.json} into public/ads/<clip>/
// and writes public/ads/index.json that the Ads screen fetches.
//
// Usage: node publish.mjs
import { readdirSync, existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, 'output')
const PUB = join(__dir, '..', 'public', 'ads')

mkdirSync(PUB, { recursive: true })

const clips = readdirSync(OUT).filter(name => {
  const p = join(OUT, name)
  return statSync(p).isDirectory() && existsSync(join(p, 'manifest.json'))
})

const index = []
for (const clip of clips) {
  const src = join(OUT, clip)
  const dst = join(PUB, clip)
  mkdirSync(dst, { recursive: true })
  copyFileSync(join(src, 'ad.mp4'), join(dst, 'ad.mp4'))
  copyFileSync(join(src, 'manifest.json'), join(dst, 'manifest.json'))

  const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'))
  index.push({
    clip,
    game: manifest.game,
    video: `ads/${clip}/ad.mp4`,
    manifest: `ads/${clip}/manifest.json`,
    hook: manifest.plan?.hook ?? '',
    cta: manifest.plan?.cta ?? '',
    tone: manifest.plan?.tone ?? '',
    duration_s: manifest.plan?.duration_s ?? 0,
    models: manifest.models ?? {},
  })
}

writeFileSync(join(PUB, 'index.json'), JSON.stringify(index, null, 2))
console.log(`published ${index.length} ad(s) → public/ads/index.json`)