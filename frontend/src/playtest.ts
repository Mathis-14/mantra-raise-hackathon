import { approveRun, fetchRunState, type RunState, type RunStatus } from './api'
import { getErrorMessage, renderStepper, setRoute, type FlowRoute } from './flow'
import currentGameHtml from '../../game/mob-control-clone.html?raw'

const PHONE_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706']
const SITUATION_LABELS = [
  'Original',
  'Situation 1',
  'Situation 2',
  'Situation 3',
  'Situation 4',
]
const ORIGINAL_PHONE_ID = 0
const LIVE_AGENT_PHONE_ID = 1
const DEFAULT_LIVE_STREAM_BASE_URL = 'http://127.0.0.1:4317'
const STREAM_FRAME_TIMEOUT_MS = 8000
const NORMALIZED_COORD_MAX = 999

interface LiveFrameEvent {
  mimeType: 'image/jpeg'
  data: string
  width: number
  height: number
}

interface LiveActionEvent {
  message: string
  x: number | null
  y: number | null
  endX: number | null
  endY: number | null
  click: boolean
  isError: boolean
}

function statusLabel(status: RunStatus): string {
  switch (status) {
    case 'created':
      return 'Queued for worker'
    case 'playtesting':
      return 'Agent playtest live'
    case 'awaiting_approval':
      return 'Playtest complete'
    case 'generating_variants':
      return 'Moving to variants'
    case 'failed':
      return 'Run failed'
    default:
      return status.replaceAll('_', ' ')
  }
}

function playtestProgress(status: RunStatus): number {
  switch (status) {
    case 'created':
      return 12
    case 'playtesting':
      return 62
    case 'awaiting_approval':
    case 'generating_variants':
    case 'generating_creatives':
    case 'deploying':
    case 'measuring':
    case 'deciding':
    case 'done':
      return 100
    case 'failed':
      return 100
  }
}

function renderLiveFeed() {
  return `
    <div class="phone-live-feed" id="agent-live-feed">
      <img class="phone-live-frame" id="agent-live-frame" alt="">
      <div class="phone-live-state" id="agent-live-state">
        <span class="live-dot"></span>
        <span>Connecting</span>
      </div>
      <div class="cursor phone-live-cursor" id="agent-live-cursor"></div>
    </div>
  `
}

function renderPendingPhone(title: string) {
  return `
    <div class="phone-pending">
      <span class="pending-kicker">Pending</span>
      <span class="pending-title">${title}</span>
      <span class="pending-copy">Gameplay extraction route reserved</span>
    </div>
  `
}

function renderPhones(hasRun: boolean) {
  return SITUATION_LABELS.map((title, id) => {
    const isOriginal = id === ORIGINAL_PHONE_ID
    const isLiveAgent = id === LIVE_AGENT_PHONE_ID && hasRun
    const screenClass = isOriginal || isLiveAgent ? 'phone-screen--live' : 'phone-screen--pending'
    const progress = isOriginal ? '100%' : isLiveAgent ? '12%' : '0%'
    const status = isOriginal ? 'Uploaded' : isLiveAgent ? 'Waiting' : 'Pending'

    return `
      <div class="phone-slot" id="slot-${id}">
        <div class="phone-device">
          <div class="phone-edge"></div>
          <div class="iphone-frame">
            <div class="iphone-notch"></div>
            <div class="iphone-screen ${screenClass}" id="screen-${id}">
              ${isOriginal
                ? `<iframe id="game-0" class="phone-game-frame" title="${title}" sandbox="allow-scripts allow-same-origin allow-pointer-lock"></iframe>`
                : isLiveAgent
                  ? renderLiveFeed()
                  : renderPendingPhone(title)}
            </div>
            <div class="iphone-home"></div>
          </div>
        </div>
        <div class="phone-meta" id="meta-${id}">
          <span class="phone-title" style="color:${PHONE_COLORS[id]}">${title}</span>
          <div class="phone-progress-wrap">
            <div class="phone-progress-bar" id="prog-${id}" style="background:${PHONE_COLORS[id]};width:${progress}"></div>
          </div>
          <span class="phone-pct" id="pct-${id}">${status}</span>
        </div>
      </div>
    `
  }).join('')
}

