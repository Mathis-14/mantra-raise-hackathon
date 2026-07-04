// ── Page 2 : Computer Use live playtest ──

// Steps define agent actions + where the car moves (lane 0=left 1=mid 2=right)
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

// ── Animated car game ──
interface GameState {
  carLane: number       // 0 left / 1 mid / 2 right
  carX: number          // actual pixel x (smooth)
  roadOffset: number    // scrolling road lines
  obstacles: { lane: number; y: number; hit: boolean }[]
  bonuses: { lane: number; y: number; picked: boolean }[]
  score: number
  boost: boolean
  boostTimer: number
}

const LANES = [0.28, 0.50, 0.72]  // as % of canvas width

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

  // Pre-seed some obstacles + bonuses
  for (let i = 0; i < 4; i++) {
    const lane = Math.floor(Math.random() * 3)
    gameState.obstacles.push({ lane, y: -80 - i * 130, hit: false })
  }
  gameState.bonuses.push({ lane: 2, y: -220, picked: false })
  gameState.bonuses.push({ lane: 0, y: -600, picked: false })

  tickGame()
}

function tickGame() {
  if (!gameCanvas || !gameCtx || !gameState) return
  animFrame = requestAnimationFrame(tickGame)

  const ctx = gameCtx
  const gs  = gameState
  const w = gameCanvas.width, h = gameCanvas.height
  const speed = gs.boost ? 5 : 3

  // Smooth car x toward target lane
  const targetX = w * LANES[gs.carLane]
  gs.carX += (targetX - gs.carX) * 0.12

  // Scroll road
  gs.roadOffset = (gs.roadOffset + speed) % 60

  // Move obstacles
  for (const ob of gs.obstacles) ob.y += speed
  // Recycle off-screen
  for (const ob of gs.obstacles) {
    if (ob.y > h + 30) { ob.y = -100 - Math.random() * 200; ob.lane = Math.floor(Math.random() * 3); ob.hit = false }
  }
  for (const bn of gs.bonuses) bn.y += speed

  // Score
  gs.score += gs.boost ? 2 : 1

  // Boost timer
  if (gs.boost) { gs.boostTimer--; if (gs.boostTimer <= 0) gs.boost = false }

  // ── Draw ──
  ctx.clearRect(0, 0, w, h)

  // Sky / bg
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, w, h)

  // Road surface
  const roadL = w * 0.12, roadR = w * 0.88
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(roadL, 0, roadR - roadL, h)

  // Road edges
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(roadL, 0); ctx.lineTo(roadL, h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(roadR, 0); ctx.lineTo(roadR, h); ctx.stroke()

  // Lane dividers (dashed, scrolling)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([30, 30])
  ctx.lineDashOffset = -gs.roadOffset
  for (const pct of [0.39, 0.61]) {
    const lx = w * pct
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke()
  }
  ctx.setLineDash([])

  // Road speed lines (boost effect)
  if (gs.boost) {
    ctx.strokeStyle = 'rgba(37,99,235,0.18)'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const lx = roadL + 20 + Math.random() * (roadR - roadL - 40)
      const ly = (gs.roadOffset * 3 + i * 55) % h
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 30); ctx.stroke()
    }
  }

  // Obstacles (red blocks)
  for (const ob of gs.obstacles) {
    if (ob.hit) continue
    const ox = w * LANES[ob.lane]
    ctx.save()
    ctx.fillStyle = 'rgba(239,68,68,0.9)'
    ctx.shadowColor = 'rgba(239,68,68,0.5)'
    ctx.shadowBlur = 10
    ctx.fillRect(ox - 16, ob.y - 28, 32, 22)
    // windshield
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(ox - 11, ob.y - 24, 22, 10)
    ctx.restore()
  }

  // Bonuses (blue diamonds)
  for (const bn of gs.bonuses) {
    if (bn.picked) continue
    const bx = w * LANES[bn.lane]
    ctx.save()
    ctx.fillStyle = 'rgba(37,99,235,0.9)'
    ctx.shadowColor = 'rgba(37,99,235,0.7)'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(bx, bn.y - 10)
    ctx.lineTo(bx + 8, bn.y)
    ctx.lineTo(bx, bn.y + 10)
    ctx.lineTo(bx - 8, bn.y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // Car (white/blue)
  const carY = h * 0.72
  ctx.save()
  ctx.shadowColor = gs.boost ? 'rgba(37,99,235,0.9)' : 'rgba(200,220,255,0.4)'
  ctx.shadowBlur = gs.boost ? 20 : 8
  // body
  ctx.fillStyle = '#e8f0ff'
  ctx.beginPath()
  ctx.roundRect(gs.carX - 14, carY - 28, 28, 38, 4)
  ctx.fill()
  // cabin
  ctx.fillStyle = 'rgba(37,99,235,0.7)'
  ctx.beginPath()
  ctx.roundRect(gs.carX - 9, carY - 24, 18, 14, 3)
  ctx.fill()
  // wheels
  ctx.fillStyle = '#1a1f2e'
  ctx.fillRect(gs.carX - 16, carY - 6, 6, 10)
  ctx.fillRect(gs.carX + 10, carY - 6, 6, 10)
  ctx.fillRect(gs.carX - 16, carY - 24, 6, 8)
  ctx.fillRect(gs.carX + 10, carY - 24, 6, 8)
  // boost glow trail
  if (gs.boost) {
    const grad = ctx.createLinearGradient(gs.carX, carY + 10, gs.carX, carY + 40)
    grad.addColorStop(0, 'rgba(37,99,235,0.6)')
    grad.addColorStop(1, 'rgba(37,99,235,0)')
    ctx.fillStyle = grad
    ctx.fillRect(gs.carX - 6, carY + 10, 12, 30)
  }
  ctx.restore()

  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '11px Inter, sans-serif'
  ctx.fillText('SCORE  ' + gs.score, 14, 20)
  if (gs.boost) {
    ctx.fillStyle = 'rgba(37,99,235,0.9)'
    ctx.font = 'bold 11px Inter, sans-serif'
    ctx.fillText('⚡ BOOST', w / 2 - 25, 20)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = 'bold 12px Inter, sans-serif'
  ctx.fillText('SPEED DASH', w / 2 - 32, h - 10)
}

export function renderPlaytest(root: HTMLElement) {
  if (animFrame) cancelAnimationFrame(animFrame)

  root.innerHTML = `
    <div class="shell">
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        <div class="breadcrumb">
          <span class="bc-done">01 Playtest</span>
          <span class="bc-sep">›</span>
          <span class="bc-next">02 Pipeline</span>
        </div>
        <button class="btn-ghost-sm" id="back-btn">← Back</button>
      </nav>

      <div class="playtest-layout">
        <div class="screen-wrap">
          <div class="screen-label">Computer Use — live session</div>
          <div class="screen" id="screen">
            <canvas id="fake-game" width="480" height="300"></canvas>
            <div class="cursor" id="cursor"></div>
            <div class="click-ring hidden" id="click-ring"></div>
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
          <div class="panel-section" id="report-section" style="display:none">
            <div class="panel-title">Playtest report</div>
            <div class="report-list" id="report-list"></div>
            <button class="btn btn-primary btn-full" id="next-btn">Generate creatives →</button>
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
  const reportSec   = document.getElementById('report-section')!
  const reportList  = document.getElementById('report-list')!
  const canvas      = document.getElementById('fake-game') as HTMLCanvasElement

  startCarGame(canvas)

  function moveCursor(xPct: number, yPct: number) {
    cursor.style.left = xPct + '%'
    cursor.style.top  = yPct + '%'
  }

  function flashClick(xPct: number, yPct: number) {
    clickRing.style.left = xPct + '%'
    clickRing.style.top  = yPct + '%'
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
          const bn = gameState.bonuses.find(b => !b.picked)
          if (bn) bn.picked = true
        }
      }
      if (gameState) gameState.carLane = step.lane
    }, step.t)
  })

  const lastT = STEPS[STEPS.length - 1].t
  setTimeout(() => {
    actionLabel.textContent = 'Session complete — generating report'
    reportSec.style.display = 'flex'
    REPORT.forEach((r, i) => {
      setTimeout(() => {
        const el = document.createElement('div')
        el.className = 'report-row'
        el.innerHTML = `
          <span class="r-icon">${r.icon}</span>
          <span class="r-label">${r.label}</span>
          <span class="r-value">${r.value}</span>
          <span class="r-note">${r.note}</span>
        `
        reportList.appendChild(el)
      }, i * 180)
    })
  }, lastT + 600)
}

function iconFor(action: string) {
  if (action === 'click')   return '🖱'
  if (action === 'move')    return '➤'
  if (action === 'observe') return '👁'
  return '•'
}
