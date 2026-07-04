// ── Page 2 : Computer Use live playtest ──

const STEPS = [
  { t:  700, action: 'click',   label: 'Clicked "Start"',               cx: 50, cy: 75, lane: 1 },
  { t: 1500, action: 'move',    label: 'Dodged obstacle — moved left',   cx: 28, cy: 72, lane: 0 },
  { t: 2300, action: 'move',    label: 'Back to center',                 cx: 50, cy: 72, lane: 1 },
  { t: 3100, action: 'move',    label: 'Obstacle incoming — right lane', cx: 72, cy: 72, lane: 2 },
  { t: 3900, action: 'click',   label: 'Picked up bonus',                cx: 72, cy: 58, lane: 2 },
  { t: 4700, action: 'move',    label: 'Sharp dodge — back left',        cx: 28, cy: 72, lane: 0 },
  { t: 5500, action: 'move',    label: 'Center — clear road',            cx: 50, cy: 72, lane: 1 },
  { t: 6300, action: 'move',    label: 'Right to avoid barrier',         cx: 72, cy: 72, lane: 2 },
  { t: 7100, action: 'click',   label: 'Triggered boost',                cx: 72, cy: 50, lane: 2 },
  { t: 7900, action: 'observe', label: 'Analysing fun loop…',            cx: 50, cy: 50, lane: 1 },
]

const REPORT = [
  { icon: '✅', label: 'Playability',  value: '9 / 10', note: 'Controls responsive, no crash' },
  { icon: '⚡', label: 'Fun loop',     value: 'Strong',  note: 'Risk/reward clear, dodges satisfying' },
  { icon: '🔍', label: 'Friction pts', value: '2',       note: 'Tutorial skip confusing, shop UX weak' },
  { icon: '📈', label: 'Engagement',   value: 'High',    note: 'Agent replayed 3× without prompt' },
  { icon: '🎯', label: 'Verdict',      value: 'Ship it', note: 'Proceed to creative generation' },
]

interface GameState {
  carLane: number
  carX: number
  roadOffset: number
  obstacles: { lane: number; y: number; hit: boolean }[]
  bonuses: { lane: number; y: number; picked: boolean }[]
  score: number
  boost: boolean
  boostTimer: number
}

// Portrait canvas: 270×480 (9:16)
const CANVAS_W = 270
const CANVAS_H = 480
const LANES = [0.25, 0.50, 0.75]

let animFrame = 0
let gameState: GameState | null = null
let gameCanvas: HTMLCanvasElement | null = null
let gameCtx: CanvasRenderingContext2D | null = null

function startCarGame(canvas: HTMLCanvasElement) {
  gameCanvas = canvas
  gameCtx = canvas.getContext('2d')!
  gameState = {
    carLane: 1,
    carX: canvas.width * LANES[1],
    roadOffset: 0,
    obstacles: [],
    bonuses: [],
    score: 0,
    boost: false,
    boostTimer: 0,
  }
  for (let i = 0; i < 4; i++) {
    const lane = Math.floor(Math.random() * 3)
    gameState.obstacles.push({ lane, y: -80 - i * 120, hit: false })
  }
  gameState.bonuses.push({ lane: 2, y: -200, picked: false })
  gameState.bonuses.push({ lane: 0, y: -550, picked: false })
  tickGame()
}

