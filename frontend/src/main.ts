import './style.css'
import { startGame } from './game'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <canvas id="game-canvas"></canvas>
  <div class="page">
    <div class="center">
      <h1 class="logo">mantra<span class="dot">.</span></h1>
      <p class="tagline">Drop a prototype. The agent plays it, generates the ads, and tells you what to build next.</p>

      <div class="search-wrap">
        <div class="search-bar" id="drop-zone">
          <input
            id="url-input"
            class="search-input"
            type="text"
            placeholder="Paste a URL or drop your HTML game here"
            autocomplete="off"
            spellcheck="false"
          />
          <span class="divider" aria-hidden="true"></span>
          <button class="btn-browse" id="browse-btn" type="button">
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="15" height="15">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            Browse
          </button>
          <button class="btn-run" id="run-btn" type="button">
            Run agent →
          </button>
        </div>
        <input type="file" id="file-input" accept=".html,.zip" style="display:none" />
        <p class="hint">Accepts an HTML file, a .zip prototype, or a hosted URL</p>
      </div>
    </div>

    <footer class="footer">
      <span>RAISE Hackathon · Google DeepMind · 2026</span>
    </footer>
  </div>
`

startGame(document.getElementById('game-canvas') as HTMLCanvasElement)

const urlInput = document.getElementById('url-input') as HTMLInputElement
const runBtn   = document.getElementById('run-btn')   as HTMLButtonElement
const browseBtn= document.getElementById('browse-btn') as HTMLButtonElement
const fileInput= document.getElementById('file-input') as HTMLInputElement
const dropZone = document.getElementById('drop-zone')  as HTMLDivElement

browseBtn.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (f) urlInput.value = f.name
})

// Drag & drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const f = e.dataTransfer?.files?.[0]
  if (f) urlInput.value = f.name
})

runBtn.addEventListener('click', () => {
  const val = urlInput.value.trim()
  if (!val) {
    urlInput.focus()
    urlInput.classList.add('shake')
    setTimeout(() => urlInput.classList.remove('shake'), 400)
    return
  }
  runBtn.textContent = 'Starting…'
  runBtn.disabled = true
  setTimeout(() => {
    runBtn.textContent = 'Run agent →'
    runBtn.disabled = false
  }, 2000)
})

urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') runBtn.click()
})
