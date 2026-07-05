import { fetchRunState, type FlowVariant, type RunState, type RunStatus } from './api'
import { getErrorMessage, renderStepper, setRoute, type FlowRoute } from './flow'

const VARIANT_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706']
const VARIANT_LABELS = ['Variant 1', 'Variant 2', 'Variant 3', 'Variant 4', 'Variant 5']
const DASHBOARD_STATUSES: RunStatus[] = [
  'generating_creatives',
  'deploying',
  'measuring',
  'deciding',
  'done',
]

function renderVariantPhones() {
  return VARIANT_LABELS.map((title, id) => `
    <div class="phone-slot" id="variant-slot-${id}">
      <div class="phone-device">
        <div class="phone-edge"></div>
        <div class="iphone-frame">
          <div class="iphone-notch"></div>
          <div class="iphone-screen phone-screen--pending" id="variant-screen-${id}">
            <div class="phone-pending">
              <span class="pending-kicker">Pending</span>
              <span class="pending-title">${title}</span>
              <span class="pending-copy">Waiting for generated gameplay</span>
            </div>
          </div>
          <div class="iphone-home"></div>
        </div>
      </div>
      <div class="phone-meta">
        <span class="phone-title" style="color:${VARIANT_COLORS[id]}">${title}</span>
        <div class="phone-progress-wrap">
          <div class="phone-progress-bar" id="variant-prog-${id}" style="background:${VARIANT_COLORS[id]};width:0%"></div>
        </div>
        <span class="phone-pct" id="variant-pct-${id}">Pending</span>
      </div>
    </div>
  `).join('')
}

