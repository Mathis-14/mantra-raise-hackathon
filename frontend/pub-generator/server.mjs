// ── pub-generator local server ──
// Lets the Ads screen pick a game HTML, trigger generation, and follow progress.
//   GET  /htmls      → [{ label, value, kind }] cibles capturables (html du repo + jeu Vite)
//   POST /generate   → body { html?, count? } : capture N gameplays de la cible → VLM → Nemotron → FFmpeg → publish
//   GET  /status     → { state, step, html, log[], ads[] }
// Runs on :4319. Start with:  node pub-generator/server.mjs   (or npm run pubgen)
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../..')
const PORT = 4319
const INDEX = join(__dir, '..', 'public', 'ads', 'index.json')
const DEFAULT_HTML = 'game/mob-control-clone.html'

const state = {
  state: 'idle',       // idle | running | done | error
  step: '',
  html: DEFAULT_HTML,  // cible sélectionnée au début de la pipeline
  log: [],
  startedAt: null,
}

// Cibles proposées au début de la pipeline : les .html autonomes du repo + le jeu Vite complet.
function listHtmls() {
  const out = []
  const gameDir = join(REPO, 'game')
  if (existsSync(gameDir)) {
    for (const f of readdirSync(gameDir)) {
      if (f.endsWith('.html')) out.push({ label: `game/${f} (prototype autonome)`, value: `game/${f}`, kind: 'file' })
    }
  }
  out.push({
    label: 'Jeu complet Vite — http://localhost:5173 (lancer `npm run game` à la racine)',
    value: 'http://localhost:5173/?autostart',
    kind: 'url',
  })
  return out
}

function readAds() {
  try { return existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : [] }
  catch { return [] }
}

function push(line) {
  state.log.push(line)
  if (state.log.length > 200) state.log.shift()
  process.stdout.write(line + '\n')
}

// Run a node script, streaming its output into the log.
function runScript(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd: __dir })
    p.stdout.on('data', d => String(d).split('\n').filter(Boolean).forEach(push))
    p.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(push))
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
  })
}

// 5 VRAIES variantes de gameplay quand la cible est le jeu Vite : chaque niveau porte
// un layout + un skin différents (rotation du jeu). `?bot` = le jeu se joue tout seul.
const GAME_VARIANTS = [
  { level: 1, desc: 'classic layout, canyon theme' },
  { level: 2, desc: 'lanes layout (3 enemy corridors), canyon theme' },
  { level: 4, desc: 'maze layout (crate walls), purple night theme' },
  { level: 5, desc: 'red horde tide layout, snow theme' },
  { level: 6, desc: 'BOSS level, snow theme' },
]

// Cibles par clip : URL Vite → 5 niveaux-variantes ; fichier HTML → même cible ×N.
function targetsFor(html, count) {
  if (/^https?:\/\//i.test(html)) {
    const sep = html.includes('?') ? '&' : '?'
    return GAME_VARIANTS.slice(0, count).map((v) => ({
      url: `${html}${sep}level=${v.level}&bot`,
      game: `Mob Control clone — ${v.desc}`,
    }))
  }
  return Array.from({ length: count }, () => ({ url: html, game: 'Mob Control clone' }))
}

async function generateAll(count = 5, html = DEFAULT_HTML) {
  if (state.state === 'running') return
  state.state = 'running'
  state.step = 'capturing gameplay'
  state.html = html
  state.log = []
  state.startedAt = Date.now()
  try {
    const targets = targetsFor(html, count)
    push(`[capture] recording ${targets.length} gameplay clips…`)
    for (let i = 0; i < targets.length; i++) {
      state.step = `capturing variant ${i + 1}/${targets.length}`
      push(`[capture] variant-${i + 1} ← ${targets[i].url}`)
      await runScript([join(__dir, 'capture.mjs'), '1', targets[i].url, String(i)])
    }

    for (let i = 1; i <= targets.length; i++) {
      state.step = `generating ad ${i}/${targets.length}`
      push(`[generate] variant-${i} → VLM + Nemotron…`)
      await runScript([join(__dir, 'generate.mjs'), join(__dir, 'output', `variant-${i}.mp4`), targets[i - 1].game])
    }

    state.step = 'publishing'
    push('[publish] copying ads into frontend…')
    await runScript([join(__dir, 'publish.mjs')])

    state.state = 'done'
    state.step = 'complete'
    push(`[done] ${readAds().length} ads ready`)
  } catch (err) {
    state.state = 'error'
    state.step = err.message
    push(`[error] ${err.message}`)
  }
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'POST' && req.url === '/generate') {
    // Body JSON optionnel : { html?: string, count?: number } — la cible vient du sélecteur du tab.
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let opts = {}
      try { opts = body ? JSON.parse(body) : {} } catch { /* body vide/non-JSON → défauts */ }
      const count = Math.max(1, Math.min(8, +opts.count || 5))
      const html = typeof opts.html === 'string' && opts.html.trim() ? opts.html.trim() : DEFAULT_HTML
      generateAll(count, html)
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, state: state.state, html }))
    })
    return
  }

  if (req.method === 'GET' && req.url === '/htmls') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listHtmls()))
    return
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ...state, ads: readAds() }))
    return
  }

  res.writeHead(404); res.end('not found')
})

server.listen(PORT, () => console.log(`pub-generator server on http://localhost:${PORT}`))