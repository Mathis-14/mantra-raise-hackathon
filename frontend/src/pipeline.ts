// ── Page 3 : Creative pipeline ──
import { SESSIONS, GAME_FNS } from './games'

// One creative per game session, with simulated ad metrics + keep/kill verdict.
interface Variant {
  id: number
  hook: string       // creative angle
  ctr: string
  cpi: string
  retention: string
  status: 'keep' | 'kill'
}

const VARIANTS: Variant[] = [
  { id: 0, hook: 'Lane-swap tension',  ctr: '4.6%', cpi: '$0.42', retention: '38%', status: 'keep' },
  { id: 1, hook: 'Brick-break combo',  ctr: '3.1%', cpi: '$0.61', retention: '29%', status: 'keep' },
  { id: 2, hook: 'One-more-jump loop', ctr: '5.3%', cpi: '$0.37', retention: '44%', status: 'keep' },
  { id: 3, hook: 'Classic nostalgia',  ctr: '1.8%', cpi: '$0.94', retention: '21%', status: 'kill' },
  { id: 4, hook: 'Bullet-hell rush',   ctr: '4.0%', cpi: '$0.48', retention: '35%', status: 'keep' },
]

const PIPELINE_NODES = [
  { id: 'variants', icon: '🎮', label: 'Variant generation',  sub: '5 game variants mutated from original' },
  { id: 'veo',      icon: '🎬', label: 'Video gen (Veo)',      sub: '5 × 9:16 ad creatives rendered' },
  { id: 'deploy',   icon: '📤', label: 'Deploy to Google Ads', sub: 'Creatives pushed to campaign stub' },
  { id: 'metrics',  icon: '📊', label: 'Metrics ingestion',    sub: 'CTR · CPI · retention — simulated' },
  { id: 'decide',   icon: '🧠', label: 'Keep / Kill decision', sub: 'Agent scores and ranks variants' },
]

// vertical 9:16 preview canvas size
const VW = 132
const VH = 234

export function renderPipeline(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        <div class="breadcrumb">
          <span class="bc-done" id="crumb-playtest">01 Playtest</span>
          <span class="bc-sep">›</span>
          <span class="bc-done active">02 Pipeline</span>
        </div>
        <div class="session-badge" id="pipe-badge">
          <span class="live-dot"></span>
          <span>Generating creatives…</span>
        </div>
      </nav>

      <div class="pipeline-layout">
        <div class="pipeline-col">
          <div class="col-title">Agent pipeline</div>
          <div class="pipe-nodes" id="pipe-nodes"></div>
        </div>

        <div class="pipeline-col pipeline-col--wide">
          <div class="col-title">Creatives · 9:16 ad videos</div>
          <div class="variants-grid" id="variants-grid"></div>
        </div>

        <div class="pipeline-col" id="rec-col" style="opacity:0;transition:opacity 0.5s">
          <div class="col-title">Agent recommendation</div>
          <div class="rec-card">
            <div class="rec-icon">🧠</div>
            <div class="rec-title">Build next: <span class="accent">Sky Hop × Speed Dash</span></div>
            <p class="rec-body">
              Sky Hop had the strongest attention signal (5.3% CTR, 44% D1 retention).
              Speed Dash held second on lane-swap tension. Merge the vertical
              one-more-jump loop with lane dodging for the next prototype.
            </p>
            <div class="rec-divider"></div>
            <div class="rec-row"><span>Kill</span><span class="tag tag--kill">Neon Snake</span></div>
            <div class="rec-row"><span>Scale</span><span class="tag tag--keep">Sky Hop + Speed Dash</span></div>
            <div class="rec-row"><span>Next build</span><span class="tag tag--next">Vertical Dash v2</span></div>
          </div>
        </div>
      </div>

      <button class="back-fab back-fab--corner" id="back-btn" title="Back to Playtest">←</button>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => { location.hash = '#playtest' })
  document.getElementById('crumb-playtest')!.addEventListener('click', () => { location.hash = '#playtest' })

  const pipeNodes    = document.getElementById('pipe-nodes')!
  const variantsGrid = document.getElementById('variants-grid')!
  const recCol       = document.getElementById('rec-col') as HTMLElement
  const badge        = document.getElementById('pipe-badge') as HTMLElement

  // Animate pipeline nodes in sequence
  PIPELINE_NODES.forEach((node, i) => {
    const el = document.createElement('div')
    el.className = 'pipe-node pipe-node--pending'
    el.id = 'node-' + node.id
    el.innerHTML = `
      <div class="pipe-icon">${node.icon}</div>
      <div class="pipe-info">
        <div class="pipe-label">${node.label}</div>
        <div class="pipe-sub">${node.sub}</div>
      </div>
      <div class="pipe-status" id="status-${node.id}"><span class="dot-pending">···</span></div>
    `
    pipeNodes.appendChild(el)

    setTimeout(() => {
      el.classList.remove('pipe-node--pending')
      el.classList.add('pipe-node--running')
      document.getElementById('status-' + node.id)!.innerHTML = '<span class="spinner"></span>'
    }, i * 900)

    setTimeout(() => {
      el.classList.remove('pipe-node--running')
      el.classList.add('pipe-node--done')
      document.getElementById('status-' + node.id)!.innerHTML = '<span class="check">✓</span>'
    }, i * 900 + 700)
  })

  // Live game ticks for creative previews
  const ticks: (() => void)[] = []

  // Variant cards appear after veo step, each running its real game loop
  VARIANTS.forEach((v, i) => {
    setTimeout(() => {
      const session = SESSIONS[v.id]
      const card = document.createElement('div')
      card.className = 'variant-card variant-card--in'
      card.innerHTML = `
        <div class="variant-preview" style="border-color:${session.color}55">
          <canvas id="vcanvas-${v.id}" width="${VW}" height="${VH}"></canvas>
          <div class="variant-badge variant-badge--${v.status}">${v.status === 'keep' ? 'Keep' : 'Kill'}</div>
          <div class="variant-duration">0:15</div>
          <div class="variant-rec">● REC</div>
        </div>
        <div class="variant-meta">
          <span class="variant-id" style="color:${session.color}">${session.title}</span>
          <span class="variant-name">${v.hook}</span>
        </div>
        <div class="variant-stats">
          <div class="stat"><span class="stat-label">CTR</span><span class="stat-val">${v.ctr}</span></div>
          <div class="stat"><span class="stat-label">CPI</span><span class="stat-val">${v.cpi}</span></div>
          <div class="stat"><span class="stat-label">D1</span><span class="stat-val">${v.retention}</span></div>
        </div>
      `
      variantsGrid.appendChild(card)

      const canvas = document.getElementById('vcanvas-' + v.id) as HTMLCanvasElement
      ticks.push(GAME_FNS[v.id](canvas))
    }, 1800 + i * 220)
  })

  // Drive all preview games on one RAF loop
  let raf = 0
  function loop() {
    raf = requestAnimationFrame(loop)
    ticks.forEach(t => t())
  }
  loop()

  // Stop the loop when navigating away
  window.addEventListener('hashchange', () => cancelAnimationFrame(raf), { once: true })

  // Reveal recommendation + flip badge once pipeline done
  const totalDelay = PIPELINE_NODES.length * 900 + 400
  setTimeout(() => {
    recCol.style.opacity = '1'
    badge.innerHTML = '<span style="color:var(--accent);font-weight:600;font-size:13px">✓ Pipeline complete</span>'
  }, totalDelay)
}