export function renderPlaytest(root: HTMLElement, route: FlowRoute) {
  root.innerHTML = `
    <div class="shell">
      <button class="back-fab" id="back-btn" title="Back">←</button>
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        ${renderStepper('playtest')}
        <div class="session-badge" id="session-badge">
          <span class="live-dot"></span>
          <span>${route.runId ? 'Waiting for agent events' : 'Local preview only'}</span>
        </div>
      </nav>

      <div class="playtest-body">
        <div class="carousel-scene">
          <div class="carousel-track" id="carousel-track">${renderPhones(route.runId !== null)}</div>

          <button class="btn-generate btn-generate--corner" id="send-agent-btn">
            <span class="btn-generate-title">${route.runId ? 'Sync agent' : 'Preview only'}</span>
            <span class="btn-generate-arrow">→</span>
          </button>
        </div>

        <aside class="logs-panel">
          <div class="logs-title">Agent activity</div>
          ${SITUATION_LABELS.map((title, id) => `
            <div class="log-group">
              <div class="log-group-head">
                <span class="log-dot" style="background:${PHONE_COLORS[id]}"></span>
                <span class="log-group-name">${title}</span>
                <span class="log-group-pct" id="logpct-${id}" style="color:${PHONE_COLORS[id]}">${id === ORIGINAL_PHONE_ID ? 'Uploaded' : id === LIVE_AGENT_PHONE_ID && route.runId ? 'Waiting' : 'Pending'}</span>
              </div>
              <div class="log-lines" id="logs-${id}"></div>
            </div>
          `).join('')}
        </aside>
      </div>
    </div>
  `

  const backBtn = document.getElementById('back-btn')
  const frame = document.getElementById('game-0') as HTMLIFrameElement | null
  const sendAgentBtn = document.getElementById('send-agent-btn') as HTMLButtonElement | null
  const badge = document.getElementById('session-badge')
  const liveScreen = document.getElementById(`screen-${LIVE_AGENT_PHONE_ID}`) as HTMLElement | null
  const liveFrame = document.getElementById('agent-live-frame') as HTMLImageElement | null
  const liveState = document.getElementById('agent-live-state') as HTMLElement | null
  const liveCursor = document.getElementById('agent-live-cursor') as HTMLElement | null
  const liveProgress = document.getElementById(`prog-${LIVE_AGENT_PHONE_ID}`) as HTMLElement | null
  const livePct = document.getElementById(`pct-${LIVE_AGENT_PHONE_ID}`)
  const liveLogPct = document.getElementById(`logpct-${LIVE_AGENT_PHONE_ID}`)
  const logBoxes = SITUATION_LABELS.map((_, id) => document.getElementById(`logs-${id}`))

  backBtn?.addEventListener('click', () => setRoute('landing'))

  if (frame) {
    if (route.gameUrl) frame.src = route.gameUrl
    else frame.srcdoc = currentGameHtml
  }

  let disposed = false
  let approving = false
  let gameUrl = route.gameUrl
  let liveSource: EventSource | null = null
  let liveFrameSeen = false
  let frameTimeout: number | null = null
  let liveFrameSize = { width: 1280, height: 1100 }
  const seenEventIds = new Set<string>()
  const slots = SITUATION_LABELS.map((_, id) => document.getElementById(`slot-${id}`)).filter(
    (slot): slot is HTMLElement => slot !== null,
  )
  const radius = 390
  const speed = 0.00028
  const startedAt = performance.now()

  function addLog(phoneId: number, text: string) {
    const box = logBoxes[phoneId]
    if (!box) return
    const line = document.createElement('div')
    line.className = 'log-line'
    line.textContent = text
    box.appendChild(line)
    box.scrollTop = box.scrollHeight
  }

  function setBadge(text: string, failed = false) {
    if (!badge) return
    badge.innerHTML = failed
      ? `<span class="status-dot status-dot--failed"></span><span>${text}</span>`
      : `<span class="live-dot"></span><span>${text}</span>`
  }

  function setLiveState(text: string, failed = false) {
    if (!liveState) return
    liveState.classList.toggle('phone-live-state--failed', failed)
    liveState.innerHTML = failed
      ? `<span class="status-dot status-dot--failed"></span><span>${text}</span>`
      : `<span class="live-dot"></span><span>${text}</span>`
  }

  function hideLiveState() {
    liveState?.classList.add('phone-live-state--hidden')
  }

  function applyState(state: RunState) {
    const status = state.run.status
    const label = statusLabel(status)
    const amount = playtestProgress(status)

    if (!gameUrl && state.project?.gameUrl && frame) {
      gameUrl = state.project.gameUrl
      frame.src = gameUrl
    }

    if (liveProgress) liveProgress.style.width = `${amount}%`
    if (livePct) livePct.textContent = amount === 100 ? 'Complete' : label
    if (liveLogPct) liveLogPct.textContent = amount === 100 ? 'Complete' : label
    setBadge(state.headline ?? label, status === 'failed')

    state.events.forEach((event) => {
      if (seenEventIds.has(event.id)) return
      seenEventIds.add(event.id)
      addLog(LIVE_AGENT_PHONE_ID, `${event.node}: ${event.message}`)
    })

    if (status === 'failed') {
      setLiveState('Run failed', true)
    }

    if (status === 'awaiting_approval' && !approving) {
      approving = true
      addLog(LIVE_AGENT_PHONE_ID, 'Playtest complete; approving variants automatically')
      void approveRun(state.run.id)
        .then(() => {
          setRoute('variants', { runId: state.run.id, gameUrl })
        })
        .catch((error: unknown) => {
          addLog(LIVE_AGENT_PHONE_ID, `Approval failed: ${getErrorMessage(error)}`)
          approving = false
        })
    }
  }

  async function refreshState() {
    if (!route.runId || disposed) return
    try {
      applyState(await fetchRunState(route.runId))
    } catch (error) {
      addLog(LIVE_AGENT_PHONE_ID, `State sync failed: ${getErrorMessage(error)}`)
      setBadge('State sync failed', true)
    }
  }

  function connectLiveStream(runId: string) {
    const streamUrl = buildLiveStreamUrl(runId, route.liveStreamBaseUrl)
    liveSource = new EventSource(streamUrl)
    frameTimeout = window.setTimeout(() => {
      if (liveFrameSeen || disposed) return
      setLiveState('Live stream unavailable', true)
      addLog(LIVE_AGENT_PHONE_ID, 'No live stream frame received from local worker')
    }, STREAM_FRAME_TIMEOUT_MS)

    liveSource.addEventListener('open', () => {
      setLiveState('Connected')
      addLog(LIVE_AGENT_PHONE_ID, 'Connected to local worker stream')
    })
    liveSource.addEventListener('frame', (event) => {
      const frameEvent = parseLiveFrameEvent(readEventPayload(event))
      if (!frameEvent || !liveFrame) return
      liveFrameSeen = true
      liveFrameSize = { width: frameEvent.width, height: frameEvent.height }
      liveFrame.src = `data:${frameEvent.mimeType};base64,${frameEvent.data}`
      hideLiveState()
      if (frameTimeout !== null) {
        window.clearTimeout(frameTimeout)
        frameTimeout = null
      }
    })
    liveSource.addEventListener('action', (event) => {
      const action = parseLiveActionEvent(readEventPayload(event))
      if (!action) return
      addLog(LIVE_AGENT_PHONE_ID, action.message)
      renderActionOverlay(action)
    })
    liveSource.addEventListener('status', (event) => {
      const message = readStatusMessage(readEventPayload(event))
      if (message) addLog(LIVE_AGENT_PHONE_ID, message)
    })
    liveSource.addEventListener('error', () => {
      if (!liveFrameSeen) setLiveState('Live stream unavailable', true)
      else setLiveState('Reconnecting')
    })
  }

  function renderActionOverlay(action: LiveActionEvent) {
    const x = action.endX ?? action.x
    const y = action.endY ?? action.y
    if (x === null || y === null || !liveCursor || !liveScreen) return

    const point = mapNormalizedPoint(x, y)
    liveCursor.style.left = `${point.left}px`
    liveCursor.style.top = `${point.top}px`
    liveCursor.classList.add('phone-live-cursor--visible')

    if (action.click && !action.isError) {
      const ring = document.createElement('div')
      ring.className = 'click-ring'
      ring.style.left = `${point.left}px`
      ring.style.top = `${point.top}px`
      liveScreen.appendChild(ring)
      window.setTimeout(() => ring.remove(), 520)
    }
  }

  function mapNormalizedPoint(x: number, y: number) {
    const screenWidth = liveScreen?.clientWidth ?? 1
    const screenHeight = liveScreen?.clientHeight ?? 1
    const frameAspect = liveFrameSize.width / liveFrameSize.height
    const screenAspect = screenWidth / screenHeight
    const renderedWidth = screenAspect > frameAspect ? screenHeight * frameAspect : screenWidth
    const renderedHeight = screenAspect > frameAspect ? screenHeight : screenWidth / frameAspect
    const offsetX = (screenWidth - renderedWidth) / 2
    const offsetY = (screenHeight - renderedHeight) / 2

    return {
      left: offsetX + (x / NORMALIZED_COORD_MAX) * renderedWidth,
      top: offsetY + (y / NORMALIZED_COORD_MAX) * renderedHeight,
    }
  }

  sendAgentBtn?.addEventListener('click', () => {
    if (!route.runId) {
      addLog(ORIGINAL_PHONE_ID, 'Upload an HTML file to start a backend agent run')
      return
    }
    addLog(LIVE_AGENT_PHONE_ID, 'Syncing backend agent state')
    void refreshState()
  })

  addLog(ORIGINAL_PHONE_ID, route.runId ? 'Uploaded game preview loaded' : 'Local game preview loaded')
  if (route.runId) {
    addLog(LIVE_AGENT_PHONE_ID, 'Backend run created; waiting for worker claim')
    connectLiveStream(route.runId)
  }
  for (let id = 2; id < SITUATION_LABELS.length; id++) {
    addLog(id, 'Pending: gameplay situation extraction ships next')
  }

  const poll = window.setInterval(() => {
    void refreshState()
  }, 1500)
  void refreshState()

  function layoutCarousel(now: number) {
    if (disposed) return
    const theta = (now - startedAt) * speed
    const count = slots.length
    slots.forEach((slot, id) => {
      const angle = theta + (id / count) * Math.PI * 2
      const x = Math.sin(angle) * radius
      const depth = Math.cos(angle)
      const t = (depth + 1) / 2
      const scale = 0.9 + t * 0.6
      slot.style.transform = `translateX(${x.toFixed(2)}px) scale(${scale.toFixed(3)})`
      slot.style.zIndex = String(Math.round(t * 100))
    })
    requestAnimationFrame(layoutCarousel)
  }

  requestAnimationFrame(layoutCarousel)

  window.addEventListener('hashchange', () => {
    disposed = true
    window.clearInterval(poll)
    if (frameTimeout !== null) window.clearTimeout(frameTimeout)
    liveSource?.close()
  }, { once: true })
}

