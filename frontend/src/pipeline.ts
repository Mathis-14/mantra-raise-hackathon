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
  { id: 'market',   icon: '🛰️', label: 'Competitor analysis',  sub: 'Sensor Tower — market benchmark' },
  { id: 'decide',   icon: '🧠', label: 'Keep / Kill decision', sub: 'Agent scores vs. market · A/B set' },
]

// ── Sensor Tower competitor benchmark (seeded for demo) ──
interface Competitor {
  name: string
  publisher: string
  genre: string
  cpi: string
  ctr: string
  installs: string   // last 30d
}

const MARKET = {
  genre: 'Hypercasual · Arcade dodge',
  medianCpi: '$0.58',
  medianCtr: '3.4%',
  competitors: [
    { name: 'Lane Rush 3D',   publisher: 'Voodoo',    genre: 'Arcade', cpi: '$0.51', ctr: '4.1%', installs: '2.4M' },
    { name: 'Sky Jumper',     publisher: 'Homa',      genre: 'Arcade', cpi: '$0.44', ctr: '4.9%', installs: '1.8M' },
    { name: 'Brick Smash!',   publisher: 'Azur Games', genre: 'Arcade', cpi: '$0.72', ctr: '2.7%', installs: '640K' },
    { name: 'Astro Blaster',  publisher: 'CrazyLabs', genre: 'Shooter', cpi: '$0.63', ctr: '3.2%', installs: '910K' },
  ] as Competitor[],
}

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

          <div class="market-section" id="market-section" style="opacity:0;transition:opacity 0.5s">
            <div class="col-title market-title">
              <span>🛰️ Market benchmark · Sensor Tower</span>
              <span class="market-genre">${MARKET.genre}</span>
            </div>
            <div class="market-grid">
              <div class="market-competitors">
                <div class="market-sub">Top competitors (30d installs)</div>
                <div class="market-list" id="market-list"></div>
              </div>
              <div class="market-position" id="market-position">
                <div class="market-sub">Our creatives vs. market</div>
                <div class="market-bench" id="market-bench"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="pipeline-col" id="rec-col" style="opacity:0;transition:opacity 0.5s">
          <div class="col-title">Agent recommendation</div>
          <div class="rec-card">
            <div class="rec-icon">🧠</div>
            <div class="rec-title">Build next: <span class="accent">Sky Hop × Speed Dash</span></div>
            <p class="rec-body">
              Sky Hop beat the market on both CPI ($0.37 vs $0.58 median) and D1
              retention (44%), pacing with Homa's Sky Jumper. Speed Dash undercut
              Voodoo's Lane Rush on CPI. Neon Snake fell below market — kill it.
            </p>
            <div class="rec-divider"></div>
            <div class="rec-row"><span>Kill</span><span class="tag tag--kill">Neon Snake</span></div>
            <div class="rec-row"><span>A/B test</span><span class="tag tag--keep">Sky Hop vs Speed Dash</span></div>
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

  // ── Market benchmark: reveal when the 'market' node finishes ──
  const marketNodeIdx = PIPELINE_NODES.findIndex(n => n.id === 'market')
  const marketList  = document.getElementById('market-list')!
  const marketBench = document.getElementById('market-bench')!
  const marketSection = document.getElementById('market-section') as HTMLElement

  setTimeout(() => {
    // competitor rows
    MARKET.competitors.forEach(c => {
      const row = document.createElement('div')
      row.className = 'market-comp'
      row.innerHTML = `
        <div class="mc-main">
          <span class="mc-name">${c.name}</span>
          <span class="mc-pub">${c.publisher}</span>
        </div>
        <div class="mc-stats">
          <span title="Installs 30d">${c.installs}</span>
          <span title="CPI">${c.cpi}</span>
          <span title="CTR">${c.ctr}</span>
        </div>
      `
      marketList.appendChild(row)
    })

    // our variants benchmarked against market median CPI
    const medCpi = parseFloat(MARKET.medianCpi.replace('$', ''))
    VARIANTS.forEach(v => {
      const cpi = parseFloat(v.cpi.replace('$', ''))
      const beats = cpi < medCpi
      const session = SESSIONS[v.id]
      // bar width: lower CPI = better = fuller bar (invert around 2× median)
      const pct = Math.max(6, Math.min(100, (1 - cpi / (medCpi * 2)) * 100))
      const row = document.createElement('div')
      row.className = 'bench-row'
      row.innerHTML = `
        <span class="bench-name" style="color:${session.color}">${session.title}</span>
        <div class="bench-bar-wrap">
          <div class="bench-bar" style="width:${pct.toFixed(0)}%;background:${session.color}"></div>
          <div class="bench-median" title="Market median CPI"></div>
        </div>
        <span class="bench-verdict ${beats ? 'beats' : 'below'}">${beats ? '▼ beats mkt' : '▲ above mkt'}</span>
      `
      marketBench.appendChild(row)
    })

    marketSection.style.opacity = '1'
  }, marketNodeIdx * 900 + 700)

  // Reveal recommendation + flip badge once pipeline done
  const totalDelay = PIPELINE_NODES.length * 900 + 400
  setTimeout(() => {
    recCol.style.opacity = '1'
    badge.innerHTML = '<span style="color:var(--accent);font-weight:600;font-size:13px">✓ Pipeline complete</span>'
  }, totalDelay)
}