export function renderVariants(root: HTMLElement, route: FlowRoute) {
  root.innerHTML = `
    <div class="shell">
      <button class="back-fab" id="back-btn" title="Back">←</button>
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        ${renderStepper('variants')}
        <div class="session-badge" id="variant-badge">
          <span class="live-dot"></span>
          <span>Generating variants</span>
        </div>
      </nav>

      <div class="playtest-body">
        <div class="carousel-scene">
          <div class="carousel-track" id="variant-carousel-track">${renderVariantPhones()}</div>
          <button class="btn-generate btn-generate--corner" id="open-dashboard-btn">
            <span class="btn-generate-title">Open dashboard</span>
            <span class="btn-generate-arrow">→</span>
          </button>
        </div>

        <aside class="logs-panel">
          <div class="logs-title">Variant activity</div>
          <div class="log-group">
            <div class="log-group-head">
              <span class="log-dot" style="background:#2563eb"></span>
              <span class="log-group-name">Variants</span>
              <span class="log-group-pct" id="variant-log-status" style="color:#2563eb">Pending</span>
            </div>
            <div class="log-lines" id="variant-logs"></div>
          </div>
        </aside>
      </div>
    </div>
  `

  const backBtn = document.getElementById('back-btn')
  const dashboardBtn = document.getElementById('open-dashboard-btn') as HTMLButtonElement | null
  const badge = document.getElementById('variant-badge')
  const logStatus = document.getElementById('variant-log-status')
  const logs = document.getElementById('variant-logs')
  const slots = VARIANT_LABELS.map((_, id) => document.getElementById(`variant-slot-${id}`)).filter(
    (slot): slot is HTMLElement => slot !== null,
  )
  const progressBars = VARIANT_LABELS.map((_, id) => document.getElementById(`variant-prog-${id}`))
  const pctLabels = VARIANT_LABELS.map((_, id) => document.getElementById(`variant-pct-${id}`))
  const loadedVariantIds = new Set<string>()
  const seenEventIds = new Set<string>()

  let disposed = false
  let routed = false
  let backendAdvancedLogged = false
  const startedAt = performance.now()
  const radius = 390
  const speed = 0.00028

  function addLog(text: string) {
    if (!logs) return
    const line = document.createElement('div')
    line.className = 'log-line'
    line.textContent = text
    logs.appendChild(line)
    logs.scrollTop = logs.scrollHeight
  }

  function setBadge(text: string, failed = false) {
    if (!badge) return
    badge.innerHTML = failed
      ? `<span class="status-dot status-dot--failed"></span><span>${text}</span>`
      : `<span class="live-dot"></span><span>${text}</span>`
  }

  function openDashboard(variantsPending: boolean) {
    if (routed) return
    routed = true
    setRoute('pipeline', {
      runId: route.runId,
      gameUrl: route.gameUrl,
      variantsPending,
    })
  }

  function mountVariant(index: number, variant: FlowVariant) {
    if (loadedVariantIds.has(variant.id)) return

    const screen = document.getElementById(`variant-screen-${index}`)
    if (!screen) return

    loadedVariantIds.add(variant.id)
    screen.classList.remove('phone-screen--pending')
    screen.classList.add('phone-screen--live')
    screen.innerHTML = `<iframe id="variant-game-${index}" class="phone-game-frame" title="${variant.name}" sandbox="allow-scripts allow-same-origin allow-pointer-lock"></iframe>`

    const frame = document.getElementById(`variant-game-${index}`) as HTMLIFrameElement | null
    if (frame) frame.srcdoc = variant.gameHtml

    const progress = progressBars[index]
    const pct = pctLabels[index]
    if (progress) progress.style.width = '100%'
    if (pct) pct.textContent = 'Ready'
    addLog(`${variant.name}: ${variant.hypothesis}`)
  }

  function applyState(state: RunState) {
    state.events.forEach((event) => {
      if (seenEventIds.has(event.id)) return
      seenEventIds.add(event.id)
      addLog(`${event.node}: ${event.message}`)
    })

    state.variants.slice(0, VARIANT_LABELS.length).forEach((variant, index) => {
      mountVariant(index, variant)
    })

    if (state.variants.length > 0) {
      setBadge(`${state.variants.length}/5 variants received`)
      if (logStatus) logStatus.textContent = `${state.variants.length}/5 ready`
    }

    if (state.run.status === 'failed') {
      setBadge('Variant generation failed', true)
      if (logStatus) logStatus.textContent = 'Failed'
      return
    }

    if (DASHBOARD_STATUSES.includes(state.run.status) && state.variants.length === 0) {
      addLog('Backend moved past variants; opening dashboard')
      openDashboard(false)
      return
    }

    if (DASHBOARD_STATUSES.includes(state.run.status) && !backendAdvancedLogged) {
      backendAdvancedLogged = true
      addLog('Backend moved past variants; carousel remains available')
    }
  }

  async function refreshState() {
    if (!route.runId || disposed) return
    try {
      applyState(await fetchRunState(route.runId))
    } catch (error) {
      setBadge('State sync failed', true)
      addLog(`State sync failed: ${getErrorMessage(error)}`)
    }
  }

  backBtn?.addEventListener('click', () => {
    setRoute('playtest', { runId: route.runId, gameUrl: route.gameUrl })
  })
  dashboardBtn?.addEventListener('click', () => {
    addLog('Dashboard opened while variants backend is pending')
    openDashboard(loadedVariantIds.size === 0)
  })

  addLog('Variant generation stage opened')
  addLog('Generating 5 variants — Gemini needs a minute or two; phones fill in as they land')
  setBadge('Generating variants (1-2 min)')

  const poll = window.setInterval(() => {
    void refreshState()
  }, 1500)
  void refreshState()

  function animate(now: number) {
    if (disposed) return

    const elapsed = now - startedAt
    progressBars.forEach((bar, index) => {
      if (!bar || loadedVariantIds.size > index) return
      const pct = Math.min(92, Math.max(0, ((elapsed - index * 450) / 5600) * 92))
      bar.style.width = `${pct.toFixed(0)}%`
      const label = pctLabels[index]
      if (label) label.textContent = pct > 8 ? 'Generating' : 'Pending'
    })

    const theta = elapsed * speed
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

    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)

  window.addEventListener('hashchange', () => {
    disposed = true
    window.clearInterval(poll)
  }, { once: true })
}
