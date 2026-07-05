// ── pub-generator local server ──
// Lets the Ads screen trigger generation automatically (no manual commands).
//   POST /generate   → capture 5 gameplays → VLM → Nemotron → FFmpeg → publish
//   GET  /status     → { state, step, log[], ads[] }
// Runs on :4319. Start with:  node pub-generator/server.mjs   (or npm run pubgen)
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const PORT = 4319
const INDEX = join(__dir, '..', 'public', 'ads', 'index.json')

const state = {
  state: 'idle',       // idle | running | done | error
  step: '',
  log: [],
  startedAt: null,
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

async function generateAll(count = 5) {
  if (state.state === 'running') return
  state.state = 'running'
  state.step = 'capturing gameplay'
  state.log = []
  state.startedAt = Date.now()
  try {
    push(`[capture] recording ${count} gameplay clips…`)
    await runScript([join(__dir, 'capture.mjs'), String(count)])

    for (let i = 1; i <= count; i++) {
      state.step = `generating ad ${i}/${count}`
      push(`[generate] variant-${i} → VLM + Nemotron…`)
      await runScript([join(__dir, 'generate.mjs'), join(__dir, 'output', `variant-${i}.mp4`), 'Mob Control clone'])
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
    // If ads already exist and not forcing, still allow re-run.
    generateAll(5)
    res.writeHead(202, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, state: state.state }))
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