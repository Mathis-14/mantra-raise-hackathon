// ── Screen 3 : Ads — variant gameplay → generated ad creatives ──
// On arrival, auto-triggers the pub-generator server (VLM → Nemotron 3 → FFmpeg),
// streams progress, then renders the finished ads. No manual commands.
import { renderStepper, setRoute, type FlowRoute } from './flow'

const PUBGEN = 'http://localhost:4319'

interface AdEntry {
  clip: string
  game: string
  video: string
  manifest: string
  hook: string
  cta: string
  tone: string
  duration_s: number
  models: { vlm?: string; nemotron?: string }
}
interface EdlStep { time: number; zoom?: number; shake?: boolean; caption?: string; overlay?: string }
interface AdPlan {
  hook: string; tone: string; duration_s: number; cta: string
  voiceover: string; assets: string[]; edl: EdlStep[]
}
interface Status { state: 'idle' | 'running' | 'done' | 'error'; step: string; log: string[]; ads: AdEntry[] }

const AD_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706']
const base = (p: string) => `${import.meta.env.BASE_URL}${p}`

export function renderAds(root: HTMLElement, route: FlowRoute) {
  root.innerHTML = `
    <div class="shell">
      <button class="back-fab" id="back-btn" title="Back to Variants">←</button>
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        ${renderStepper('ads')}
        <div class="session-badge" id="ads-badge">
          <span class="live-dot"></span>
          <span>Preparing ads…</span>
        </div>
      </nav>

      <div class="ads-body">
        <div class="ads-head">
          <div>
            <div class="col-title">Ad creatives · <span class="accent">Nemotron 3 Creative Director</span></div>
            <p class="ads-sub">A vision model reads each variant's gameplay, then Nemotron 3 plans the whole ad — hook, edit timeline, captions, effects and CTA. FFmpeg renders the final 9:16 creative.</p>
          </div>
          <span class="ads-model" id="ads-model">NVIDIA NIM</span>
        </div>

        <div class="ads-list" id="ads-list"></div>
      </div>

      <div class="ad-lightbox" id="ad-lightbox" hidden>
        <button class="ad-lightbox-close" id="ad-lightbox-close" title="Close">×</button>
        <video class="ad-lightbox-video" id="ad-lightbox-video" controls playsinline></video>
      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => {
    setRoute('variants', { runId: route.runId, gameUrl: route.gameUrl })
  })

  const lb = document.getElementById('ad-lightbox') as HTMLElement
  const lbVideo = document.getElementById('ad-lightbox-video') as HTMLVideoElement
  function closeLightbox() { lb.hidden = true; lbVideo.pause(); lbVideo.removeAttribute('src'); lbVideo.load() }
  document.getElementById('ad-lightbox-close')!.addEventListener('click', closeLightbox)
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox() })
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lb.hidden) closeLightbox() })

  bootstrap(
    document.getElementById('ads-list')!,
    document.getElementById('ads-badge')!,
    document.getElementById('ads-model')!,
    (src) => { lbVideo.src = src; lb.hidden = false; lbVideo.play().catch(() => {}) },
  )
}

// Decide whether to auto-generate, then render.
async function bootstrap(list: HTMLElement, badge: HTMLElement, modelTag: HTMLElement, openFull: (src: string) => void) {
  let status: Status | null = null
  try {
    status = await fetch(`${PUBGEN}/status`).then(r => r.json())
  } catch { /* server offline */ }

  if (!status) {
    // No server: fall back to whatever is already published, else show hint.
    const ads = await fetchPublishedAds()
    if (ads.length) return renderAds_(ads, list, badge, modelTag, openFull)
    return renderServerHint(list, badge)
  }

  if (status.state === 'done' && status.ads.length) {
    return renderAds_(status.ads, list, badge, modelTag, openFull)
  }

  // idle or empty → kick off generation; running → just follow progress
  if (status.state !== 'running') {
    try { await fetch(`${PUBGEN}/generate`, { method: 'POST' }) } catch { /* ignore */ }
  }
  followProgress(list, badge, modelTag, openFull)
}

async function fetchPublishedAds(): Promise<AdEntry[]> {
  try {
    const res = await fetch(base('ads/index.json'), { cache: 'no-store' })
    return res.ok ? await res.json() : []
  } catch { return [] }
}

// Poll the server and animate a progress view until done.
function followProgress(list: HTMLElement, badge: HTMLElement, modelTag: HTMLElement, openFull: (s: string) => void) {
  list.innerHTML = `
    <div class="ads-progress">
      <div class="ads-progress-spinner"></div>
      <div class="ads-progress-step" id="ads-progress-step">Starting generation…</div>
      <div class="ads-progress-log" id="ads-progress-log"></div>
    </div>`
  const stepEl = document.getElementById('ads-progress-step')!
  const logEl = document.getElementById('ads-progress-log')!
  badge.innerHTML = '<span class="live-dot"></span><span>Generating ads…</span>'

  const timer = setInterval(async () => {
    let s: Status
    try { s = await fetch(`${PUBGEN}/status`).then(r => r.json()) } catch { return }
    stepEl.textContent = s.step || s.state
    logEl.innerHTML = s.log.slice(-8).map(l => `<div class="ads-log-line">${l}</div>`).join('')
    if (s.state === 'done' && s.ads.length) {
      clearInterval(timer)
      renderAds_(s.ads, list, badge, modelTag, openFull)
    } else if (s.state === 'error') {
      clearInterval(timer)
      badge.innerHTML = '<span style="color:#dc2626">Generation failed</span>'
    }
  }, 1200)
}

function renderServerHint(list: HTMLElement, badge: HTMLElement) {
  list.innerHTML = `
    <div class="ads-empty">
      <div class="ads-empty-icon">🎬</div>
      <div class="ads-empty-title">Start the ad generator</div>
      <div class="ads-empty-copy">
        The pub-generator server isn't running. Start it once, then this page
        generates ads automatically:<br/><br/>
        <code>cd frontend</code> &nbsp; <code>npm run pubgen</code>
      </div>
    </div>`
  badge.innerHTML = '<span style="color:var(--text-faint)">Generator offline</span>'
}

async function renderAds_(ads: AdEntry[], list: HTMLElement, badge: HTMLElement, modelTag: HTMLElement, openFull: (s: string) => void) {
  if (ads[0]?.models?.nemotron) modelTag.textContent = ads[0].models.nemotron

  const plans = await Promise.all(ads.map(async (ad) => {
    try { return (await fetch(base(ad.manifest), { cache: 'no-store' }).then(r => r.json())).plan as AdPlan }
    catch { return null }
  }))

  list.innerHTML = ads.map((ad, i) => adCard(ad, plans[i], i)).join('')
  badge.innerHTML = `<span style="color:var(--accent);font-weight:600;font-size:13px">✓ ${ads.length} ads generated</span>`

  list.querySelectorAll<HTMLElement>('.ad-card').forEach((card) => {
    const v = card.querySelector('video') as HTMLVideoElement
    const src = card.dataset.video!
    card.addEventListener('mouseenter', () => { v.muted = true; v.play().catch(() => {}) })
    card.addEventListener('mouseleave', () => v.pause())
    card.querySelector('.ad-fullscreen')?.addEventListener('click', (e) => { e.stopPropagation(); openFull(src) })
    card.querySelector('.ad-thumb')?.addEventListener('click', () => openFull(src))
  })
}

function adCard(ad: AdEntry, plan: AdPlan | null, i: number): string {
  const color = AD_COLORS[i % AD_COLORS.length]
  const dur = ad.duration_s || plan?.duration_s || 12
  const src = base(ad.video)
  return `
    <div class="ad-card" data-video="${src}">
      <div class="ad-thumb">
        <video class="ad-video" src="${src}" muted loop playsinline preload="metadata"></video>
        <button class="ad-fullscreen" title="Play fullscreen" aria-label="Play fullscreen">⤢</button>
        <span class="ad-dur-pill">${dur}s · 9:16</span>
      </div>

      <div class="ad-info">
        <div class="ad-info-head">
          <span class="ad-title" style="color:${color}">${ad.clip}</span>
          <span class="ad-tag">${ad.tone}</span>
        </div>
        <div class="ad-hook">“${ad.hook}”</div>
        ${plan ? nemotronPanel(plan, color, dur) : ''}
        <div class="ad-cta-row"><span class="ad-cta-lbl">CTA</span><strong>${ad.cta}</strong></div>
      </div>
    </div>`
}

function nemotronPanel(plan: AdPlan, color: string, dur: number): string {
  const edl = (plan.edl || []).slice().sort((a, b) => a.time - b.time)
  const markers = edl.map(step => {
    const left = Math.max(0, Math.min(100, (step.time / dur) * 100))
    const label = step.caption || step.overlay || 'cut'
    const fx = [step.zoom && step.zoom > 1 ? `zoom ${step.zoom}×` : '', step.shake ? 'shake' : ''].filter(Boolean).join(' · ')
    return `
      <div class="edl-marker" style="left:${left}%">
        <span class="edl-dot" style="background:${color}"></span>
        <div class="edl-tip"><strong>${step.time}s · ${label}</strong>${fx ? `<span>${fx}</span>` : ''}</div>
      </div>`
  }).join('')
  const assets = (plan.assets || []).map(a => `<span class="chip chip--asset">${a.replace(/_/g, ' ')}</span>`).join('')
  return `
    <div class="nem-panel">
      <div class="nem-panel-head"><span class="nem-badge">◆ Nemotron plan</span><span class="nem-dur">${dur}s edit</span></div>
      <div class="edl-track"><div class="edl-line"></div>${markers}</div>
      <div class="nem-rows">
        ${assets ? `<div class="nem-row"><span class="nem-k">Assets</span><span class="nem-v">${assets}</span></div>` : ''}
        ${plan.voiceover ? `<div class="nem-row"><span class="nem-k">Voiceover</span><span class="nem-v nem-vo">“${plan.voiceover}”</span></div>` : ''}
      </div>
    </div>`
}