function buildLiveStreamUrl(runId: string, baseUrl: string | null): string {
  return new URL(`/runs/${encodeURIComponent(runId)}/stream`, baseUrl ?? DEFAULT_LIVE_STREAM_BASE_URL).toString()
}

function readEventPayload(event: Event): unknown {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return null

  try {
    const payload: unknown = JSON.parse(event.data)
    return payload
  } catch {
    return null
  }
}

function parseLiveFrameEvent(value: unknown): LiveFrameEvent | null {
  if (!isRecord(value)) return null
  const mimeType = value.mimeType === 'image/jpeg' ? value.mimeType : null
  const data = readString(value.data)
  const width = readNumber(value.width)
  const height = readNumber(value.height)
  if (!mimeType || !data || width === null || height === null) return null
  return { mimeType, data, width, height }
}

function parseLiveActionEvent(value: unknown): LiveActionEvent | null {
  if (!isRecord(value)) return null
  const message = readString(value.message)
  if (!message) return null
  return {
    message,
    x: readNullableNumber(value.x),
    y: readNullableNumber(value.y),
    endX: readNullableNumber(value.endX),
    endY: readNullableNumber(value.endY),
    click: value.click === true,
    isError: value.isError === true,
  }
}

function readStatusMessage(value: unknown): string | null {
  if (!isRecord(value)) return null
  return readString(value.message)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNullableNumber(value: unknown): number | null {
  return value === null ? null : readNumber(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