function tickGame() {
  if (!gameCanvas || !gameCtx || !gameState) return
  animFrame = requestAnimationFrame(tickGame)

  const ctx = gameCtx
  const gs  = gameState
  const w = gameCanvas.width, h = gameCanvas.height
  const speed = gs.boost ? 5 : 3

  const targetX = w * LANES[gs.carLane]
  gs.carX += (targetX - gs.carX) * 0.12

  gs.roadOffset = (gs.roadOffset + speed) % 60

  // Move + deflect obstacles
  const carY = h * 0.75
  for (const ob of gs.obstacles) {
    ob.y += speed
    if (!ob.hit && ob.lane === gs.carLane && ob.y > carY - 80 && ob.y < carY + 10) {
      const free = [0, 1, 2].filter(l => l !== gs.carLane)
      ob.lane = free[Math.floor(Math.random() * free.length)]
    }
  }
  for (const ob of gs.obstacles) {
    if (ob.y > h + 30) {
      ob.y = -100 - Math.random() * 180
      const safe = [0, 1, 2].filter(l => l !== gs.carLane)
      ob.lane = safe[Math.floor(Math.random() * safe.length)]
      ob.hit = false
    }
  }
  for (const bn of gs.bonuses) bn.y += speed

  gs.score += gs.boost ? 2 : 1
  if (gs.boost) { gs.boostTimer--; if (gs.boostTimer <= 0) gs.boost = false }

  // ── Draw ──
  ctx.clearRect(0, 0, w, h)

  // bg
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, w, h)

  // road
  const roadL = w * 0.06, roadR = w * 0.94
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(roadL, 0, roadR - roadL, h)

  // road edges
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(roadL, 0); ctx.lineTo(roadL, h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(roadR, 0); ctx.lineTo(roadR, h); ctx.stroke()

  // lane dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1.2
  ctx.setLineDash([24, 24])
  ctx.lineDashOffset = -gs.roadOffset
  for (const pct of [0.375, 0.625]) {
    const lx = w * pct
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke()
  }
  ctx.setLineDash([])

  // boost streaks
  if (gs.boost) {
    ctx.strokeStyle = 'rgba(37,99,235,0.2)'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      const lx = roadL + 10 + Math.random() * (roadR - roadL - 20)
      const ly = (gs.roadOffset * 3 + i * 50) % h
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 28); ctx.stroke()
    }
  }

  // obstacles (red cars)
  for (const ob of gs.obstacles) {
    if (ob.hit) continue
    const ox = w * LANES[ob.lane]
    ctx.save()
    ctx.fillStyle = 'rgba(239,68,68,0.92)'
    ctx.shadowColor = 'rgba(239,68,68,0.5)'; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.roundRect(ox - 13, ob.y - 26, 26, 20, 3); ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(ox - 9, ob.y - 23, 18, 9)
    // brake lights
    ctx.fillStyle = 'rgba(255,100,100,0.9)'
    ctx.fillRect(ox - 13, ob.y - 6, 5, 3)
    ctx.fillRect(ox + 8,  ob.y - 6, 5, 3)
    ctx.restore()
  }

  // bonuses (diamonds)
  for (const bn of gs.bonuses) {
    if (bn.picked) continue
    const bx = w * LANES[bn.lane]
    ctx.save()
    ctx.fillStyle = 'rgba(37,99,235,0.9)'
    ctx.shadowColor = 'rgba(37,99,235,0.7)'; ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(bx, bn.y - 9); ctx.lineTo(bx + 7, bn.y)
    ctx.lineTo(bx, bn.y + 9); ctx.lineTo(bx - 7, bn.y)
    ctx.closePath(); ctx.fill()
    ctx.restore()
  }

  // player car (white/blue)
  ctx.save()
  ctx.shadowColor = gs.boost ? 'rgba(37,99,235,0.9)' : 'rgba(200,220,255,0.35)'
  ctx.shadowBlur  = gs.boost ? 18 : 6
  ctx.fillStyle   = '#e8f0ff'
  ctx.beginPath(); ctx.roundRect(gs.carX - 12, carY - 26, 24, 34, 3); ctx.fill()
  ctx.fillStyle = 'rgba(37,99,235,0.75)'
  ctx.beginPath(); ctx.roundRect(gs.carX - 8, carY - 22, 16, 12, 2); ctx.fill()
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(gs.carX - 14, carY - 4,  5, 8)
  ctx.fillRect(gs.carX + 9,  carY - 4,  5, 8)
  ctx.fillRect(gs.carX - 14, carY - 22, 5, 7)
  ctx.fillRect(gs.carX + 9,  carY - 22, 5, 7)
  if (gs.boost) {
    const grad = ctx.createLinearGradient(gs.carX, carY + 8, gs.carX, carY + 36)
    grad.addColorStop(0, 'rgba(37,99,235,0.65)'); grad.addColorStop(1, 'rgba(37,99,235,0)')
    ctx.fillStyle = grad
    ctx.fillRect(gs.carX - 5, carY + 8, 10, 28)
  }
  ctx.restore()

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '10px Inter, sans-serif'
  ctx.fillText('SCORE  ' + gs.score, 10, 16)
  if (gs.boost) {
    ctx.fillStyle = 'rgba(37,99,235,0.9)'; ctx.font = 'bold 10px Inter, sans-serif'
    ctx.fillText('⚡ BOOST', w / 2 - 20, 16)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = 'bold 10px Inter, sans-serif'
  ctx.fillText('SPEED DASH', w / 2 - 27, h - 8)
}

