import './style.css'
import { createProject, startRun, uploadGame } from './api'
import { getErrorMessage, parseRoute, setRoute } from './flow'
import { startGame } from './game'
import { renderPlaytest } from './playtest'
import { renderPipeline } from './pipeline'
import { renderVariants } from './variants'

const app = document.querySelector<HTMLDivElement>('#app')

// ── Simple hash router ──
function route() {
  if (!app) return

  const currentRoute = parseRoute()
  if (currentRoute.screen === 'playtest') { renderPlaytest(app, currentRoute); return }
  if (currentRoute.screen === 'variants') { renderVariants(app, currentRoute); return }
  if (currentRoute.screen === 'pipeline') { renderPipeline(app, currentRoute); return }
  renderLanding(app)
}

window.addEventListener('hashchange', route)
route()

function renderLanding(root: HTMLElement) {
  root.innerHTML = `
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
            <button class="btn-run" id="run-btn" type="button">Run agent →</button>
          </div>
          <input type="file" id="file-input" accept=".html" style="display:none" />
          <p class="hint" id="upload-status">Accepts a single HTML prototype</p>
        </div>
      </div>

      <footer class="footer">
        <span>RAISE Hackathon · Google DeepMind · 2026</span>
      </footer>
    </div>
  `

  startGame(document.getElementById('game-canvas') as HTMLCanvasElement)

  const urlInput  = document.getElementById('url-input')  as HTMLInputElement
  const runBtn    = document.getElementById('run-btn')     as HTMLButtonElement
  const browseBtn = document.getElementById('browse-btn')  as HTMLButtonElement
  const fileInput = document.getElementById('file-input')  as HTMLInputElement
  const dropZone  = document.getElementById('drop-zone')   as HTMLDivElement
  const uploadStatus = document.getElementById('upload-status') as HTMLElement
  let selectedFile: File | null = null

  function setSelectedFile(file: File) {
    selectedFile = file
    urlInput.value = file.name
    uploadStatus.className = 'hint'
    uploadStatus.textContent = 'Ready to upload and start the agent'
  }

  function showUploadError(message: string) {
    uploadStatus.className = 'hint hint-error'
    uploadStatus.textContent = message
  }

  browseBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (f) setSelectedFile(f)
  })

  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over') })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    const f = e.dataTransfer?.files?.[0]
    if (f) setSelectedFile(f)
  })

  runBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      urlInput.focus()
      urlInput.classList.add('shake')
      setTimeout(() => urlInput.classList.remove('shake'), 400)
      showUploadError('Choose an .html prototype first')
      return
    }

    if (!selectedFile.name.toLowerCase().endsWith('.html')) {
      showUploadError('Only .html prototypes are supported in this flow')
      return
    }

    runBtn.disabled = true
    runBtn.textContent = 'Uploading...'
    uploadStatus.className = 'hint'
    uploadStatus.textContent = 'Uploading HTML to the worker-accessible storage'

    try {
      const upload = await uploadGame(selectedFile)
      uploadStatus.textContent = 'Creating project and run'
      const project = await createProject({
        name: selectedFile.name.replace(/\.html$/i, '') || 'Uploaded prototype',
        gameUrl: upload.gameUrl,
        marketContext: 'Uploaded prototype from the Vite demo UI.',
      })
      const run = await startRun(project.id)
      setRoute('playtest', { runId: run.id, gameUrl: upload.gameUrl })
    } catch (error) {
      runBtn.disabled = false
      runBtn.textContent = 'Run agent →'
      showUploadError(getErrorMessage(error))
    }
  })

  urlInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') runBtn.click()
  })
}
