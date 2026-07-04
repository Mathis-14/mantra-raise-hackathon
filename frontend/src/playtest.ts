// ── Page 2 : Computer Use live playtest ──

const STEPS = [
  { t:  800, action: 'click',   label: 'Clicked "Start game"',          x: 52, y: 58 },
  { t: 1600, action: 'move',    label: 'Moving player left',             x: 28, y: 71 },
  { t: 2400, action: 'click',   label: 'Tapped obstacle zone',          x: 44, y: 63 },
  { t: 3200, action: 'scroll',  label: 'Scrolled menu',                 x: 50, y: 50 },
  { t: 4000, action: 'click',   label: 'Triggered power-up',            x: 66, y: 44 },
  { t: 4800, action: 'move',    label: 'Dodged incoming obstacle',      x: 72, y: 68 },
  { t: 5600, action: 'click',   label: 'Reached checkpoint',            x: 50, y: 38 },
  { t: 6400, action: 'move',    label: 'Exploring right lane',          x: 80, y: 55 },
  { t: 7200, action: 'click',   label: 'Died — respawn triggered',      x: 50, y: 50 },
  { t: 8000, action: 'observe', label: 'Analysing fun loop…',           x: 50, y: 50 },
]

const REPORT = [
  { icon: '✅', label: 'Playability',   value: '9 / 10',  note: 'Controls responsive, no crash' },
  { icon: '⚡', label: 'Fun loop',      value: 'Strong',  note: 'Clear risk / reward, satisfying hits' },
  { icon: '🔍', label: 'Friction pts',  value: '2',       note: 'Tutorial skip confusing, shop UX weak' },
  { icon: '📈', label: 'Engagement',    value: 'High',    note: 'Agent replayed 3× without prompt' },
  { icon: '🎯', label: 'Verdict',       value: 'Ship it', note: 'Proceed to creative generation' },
]

export function renderPlaytest(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        <div class="breadcrumb">
          <span class="bc-done" data-href="#playtest">01 Playtest</span>
          <span class="bc-sep">›</span>
          <span class="bc-next">02 Pipeline</span>
        </div>
        <button class="btn-ghost-sm" id="back-btn">← Back</button>
      </nav>

      <div class="playtest-layout">
        <!-- LEFT: game screen + cursor overlay -->
        <div class="screen-wrap">
          <div class="screen-label">Computer Use — live session</div>
          <div class="screen" id="screen">
            <canvas id="fake-game" width="480" height="320"></canvas>
            <div class="cursor" id="cursor"></div>
            <div class="click-ring hidden" id="click-ring"></div>
          </div>
          <div class="screen-footer">
            <span class="live-dot"></span>
            <span id="action-label">Initialising agent…</span>
          </div>
        </div>

        <!-- RIGHT: log + report -->
        <div class="side-panel">
          <div class="panel-section">
            <div class="panel-title">Agent log</div>
            <div class="log-list" id="log-list"></div>
          </div>
          <div class="panel-section" id="report-section" style="display:none">
            <div class="panel-title">Playtest report</div>
            <div class="report-list" id="report-list"></div>
            <button class="btn-primary btn-full" id="next-btn">Generate creatives →</button>
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
  const fakeGame    = document.getElementById('fake-game') as HTMLCanvasElement

  drawFakeGame(fakeGame)

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
    el.className = 'log-entry log-in'
    el.innerHTML = `
      <span class="log-icon ${step.action}">${iconFor(step.action)}</span>
      <span class="log-text">${step.label}</span>
    `
    logList.appendChild(el)
    logList.scrollTop = logList.scrollHeight
  }

  STEPS.forEach((step) => {
    setTimeout(() => {
      moveCursor(step.x, step.y)
      actionLabel.textContent = step.label
      addLog(step)
      if (step.action === 'click') flashClick(step.x, step.y)
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
  if (action === 'scroll')  return '↕'
  if (action === 'observe') return '👁'
  return '•'
}

function drawFakeGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width, h = canvas.height

  // background
  ctx.fillStyle = '#0d1117'
  ctx.fillRect(0, 0, w, h)

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
  for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }

  // platforms
  const platforms = [[60,220,120,10],[200,180,100,10],[340,240,100,10],[420,160,80,10],[100,140,80,10]]
  ctx.fillStyle = '#2563eb'
  for (const [px,py,pw,ph] of platforms) { ctx.fillRect(px,py,pw,ph) }

  // obstacles
  ctx.fillStyle = 'rgba(239,68,68,0.8)'
  ctx.fillRect(260, 165, 18, 18)
  ctx.fillRect(370, 225, 18, 18)

  // player
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(130, 205, 9, 0, Math.PI * 2); ctx.fill()

  // score UI
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '11px Inter, sans-serif'
  ctx.fillText('SCORE  1240', 14, 20)
  ctx.fillText('LIVES  ♥♥♥', 360, 20)

  // title
  ctx.fillStyle = 'rgba(37,99,235,0.7)'
  ctx.font = 'bold 13px Inter, sans-serif'
  ctx.fillText('HYPER DASH', 180, 20)
}
