// ── Page 2 : Computer Use — 5 parallel sessions ──
import { SESSIONS, GAME_FNS } from './games'

const CW = 160
const CH = 284
const DURATION = 10000
const START_OFFSETS = [0, 900, 400, 1300, 600]

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
          <span>4 sessions running</span>
        </div>
      </nav>

      <div class="playtest-body">
        <div class="carousel-scene">
          <div class="carousel-track" id="carousel-track">
            ${SESSIONS.map(s => `
              <div class="phone-slot" id="slot-${s.id}">
                <div class="phone-device">
                  <div class="phone-edge"></div>
                  <div class="iphone-frame">
                    <div class="iphone-notch"></div>
                    <div class="iphone-screen">
                      <canvas id="canvas-${s.id}" width="${CW}" height="${CH}"></canvas>
                    </div>
                    <div class="iphone-home"></div>
                  </div>
                </div>
                <div class="phone-meta" id="meta-${s.id}">
                  <span class="phone-title" style="color:${s.color}">${s.title}</span>
                  <div class="phone-progress-wrap">
                    <div class="phone-progress-bar" id="prog-${s.id}" style="background:${s.color};width:0%"></div>
                  </div>
                  <span class="phone-pct" id="pct-${s.id}">0%</span>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn-generate btn-generate--corner" id="next-btn" style="opacity:0;pointer-events:none;transition:opacity 0.6s">
            <span class="btn-generate-title">Generate creatives</span>
            <span class="btn-generate-arrow">→</span>
          </button>
        </div>

        <aside class="logs-panel">
          <div class="logs-title">Agent activity</div>
          ${SESSIONS.map(s => `
            <div class="log-group">
              <div class="log-group-head">
                <span class="log-dot" style="background:${s.color}"></span>
                <span class="log-group-name">${s.title}</span>
                <span class="log-group-pct" id="logpct-${s.id}" style="color:${s.color}">0%</span>
              </div>
              <div class="log-lines" id="logs-${s.id}"></div>
            </div>
          `).join('')}
        </aside>
      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => { location.hash = '' })
  document.getElementById('next-btn')?.addEventListener('click', () => { location.hash = '#pipeline' })

  const cta     = document.getElementById('next-btn') as HTMLElement
  const badge   = document.getElementById('session-badge') as HTMLElement
  const progBars = SESSIONS.map(s => document.getElementById('prog-' + s.id) as HTMLElement)
  const progPcts = SESSIONS.map(s => document.getElementById('pct-' + s.id) as HTMLElement)
  const logPcts  = SESSIONS.map(s => document.getElementById('logpct-' + s.id) as HTMLElement)
  const logBoxes = SESSIONS.map(s => document.getElementById('logs-' + s.id) as HTMLElement)

  const ticks = SESSIONS.map(s => {
    const canvas = document.getElementById('canvas-' + s.id) as HTMLCanvasElement
    return GAME_FNS[s.id](canvas)
  })

  // Per-game log lines that appear over time
  const LOG_POOL: Record<number, string[]> = {
    0: ['Detected lane-based controls', 'Dodged obstacle at 1.2s', 'Recovered center lane', 'Sustained combo x4', 'Fun loop: tight, responsive'],
    1: ['Paddle physics detected', 'Cleared brick row 1', 'Ball speed increasing', 'Combo bounce x3', 'Verdict: satisfying feedback'],
    2: ['Gravity + jump detected', 'Chained 3 platforms', 'Near-miss recovery', 'Vertical progression good', 'Loop: challenging but fair'],
    3: ['Grid movement detected', 'Ate food +1', 'Avoided self-collision', 'Length growing steadily', 'Verdict: classic, addictive'],
    4: ['Ship orbit detected', 'Destroyed asteroid', 'Auto-fire cadence good', 'Dodged debris cluster', 'Loop: high-tension, fun'],
  }
  const logIdx = [0, 0, 0, 0, 0]

  const startTime = performance.now()
  let ctaShown = false

  // Circular carousel seen from above: phones ride a horizontal ring.
  //   angle θ per phone = base offset + time
  //   x = sin θ · radius      → horizontal travel
  //   depth = cos θ (1 front … -1 back) → drives scale + opacity, no wrap/teleport
  const slots = SESSIONS.map(s => document.getElementById('slot-' + s.id)!)
  const N = SESSIONS.length
  const RADIUS = 390           // px — horizontal spread of the ring (1.5×)
  const SCENE_ROT_SPEED = 0.00035  // rad/ms — slow continuous loop

  function layoutCarousel(theta: number) {
    slots.forEach((slot, i) => {
      const a = theta + (i / N) * Math.PI * 2
      const x = Math.sin(a) * RADIUS
      const depth = Math.cos(a)                 // 1 = front, -1 = back
      const t = (depth + 1) / 2                  // 0 back … 1 front
      const scale = 0.9 + t * 0.6                // 0.9 back → 1.5 front (1.5×)
      slot.style.transform = `translateX(${x.toFixed(2)}px) scale(${scale.toFixed(3)})`
      slot.style.zIndex = String(Math.round(t * 100))
      slot.style.transition = 'none'             // JS drives every frame; no CSS lag
    })
  }

  function frame(now: number) {
    requestAnimationFrame(frame)

    const theta = (now - startTime) * SCENE_ROT_SPEED
    layoutCarousel(theta)

    // Games
    ticks.forEach(t => t())

    // Progress
    const elapsed = now - startTime
    let allDone = true
    SESSIONS.forEach((s, i) => {
      const p = Math.min(100, Math.max(0, ((elapsed - START_OFFSETS[i]) / DURATION) * 100))
      if (p < 100) allDone = false
      progBars[i].style.width = p + '%'
      const label = p >= 100 ? '✓' : Math.floor(p) + '%'
      progPcts[i].textContent = label
      logPcts[i].textContent  = label
      if (p >= 100) progPcts[i].style.color = s.color

      // Emit log lines as progress crosses thresholds
      const wantLines = Math.floor((p / 100) * LOG_POOL[i].length)
      while (logIdx[i] < wantLines) {
        const line = document.createElement('div')
        line.className = 'log-line'
        line.textContent = LOG_POOL[i][logIdx[i]]
        logBoxes[i].appendChild(line)
        logIdx[i]++
      }
    })

    if (allDone && !ctaShown) {
      ctaShown = true
      cta.style.opacity = '1'
      cta.style.pointerEvents = 'auto'
      badge.innerHTML = '<span style="color:var(--accent);font-weight:600;font-size:13px">✓ All sessions complete</span>'
    }
  }

  requestAnimationFrame(frame)
}