export function renderPlaytest(root: HTMLElement) {
  if (animFrame) cancelAnimationFrame(animFrame)

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
      </nav>

      <div class="playtest-layout">
        <div class="screen-wrap">
          <div class="screen-label">Computer Use — live session</div>

          <!-- iPhone frame -->
          <div class="iphone-frame">
            <div class="iphone-notch"></div>
            <div class="iphone-screen">
              <canvas id="fake-game" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
              <div class="cursor" id="cursor"></div>
              <div class="click-ring hidden" id="click-ring"></div>
            </div>
            <div class="iphone-home"></div>
          </div>

          <div class="screen-footer">
            <span class="live-dot"></span>
            <span id="action-label">Initialising agent…</span>
          </div>
        </div>

        <div class="side-panel">
          <div class="panel-section">
            <div class="panel-title">Agent log</div>
            <div class="log-list" id="log-list"></div>
          </div>
          <div class="panel-section" id="next-section" style="display:none">
            <button class="btn-generate" id="next-btn">
              <span class="btn-generate-icon">🎬</span>
              <span class="btn-generate-text">
                <span class="btn-generate-title">Generate creatives</span>
                <span class="btn-generate-sub">4 variants · Veo · Google Ads</span>
              </span>
              <span class="btn-generate-arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => { location.hash = '' })
  document.getElementById('next-btn')?.addEventListener('click', () => { location.hash = '#pipeline' })

  const cursor      = document.getElementById('cursor')!
  const clickRing   = document.getElementById('click-ring')!
  const actionLabel = document.getElementById('action-label')!
  const logList     = document.getElementById('log-list')!
  const nextSection = document.getElementById('next-section')!
  const canvas      = document.getElementById('fake-game') as HTMLCanvasElement

  startCarGame(canvas)

  function moveCursor(xPct: number, yPct: number) {
    cursor.style.left = xPct + '%'; cursor.style.top = yPct + '%'
  }
  function flashClick(xPct: number, yPct: number) {
    clickRing.style.left = xPct + '%'; clickRing.style.top = yPct + '%'
    clickRing.classList.remove('hidden')
    setTimeout(() => clickRing.classList.add('hidden'), 500)
  }
  function addLog(step: typeof STEPS[0]) {
    const el = document.createElement('div')
    el.className = 'log-entry'
    el.innerHTML = `<span class="log-icon">${iconFor(step.action)}</span><span class="log-text">${step.label}</span>`
    logList.appendChild(el)
    logList.scrollTop = logList.scrollHeight
  }

  STEPS.forEach((step) => {
    setTimeout(() => {
      moveCursor(step.cx, step.cy)
      actionLabel.textContent = step.label
      addLog(step)
      if (step.action === 'click') {
        flashClick(step.cx, step.cy)
        if (gameState && step.label.includes('boost')) { gameState.boost = true; gameState.boostTimer = 80 }
        if (gameState && step.label.includes('bonus')) {
          const bn = gameState.bonuses.find(b => !b.picked); if (bn) bn.picked = true
        }
      }
      if (gameState) gameState.carLane = step.lane
    }, step.t)
  })

  const lastT = STEPS[STEPS.length - 1].t
  setTimeout(() => {
    actionLabel.textContent = 'Session complete — ready to generate'
    nextSection.style.display = 'flex'
  }, lastT + 600)
}

function iconFor(action: string) {
  if (action === 'click')   return '🖱'
  if (action === 'move')    return '➤'
  if (action === 'observe') return '👁'
  return '•'
}
