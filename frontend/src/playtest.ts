// Page 2: original playable phone + four pending variant phones.
import currentGameHtml from '../../game/mob-control-clone.html?raw'

const DURATION = 10000
const START_OFFSETS = [0, 900, 400, 1300, 600]

type PhoneStatus = 'live' | 'pending'

interface PlayablePhone {
  id: number
  title: string
  color: string
  status: PhoneStatus
  source: string | null
}

const PHONES: PlayablePhone[] = [
  { id: 0, title: 'Original', color: '#2563eb', status: 'live', source: currentGameHtml },
  { id: 1, title: 'Variant 1', color: '#0891b2', status: 'pending', source: null },
  { id: 2, title: 'Variant 2', color: '#7c3aed', status: 'pending', source: null },
  { id: 3, title: 'Variant 3', color: '#059669', status: 'pending', source: null },
  { id: 4, title: 'Variant 4', color: '#d97706', status: 'pending', source: null },
]

const LOG_POOL: Record<number, string[]> = {
  0: [
    'Original game loaded',
    'Playable in lead phone',
    'Baseline ready for Computer Use',
    'Waiting for generated variants',
    'Ready to compare hypotheses',
  ],
  1: [
    'Variant slot reserved',
    'Waiting for game_html',
    'Will render playable HTML',
    'No mock gameplay displayed',
    'Ready for variant branch',
  ],
  2: [
    'Variant slot reserved',
    'Waiting for game_html',
    'Will render playable HTML',
    'No mock gameplay displayed',
    'Ready for variant branch',
  ],
  3: [
    'Variant slot reserved',
    'Waiting for game_html',
    'Will render playable HTML',
    'No mock gameplay displayed',
    'Ready for variant branch',
  ],
  4: [
    'Variant slot reserved',
    'Waiting for game_html',
    'Will render playable HTML',
    'No mock gameplay displayed',
    'Ready for variant branch',
  ],
}

