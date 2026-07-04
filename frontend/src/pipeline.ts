// ── Page 3 : Creative pipeline ──

const VARIANTS = [
  { id: 'A', label: 'Original',  color: '#2563eb', ctr: '3.2%', spend: '$42', status: 'keep', dur: '0:15' },
  { id: 'B', label: 'Fast pace', color: '#7c3aed', ctr: '5.1%', spend: '$38', status: 'keep', dur: '0:15' },
  { id: 'C', label: 'Neon skin', color: '#0891b2', ctr: '1.8%', spend: '$41', status: 'kill', dur: '0:15' },
  { id: 'D', label: 'Rage mode', color: '#2563eb', ctr: '4.4%', spend: '$39', status: 'keep', dur: '0:15' },
]

const PIPELINE_NODES = [
  { id: 'variants', icon: '🎮', label: 'Variant generation',   sub: '4 game variants mutated from original' },
  { id: 'veo',      icon: '🎬', label: 'Video gen (Veo)',       sub: '4 × 15s ad creatives rendered' },
  { id: 'deploy',   icon: '📤', label: 'Deploy to Google Ads',  sub: 'Creatives pushed to campaign stub' },
  { id: 'metrics',  icon: '📊', label: 'Metrics ingestion',     sub: 'CTR, spend, retention — simulated' },
  { id: 'decide',   icon: '🧠', label: 'Keep / Kill decision',  sub: 'Agent scores and ranks variants' },
]

export function renderPipeline(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <button class="back-fab" id="back-btn" title="Back to Playtest">←</button>
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        <div class="breadcrumb">
          <span class="bc-done">01 Playtest</span>
          <span class="bc-sep">›</span>
          <span class="bc-done active">02 Pipeline</span>
        </div>
      </nav>

      <div class="pipeline-layout">

        <!-- LEFT: pipeline steps -->
        <div class="pipeline-col">
          <div class="col-title">Agent pipeline</div>
          <div class="pipe-nodes" id="pipe-nodes"></div>
        </div>

        <!-- CENTER: variant cards -->
        <div class="pipeline-col pipeline-col--wide">
          <div class="col-title">Creatives</div>
          <div class="variants-grid" id="variants-grid"></div>
        </div>

        <!-- RIGHT: recommendation -->
        <div class="pipeline-col" id="rec-col" style="opacity:0;transition:opacity 0.5s">
          <div class="col-title">Agent recommendation</div>
          <div class="rec-card">
            <div class="rec-icon">🧠</div>
            <div class="rec-title">Build next: <span class="accent">Rage mode variant</span></div>
            <p class="rec-body">
              Variant D (Rage mode) had the best attention signal (4.4% CTR, lowest drop-off at 5s).
              Fast pace (B) held strong — merge both mechanics into the next prototype.
            </p>
            <div class="rec-divider"></div>
            <div class="rec-row"><span>Kill</span><span class="tag tag--kill">Neon skin (C)</span></div>
            <div class="rec-row"><span>Scale</span><span class="tag tag--keep">Rage mode (D) + Fast pace (B)</span></div>
            <div class="rec-row"><span>Next build</span><span class="tag tag--next">Rage Dash v2</span></div>
          </div>
        </div>

      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => { location.hash = '#playtest' })

  const pipeNodes   = document.getElementById('pipe-nodes')!
  const variantsGrid= document.getElementById('variants-grid')!
  const recCol      = document.getElementById('rec-col') as HTMLElement

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
      <div class="pipe-status" id="status-${node.id}">
        <span class="dot-pending">···</span>
      </div>
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

  // Variant cards appear after veo step
  VARIANTS.forEach((v, i) => {
    setTimeout(() => {
      const card = document.createElement('div')
      card.className = 'variant-card variant-card--in'
      card.innerHTML = `
        <div class="variant-preview" style="background: linear-gradient(180deg, ${v.color}33 0%, ${v.color}77 100%); border-color: ${v.color}44">
          <div class="variant-play">▶</div>
          <div class="variant-badge variant-badge--${v.status}">${v.status === 'keep' ? 'Keep' : 'Kill'}</div>
          <div class="variant-duration">${v.dur}</div>
        </div>
        <div class="variant-meta">
          <span class="variant-id" style="color:${v.color}">${v.id}</span>
          <span class="variant-name">${v.label}</span>
        </div>
        <div class="variant-stats">
          <div class="stat"><span class="stat-label">CTR</span><span class="stat-val">${v.ctr}</span></div>
          <div class="stat"><span class="stat-label">Spend</span><span class="stat-val">${v.spend}</span></div>
        </div>
      `
      variantsGrid.appendChild(card)
    }, 1800 + i * 250)
  })

  // Show recommendation after all nodes done
  const totalDelay = PIPELINE_NODES.length * 900 + 400
  setTimeout(() => { recCol.style.opacity = '1' }, totalDelay)
}