export function renderPlaytest(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <button class="back-fab" id="back-btn" title="Back">←</button>
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        <div class="breadcrumb">
          <span class="bc-done">01 Playtest</span>
          <span class="bc-sep">›</span>
          <span class="bc-next">02 Pipeline</span>
        </div>
        <div class="session-badge" id="session-badge">
          <span class="live-dot"></span>
          <span>Original live · 4 variants pending</span>
        </div>
      </nav>

      <div class="playtest-body">
        <div class="carousel-scene">
          <div class="carousel-track" id="carousel-track">
            ${PHONES.map(phone => `
              <div class="phone-slot" id="slot-${phone.id}">
                <div class="phone-device">
                  <div class="phone-edge"></div>
                  <div class="iphone-frame">
                    <div class="iphone-notch"></div>
                    <div class="iphone-screen phone-screen--${phone.status}" id="screen-${phone.id}">
                      ${phone.source
                        ? `<iframe id="game-${phone.id}" class="phone-game-frame" title="${phone.title}" sandbox="allow-scripts allow-same-origin allow-pointer-lock"></iframe>`
                        : `
                          <div class="phone-pending">
                            <span class="pending-kicker">Pending</span>
                            <span class="pending-title">Variant HTML</span>
                            <span class="pending-copy">Awaiting generated gameplay</span>
                          </div>
                        `}
                    </div>
                    <div class="iphone-home"></div>
                  </div>
                </div>
                <div class="phone-meta" id="meta-${phone.id}">
                  <span class="phone-title" style="color:${phone.color}">${phone.title}</span>
                  <div class="phone-progress-wrap">
                    <div class="phone-progress-bar" id="prog-${phone.id}" style="background:${phone.color};width:${phone.status === 'live' ? '100%' : '0%'}"></div>
                  </div>
                  <span class="phone-pct" id="pct-${phone.id}">${phone.status === 'live' ? 'Live' : 'Pending'}</span>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn-generate btn-generate--corner" id="send-agent-btn" style="opacity:1;pointer-events:auto;transition:opacity 0.6s">
            <span class="btn-generate-title">Send agent</span>
            <span class="btn-generate-arrow">→</span>
          </button>
        </div>

        <aside class="logs-panel">
          <div class="logs-title">Agent activity</div>
          ${PHONES.map(phone => `
            <div class="log-group">
              <div class="log-group-head">
                <span class="log-dot" style="background:${phone.color}"></span>
                <span class="log-group-name">${phone.title}</span>
                <span class="log-group-pct" id="logpct-${phone.id}" style="color:${phone.color}">${phone.status === 'live' ? 'Live' : 'Pending'}</span>
              </div>
              <div class="log-lines" id="logs-${phone.id}"></div>
            </div>
          `).join('')}
        </aside>
      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => { location.hash = '' })
  const sendAgentBtn = document.getElementById('send-agent-btn') as HTMLButtonElement

  PHONES.forEach(phone => {
    if (!phone.source) return
    const frame = document.getElementById('game-' + phone.id) as HTMLIFrameElement | null
    if (frame) frame.srcdoc = phone.source
  })

  const progBars = PHONES.map(phone => document.getElementById('prog-' + phone.id) as HTMLElement)
  const logBoxes = PHONES.map(phone => document.getElementById('logs-' + phone.id) as HTMLElement)
  const logIdx = [0, 0, 0, 0, 0]

  const startTime = performance.now()
  let rotationStartTime = startTime
  let agentRunning = false

  // Circular carousel seen from above. Slot 0 starts at depth=1, so Original is
  // the lead phone when the screen opens.
  const slots = PHONES.map(phone => document.getElementById('slot-' + phone.id)!)
  const N = PHONES.length
  const RADIUS = 390
  const SCENE_ROT_SPEED = 0.00028

  function addLog(phoneId: number, text: string) {
    const line = document.createElement('div')
    line.className = 'log-line'
    line.textContent = text
    logBoxes[phoneId].appendChild(line)
    logBoxes[phoneId].scrollTop = logBoxes[phoneId].scrollHeight
  }

  function dispatchPointer(
    target: EventTarget,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    x: number,
    y: number,
  ) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x,
      clientY: y,
      buttons: type === 'pointerup' ? 0 : 1,
    }))
  }

  function runAgent() {
    if (agentRunning) return
    agentRunning = true
    rotationStartTime = performance.now()
    sendAgentBtn.disabled = true
    sendAgentBtn.querySelector('.btn-generate-title')!.textContent = 'Agent playing'

    const frame = document.getElementById('game-0') as HTMLIFrameElement | null
    const doc = frame?.contentDocument
    const win = frame?.contentWindow
    const canvas = doc?.querySelector('#game canvas, canvas') as HTMLCanvasElement | null
    const startBtn = doc?.getElementById('startBtn') as HTMLButtonElement | null

    if (!doc || !win || !canvas || !startBtn) {
      addLog(0, 'Agent could not access game frame')
      sendAgentBtn.disabled = false
      sendAgentBtn.querySelector('.btn-generate-title')!.textContent = 'Send agent'
      agentRunning = false
      return
    }

    addLog(0, 'Agent clicked play')
    startBtn.click()

    const lanes = [0.5, 0.25, 0.75, 0.38, 0.64, 0.18, 0.82, 0.5]
    let step = 0

    window.setTimeout(() => {
      const rect = canvas.getBoundingClientRect()
      const y = rect.top + rect.height * 0.72
      dispatchPointer(canvas, 'pointerdown', rect.left + rect.width * lanes[0], y)
      addLog(0, 'Agent holds fire and starts steering')

      const steer = window.setInterval(() => {
        const nextRect = canvas.getBoundingClientRect()
        const x = nextRect.left + nextRect.width * lanes[step % lanes.length]
        const nextY = nextRect.top + nextRect.height * 0.72
        dispatchPointer(canvas, 'pointermove', x, nextY)
        if (step % 2 === 0) addLog(0, `Agent steers ${x < nextRect.left + nextRect.width / 2 ? 'left' : 'right'}`)
        step++

        if (step >= 18) {
          window.clearInterval(steer)
          dispatchPointer(win, 'pointerup', x, nextY)
          addLog(0, 'Agent play pass complete')
          sendAgentBtn.disabled = false
          sendAgentBtn.querySelector('.btn-generate-title')!.textContent = 'Send agent'
          agentRunning = false
        }
      }, 520)
    }, 300)
  }

  sendAgentBtn.addEventListener('click', runAgent)

  function layoutCarousel(theta: number) {
    slots.forEach((slot, i) => {
      const a = theta + (i / N) * Math.PI * 2
      const x = Math.sin(a) * RADIUS
      const depth = Math.cos(a)
      const t = (depth + 1) / 2
      const scale = 0.9 + t * 0.6
      slot.style.transform = `translateX(${x.toFixed(2)}px) scale(${scale.toFixed(3)})`
      slot.style.zIndex = String(Math.round(t * 100))
      slot.style.transition = 'none'
    })
  }

  function frame(now: number) {
    requestAnimationFrame(frame)

    const theta = (now - rotationStartTime) * SCENE_ROT_SPEED
    layoutCarousel(theta)

    const elapsed = now - startTime
    PHONES.forEach((phone, i) => {
      const p = phone.status === 'live'
        ? 100
        : Math.min(100, Math.max(0, ((elapsed - START_OFFSETS[i]) / DURATION) * 100))
      progBars[i].style.width = p + '%'

      const wantLines = Math.floor((p / 100) * LOG_POOL[i].length)
      while (logIdx[i] < wantLines) {
        const line = document.createElement('div')
        line.className = 'log-line'
        line.textContent = LOG_POOL[i][logIdx[i]]
        logBoxes[i].appendChild(line)
        logIdx[i]++
      }
    })
  }

  requestAnimationFrame(frame)
}
