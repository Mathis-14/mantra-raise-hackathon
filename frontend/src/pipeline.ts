// ── Page 3 : Creative pipeline ──
import { SESSIONS, GAME_FNS } from './games'
import { createGlobe, type GlobePoint, type GlobeArc } from './globe'
import { renderStepper, setRoute, type FlowRoute } from './flow'
import {
  getNvidiaVersionSummaries,
  renderNvidiaComparison,
  type NvidiaVersionSummary,
} from './nvidia-comparison'

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
  { id: 'nvidia',  icon: '◆', label: 'NVIDIA gameplay analysis', sub: 'Nemotron compares color · audio · pacing' },
  { id: 'variants', icon: '🎮', label: 'Variant generation',  sub: '5 game variants mutated from original' },
  { id: 'veo',      icon: '🎬', label: 'Video gen (Veo)',      sub: '5 × 9:16 ad creatives rendered' },
  { id: 'deploy',   icon: '📤', label: 'Google Ads test shell', sub: 'Real paused shell · creatives stay simulated' },
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
  revenue: string    // est. net revenue 30d
  adSpend: string    // est. UA spend 30d
  spendTrend: number // MoM ad-spend change, %
  topNetwork: string // where they buy most impressions
  creatives: number  // active ad creatives (Sensor Tower Creative library)
  city: string
  lat: number
  lng: number
  color: string
}

const MARKET = {
  genre: 'Hypercasual · Arcade dodge',
  medianCpi: '$0.58',
  medianCtr: '3.4%',
  totalSpend: '$4.6M',       // category UA spend, 30d
  spendTrend: 12,            // category MoM, %
  competitors: [
    { name: 'Lane Rush 3D',  publisher: 'Voodoo',     genre: 'Arcade',  cpi: '$0.51', ctr: '4.1%', installs: '2.4M', revenue: '$1.9M', adSpend: '$1.22M', spendTrend: 18,  topNetwork: 'Meta',     creatives: 214, city: 'Paris, FR',      lat: 48.86, lng: 2.35,   color: '#2563eb' },
    { name: 'Sky Jumper',    publisher: 'Homa',       genre: 'Arcade',  cpi: '$0.44', ctr: '4.9%', installs: '1.8M', revenue: '$1.4M', adSpend: '$0.79M', spendTrend: 26,  topNetwork: 'TikTok',   creatives: 188, city: 'Paris, FR',      lat: 48.85, lng: 2.34,   color: '#7c3aed' },
    { name: 'Brick Smash!',  publisher: 'Azur Games', genre: 'Arcade',  cpi: '$0.72', ctr: '2.7%', installs: '640K', revenue: '$0.5M', adSpend: '$0.46M', spendTrend: -9,  topNetwork: 'Unity',    creatives: 96,  city: 'Nicosia, CY',    lat: 35.19, lng: 33.38,  color: '#0891b2' },
    { name: 'Astro Blaster', publisher: 'CrazyLabs',  genre: 'Shooter', cpi: '$0.63', ctr: '3.2%', installs: '910K', revenue: '$0.8M', adSpend: '$0.57M', spendTrend: 4,   topNetwork: 'AppLovin', creatives: 131, city: 'Tel Aviv, IL',   lat: 32.08, lng: 34.78,  color: '#d97706' },
    { name: 'Dash Mania',    publisher: 'SayGames',   genre: 'Arcade',  cpi: '$0.55', ctr: '3.8%', installs: '1.2M', revenue: '$0.9M', adSpend: '$0.66M', spendTrend: 15,  topNetwork: 'Meta',     creatives: 152, city: 'Minsk, BY',      lat: 53.90, lng: 27.56,  color: '#059669' },
    { name: 'Hopper Go',     publisher: 'Kwalee',     genre: 'Arcade',  cpi: '$0.60', ctr: '3.5%', installs: '780K', revenue: '$0.6M', adSpend: '$0.47M', spendTrend: 8,   topNetwork: 'TikTok',   creatives: 118, city: 'Leamington, UK', lat: 52.29, lng: -1.53, color: '#db2777' },
  ] as Competitor[],
}

// UA spend split by network across the category (Sensor Tower, 30d) — for Metrics tab.
const NETWORK_SPLIT = [
  { network: 'Meta',     share: 34, trend:  9 },
  { network: 'TikTok',   share: 27, trend: 22 },
  { network: 'AppLovin', share: 18, trend:  5 },
  { network: 'Unity',    share: 12, trend: -6 },
  { network: 'Google',   share:  9, trend:  3 },
]

// ── Deeper market intelligence (Sensor Tower + creative library), seeded ──

// Category headline KPIs for the Metrics tab.
const METRIC_KPIS = [
  { val: '$4.6M', lbl: 'Category UA spend · 30d', trend: 12 },
  { val: '6.1M',  lbl: 'Est. installs · 30d',     trend: 8 },
  { val: '899',   lbl: 'Active ad creatives',     trend: 19 },
  { val: '4.2d',  lbl: 'Avg. creative lifespan',  trend: -14 },
]

// Share of Voice + velocity — who is winning impressions and how fast (Voodoo-style).
const SOV = [
  { name: 'Lane Rush 3D',  pub: 'Voodoo',     sov: 27, velocity:  6 },
  { name: 'Sky Jumper',    pub: 'Homa',       sov: 21, velocity: 14 },
  { name: 'Dash Mania',    pub: 'SayGames',   sov: 16, velocity:  9 },
  { name: 'Astro Blaster', pub: 'CrazyLabs',  sov: 13, velocity:  3 },
  { name: 'Hopper Go',     pub: 'Kwalee',     sov: 12, velocity:  5 },
  { name: 'Brick Smash!',  pub: 'Azur Games', sov: 11, velocity: -7 },
]

// Emotional pitch distribution across deconstructed ad creatives (Voodoo-style).
const PITCH_MIX = [
  { pitch: 'Satisfying / ASMR', pct: 31, color: '#2563eb' },
  { pitch: 'Fail / frustration', pct: 24, color: '#db2777' },
  { pitch: 'Power fantasy',      pct: 19, color: '#7c3aed' },
  { pitch: 'Speed / flow',       pct: 15, color: '#0891b2' },
  { pitch: 'Cute / cozy',        pct: 11, color: '#059669' },
]

// Creative freshness: how much of each rival's library is new this month.
const FRESHNESS = [
  { name: 'Sky Jumper',   fresh: 62, color: '#7c3aed' },
  { name: 'Dash Mania',   fresh: 54, color: '#059669' },
  { name: 'Lane Rush 3D', fresh: 41, color: '#2563eb' },
  { name: 'Hopper Go',    fresh: 38, color: '#db2777' },
  { name: 'Astro Blaster', fresh: 29, color: '#d97706' },
  { name: 'Brick Smash!', fresh: 17, color: '#0891b2' },
]

// Top geos by category install volume (Sensor Tower).
const GEO_SPLIT = [
  { geo: '🇺🇸 United States', share: 28 },
  { geo: '🇧🇷 Brazil',        share: 16 },
  { geo: '🇮🇳 India',         share: 14 },
  { geo: '🇩🇪 Germany',       share: 11 },
  { geo: '🇫🇷 France',        share:  9 },
  { geo: '🌍 Rest of world',  share: 22 },
]

// Our studio origin — arcs radiate from here to each competitor market
const HOME: [number, number] = [48.86, 2.35]  // Paris (demo studio)

// vertical 9:16 preview canvas size
const VW = 132
const VH = 234

const TABS = [
  { id: 'overview',    icon: '📊', label: 'Overview' },
  { id: 'competitors', icon: '🛰️', label: 'Competitors' },
  { id: 'metrics',     icon: '📈', label: 'Metrics' },
  { id: 'decision',    icon: '🧠', label: 'Decision' },
]

export function renderPipeline(root: HTMLElement, route: FlowRoute) {
  const medCpi = parseFloat(MARKET.medianCpi.replace('$', ''))

  root.innerHTML = `
    <div class="shell">
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        ${renderStepper('dashboard')}
        <div class="session-badge" id="pipe-badge">
          <span class="live-dot"></span>
          <span>${route.variantsPending ? 'Dashboard shell · variants pending' : 'Generating creatives…'}</span>
        </div>
      </nav>

      <div class="pipeline-layout">
        <!-- LEFT: analytics tabs -->
        <div class="analytics-tabs" id="analytics-tabs">
          ${TABS.map((t, i) => `
            <button class="atab ${i === 0 ? 'atab--active' : ''}" data-tab="${t.id}">
              <span class="atab-icon">${t.icon}</span>
              <span class="atab-label">${t.label}</span>
            </button>
          `).join('')}
        </div>

        <!-- MAIN: tab panels -->
        <div class="analytics-main" id="analytics-main">

          <!-- Overview -->
          <section class="tab-panel tab-panel--active" data-panel="overview">
            <div class="gameplay-wall-head">
              <div>
                <div class="col-title">Gameplay variants · NVIDIA ranked</div>
                <p>Green wins. Amber needs iteration. Red gets killed.</p>
              </div>
              <span class="gameplay-wall-model">NVIDIA Nemotron · multimodal analysis</span>
            </div>
            <div class="variants-grid" id="variants-grid"></div>
            <div id="nvidia-recommendation"></div>
            <div class="creative-analysis-block" id="nvidia-details-section" hidden>
              <div class="col-title">Why NVIDIA ranked them this way</div>
              <div id="nvidia-comparison"></div>
            </div>
          </section>

          <!-- Competitors + globe -->
          <section class="tab-panel" data-panel="competitors">
            <div class="col-title market-title">
              <span>🛰️ Competitor map · Sensor Tower</span>
              <span class="market-genre">${MARKET.genre}</span>
            </div>

            <!-- market spend summary strip -->
            <div class="market-kpis">
              <div class="mkpi"><span class="mkpi-val">${MARKET.totalSpend}</span><span class="mkpi-lbl">Category UA spend · 30d</span></div>
              <div class="mkpi"><span class="mkpi-val mkpi-up">▲ ${MARKET.spendTrend}%</span><span class="mkpi-lbl">Spend MoM</span></div>
              <div class="mkpi"><span class="mkpi-val">${MARKET.medianCpi}</span><span class="mkpi-lbl">Median CPI</span></div>
              <div class="mkpi"><span class="mkpi-val">${MARKET.competitors.length}</span><span class="mkpi-lbl">Active competitors</span></div>
            </div>

            <p class="globe-caption">
              Each point is a competing studio's HQ, sized and coloured per publisher.
              Arcs trace where each rival is buying installs from our market. Click a
              point for its Sensor Tower spend profile.
            </p>
            <div class="comp-layout">
              <div class="globe-wrap" id="globe-wrap">
                <div class="globe-legend">
                  <span class="gl-item"><span class="gl-dot" style="background:#fff"></span>Our studio</span>
                  <span class="gl-item"><span class="gl-dot" style="background:#2563eb"></span>Competitor HQ</span>
                  <span class="gl-item"><span class="gl-arc"></span>UA reach</span>
                </div>
                <div class="globe-hint">Drag to rotate · click a marker</div>
                <div class="globe-pop" id="globe-pop" style="display:none"></div>
              </div>
              <div class="comp-side">
                <div class="market-sub">Competitor spend & scale · 30d</div>
                <div class="market-list" id="market-list"></div>
              </div>
            </div>
          </section>

          <!-- Metrics -->
          <section class="tab-panel" data-panel="metrics">
            <div class="col-title market-title">
              <span>📈 Market intelligence · how competitors invest</span>
              <span class="market-genre">Sensor Tower · 30d · seeded</span>
            </div>

            <div class="market-kpis" id="metric-kpis"></div>

            <div class="metrics-grid">
              <div class="metrics-block">
                <div class="market-sub">Share of Voice & velocity</div>
                <div class="sov-list" id="sov-list"></div>
              </div>
              <div class="metrics-block">
                <div class="market-sub">Est. ad spend by competitor · 30d</div>
                <div class="spend-list" id="spend-list"></div>
              </div>
              <div class="metrics-block">
                <div class="market-sub">UA spend by network</div>
                <div class="net-list" id="net-list"></div>
              </div>
              <div class="metrics-block">
                <div class="market-sub">Creative emotional-pitch mix</div>
                <div class="pitch-bar" id="pitch-bar"></div>
                <div class="pitch-legend" id="pitch-legend"></div>
              </div>
              <div class="metrics-block">
                <div class="market-sub">Creative freshness · % new this month</div>
                <div class="fresh-list" id="fresh-list"></div>
              </div>
              <div class="metrics-block">
                <div class="market-sub">Top install geos</div>
                <div class="geo-list" id="geo-list"></div>
              </div>
              <div class="metrics-block metrics-block--wide">
                <div class="market-sub">Our creatives vs. market CPI</div>
                <div class="market-bench" id="market-bench"></div>
              </div>
            </div>
          </section>

          <!-- Decision -->
          <section class="tab-panel" data-panel="decision">
            <div class="decision-heading">
              <div>
                <div class="col-title">Growth deployment</div>
                <p class="decision-subtitle">Turn the selected creative into a verified Google Ads test campaign.</p>
              </div>
              <span class="simulation-pill">Test account · no spend</span>
            </div>
            <div class="decision-grid">
            <aside class="ads-connect-card" aria-labelledby="ads-connect-title">
              <div class="ads-card-head">
                <div class="google-mark" aria-hidden="true"><span>G</span></div>
                <div><div class="ads-eyebrow">Google Ads</div><h2 id="ads-connect-title">Launch safely</h2></div>
                <span class="connection-state connection-state--idle" id="ads-connection-state"><span class="connection-dot"></span>Not verified</span>
              </div>
<!--              <div class="ads-safety-banner">-->
<!--                <span class="shield-icon" aria-hidden="true">&#10003;</span>-->
<!--                <div><strong>Test accounts only</strong><span>Production accounts are refused and campaigns are always created paused.</span></div>-->
<!--              </div>-->
              <div class="ads-account" id="ads-account" hidden>
                <div><span class="ads-account-label">Connected account</span><strong id="ads-account-name">Google Ads test client</strong></div>
                <span class="test-badge">TEST</span>
              </div>
              <div class="ads-checklist">
                <div class="ads-check"><span>1</span><div><strong>Server credentials</strong><small>Never entered or exposed in this browser</small></div></div>
                <div class="ads-check"><span>2</span><div><strong>Read-only verification</strong><small>Requires test_account = true and manager = false</small></div></div>
                <div class="ads-check"><span>3</span><div><strong>Paused campaign shell</strong><small>No ads, delivery, billing, or real performance</small></div></div>
              </div>
              <p class="ads-feedback" id="ads-feedback">Verify the server connection before launching.</p>
              <div class="ads-actions">
                <button class="ads-button ads-button--secondary" id="verify-ads-btn">Verify connection</button>
                <button class="ads-button ads-button--primary" id="launch-ads-btn" disabled><span>Create paused test campaign</span><span aria-hidden="true">&rarr;</span></button>
                <button class="ads-button ads-button--asset" id="upload-asset-btn" disabled><span>Upload & link demo image</span><span aria-hidden="true">&uarr;</span></button>
              </div>
              <div class="campaign-result" id="campaign-result" hidden>
                <span class="campaign-result-label">Campaign created</span>
                <strong id="campaign-result-id"></strong>
                <span class="campaign-paused">PAUSED</span>
              </div>
              <div class="policy-proof" id="policy-proof" hidden>
                <div class="policy-proof-head"><span>Google policy response</span><strong>CAMPAIGN NOT CREATED</strong></div>
                <p>Google Ads accepted the authenticated request and enforced its mandatory EU political-advertising declaration.</p>
                <code id="policy-proof-code"></code>
                <div class="policy-proof-meta">
                  <span>Source</span><strong>Google Ads API v24</strong>
                  <span>Request ID</span><strong id="policy-proof-request"></strong>
                  <span>Time</span><strong id="policy-proof-time"></strong>
                </div>
                <div class="policy-proof-safe"><span>✓ No campaign</span><span>✓ No serving</span><span>✓ No spend</span></div>
              </div>
              <div class="asset-result" id="asset-result" hidden>
                <img src="/api/integrations/acquisition/assets/preview" alt="Mob Control gameplay uploaded to Google Ads">
                <div><span>Stored in Google Ads</span><strong id="asset-result-name"></strong><small id="asset-result-meta"></small></div>
                <span class="test-badge">IMAGE</span>
              </div>
              <a class="ads-dashboard-link" href="https://ads.google.com/aw/overview?ocid=8380763447&workspaceId=0&ascid=8380763447&euid=864436001&__u=9448469849&uscid=8380763447&__c=6333501503&authuser=0&workflowSessionId=a77B8CC11-509D-4EDF-9542-B82F0FF2DAFD--0" target="_blank" rel="noreferrer">Open Google Ads dashboard <span aria-hidden="true">&nearr;</span></a>
              <div class="honesty-note"><strong>Real:</strong> connection + paused campaign ID <span></span> <strong>Simulated:</strong> every performance metric</div>
            </aside>
            </div>
          </section>

        </div>
      </div>

      <button class="back-fab back-fab--corner" id="back-btn" title="Back to Ads">←</button>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => {
    setRoute('ads', { runId: route.runId, gameUrl: route.gameUrl })
  })

  const badge        = document.getElementById('pipe-badge') as HTMLElement
  const variantsGrid = document.getElementById('variants-grid')!
  const marketList   = document.getElementById('market-list')!
  const marketBench  = document.getElementById('market-bench')!
  const verifyAdsButton = document.getElementById('verify-ads-btn') as HTMLButtonElement
  const launchAdsButton = document.getElementById('launch-ads-btn') as HTMLButtonElement
  const uploadAssetButton = document.getElementById('upload-asset-btn') as HTMLButtonElement
  const adsFeedback = document.getElementById('ads-feedback')!
  const adsConnectionState = document.getElementById('ads-connection-state')!
  const adsAccount = document.getElementById('ads-account')!
  const campaignResult = document.getElementById('campaign-result')!
  const policyProof = document.getElementById('policy-proof')!
  const assetResult = document.getElementById('asset-result')!

  let verificationInFlight = false
  async function verifyAdsConnection() {
    if (verificationInFlight) return
    verificationInFlight = true
    verifyAdsButton.disabled = true
    verifyAdsButton.textContent = 'Checking server...'
    adsFeedback.textContent = 'Running a read-only test-account verification.'
    let verificationStage: 'request' | 'response' | 'validation' | 'render' = 'request'
    try {
      const response = await fetch('/api/integrations/acquisition/connection', { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('connection_unavailable')
      verificationStage = 'response'
      const result: unknown = await response.json()
      verificationStage = 'validation'
      if (!isVerifiedTestAccount(result)) throw new Error('unsafe_account')

      verificationStage = 'render'
      document.getElementById('ads-account-name')!.textContent = result.descriptiveName
      adsAccount.hidden = false
      adsConnectionState.className = 'connection-state connection-state--connected'
      adsConnectionState.innerHTML = '<span class="connection-dot"></span>Verified test account'
      adsFeedback.textContent = 'Safe to create a real paused campaign shell.'
      verifyAdsButton.textContent = 'Connection verified'
      launchAdsButton.disabled = false
      uploadAssetButton.disabled = false
    } catch {
      adsConnectionState.className = 'connection-state connection-state--error'
      adsConnectionState.innerHTML = '<span class="connection-dot"></span>Setup required'
      const failureMessages = {
        request: 'The browser could not reach the server connection endpoint.',
        response: 'The server returned a response the browser could not read.',
        validation: 'The server response was rejected by the test-account safety check.',
        render: 'The connection passed, but the account card could not be updated.',
      }
      adsFeedback.textContent = `${failureMessages[verificationStage]} No credentials were sent from this browser.`
      verifyAdsButton.textContent = 'Try verification again'
      verifyAdsButton.disabled = false
    } finally {
      verificationInFlight = false
    }
  }

  verifyAdsButton.addEventListener('click', verifyAdsConnection)
  void verifyAdsConnection()

  launchAdsButton.addEventListener('click', async () => {
    launchAdsButton.disabled = true
    launchAdsButton.textContent = 'Creating paused campaign...'
    adsFeedback.textContent = 'Re-verifying the test account before the write.'
    try {
      const response = await fetch('/api/integrations/acquisition/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ runId: 'pipeline-demo' }),
      })
      const result: unknown = await response.json()
      if (!response.ok) {
        if (!isGoogleAdsPolicyResponse(result)) throw new Error('campaign_create_failed')
        document.getElementById('policy-proof-code')!.textContent = result.code
        document.getElementById('policy-proof-request')!.textContent = result.requestId ?? 'Provided by Google'
        document.getElementById('policy-proof-time')!.textContent = new Date(result.timestamp).toLocaleTimeString()
        policyProof.hidden = false
        launchAdsButton.textContent = 'Blocked safely by Google policy'
        adsFeedback.textContent = 'Real API enforcement confirmed. The campaign was not created.'
        return
      }
      if (!isPausedTestCampaign(result)) throw new Error('unsafe_campaign_response')

      document.getElementById('campaign-result-id')!.textContent = `ID ${result.campaignId}`
      campaignResult.hidden = false
      launchAdsButton.textContent = result.created ? 'Paused test campaign created' : 'Existing paused campaign found'
      adsFeedback.textContent = result.previousRemovedCount > 0
        ? `Attempt ${result.attempt} is paused; ${result.previousRemovedCount} removed attempt(s) preserved as history.`
        : 'Real campaign shell confirmed. Performance remains deterministic and simulated.'
    } catch {
      launchAdsButton.textContent = 'Try campaign creation again'
      launchAdsButton.disabled = false
      adsFeedback.textContent = 'Campaign creation failed safely. No production fallback is available.'
    }
  })

  uploadAssetButton.addEventListener('click', async () => {
    uploadAssetButton.disabled = true
    uploadAssetButton.textContent = 'Uploading image to Google Ads...'
    adsFeedback.textContent = 'Sending the protected demo image to the verified test child.'
    try {
      const response = await fetch('/api/integrations/acquisition/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ runId: 'pipeline-demo' }),
      })
      if (!response.ok) throw new Error('asset_upload_failed')
      const result: unknown = await response.json()
      if (!isUploadedDemoAsset(result)) throw new Error('unsafe_asset_response')

      document.getElementById('asset-result-name')!.textContent = result.name
      document.getElementById('asset-result-meta')!.textContent = `Asset ID ${result.assetId} · Campaign attempt ${result.campaignAttempt} · PAUSED`
      assetResult.hidden = false
      uploadAssetButton.textContent = result.linked ? 'Image linked to paused campaign' : 'Existing campaign image found'
      adsFeedback.textContent = 'Real image asset verified and linked to the PAUSED test campaign. No ad can serve.'
    } catch {
      uploadAssetButton.textContent = 'Try image upload again'
      uploadAssetButton.disabled = false
      adsFeedback.textContent = 'Image upload failed safely. No ad or campaign association was created.'
    }
  })
  let nvidiaSummaries = getNvidiaVersionSummaries()
  renderNvidiaComparison({
    recommendationContainer: document.getElementById('nvidia-recommendation')!,
    detailsContainer: document.getElementById('nvidia-comparison')!,
    detailsSection: document.getElementById('nvidia-details-section')!,
    onLoaded: summaries => {
      nvidiaSummaries = summaries
      applyNvidiaScores(variantsGrid, nvidiaSummaries)
    },
  })

  // ── Tab switching ──
  const tabsBar = document.getElementById('analytics-tabs')!
  const panels  = root.querySelectorAll<HTMLElement>('.tab-panel')
  let globeDispose: (() => void) | null = null
  let globeStarted = false

  tabsBar.querySelectorAll<HTMLButtonElement>('.atab').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab!
      tabsBar.querySelectorAll('.atab').forEach(b => b.classList.remove('atab--active'))
      btn.classList.add('atab--active')
      panels.forEach(p => p.classList.toggle('tab-panel--active', p.dataset.panel === id))
      if (id === 'competitors' && !globeStarted) startGlobe()
    })
  })

  // ── Globe (lazy: only build when Competitors tab first opened) ──
  function startGlobe() {
    globeStarted = true
    const wrap = document.getElementById('globe-wrap')!
    const pop  = document.getElementById('globe-pop') as HTMLElement
    const points: GlobePoint[] = MARKET.competitors.map(c => ({
      lat: c.lat, lng: c.lng, label: c.name, color: c.color,
      meta: {
        Publisher: c.publisher,
        HQ: c.city,
        'Ad spend 30d': c.adSpend,
        'Spend MoM': (c.spendTrend >= 0 ? '▲ ' : '▼ ') + Math.abs(c.spendTrend) + '%',
        'Top network': c.topNetwork,
        'Active ads': String(c.creatives),
        Installs: c.installs + ' /30d',
        Revenue: c.revenue + ' /30d',
        CPI: c.cpi,
      },
    }))
    points.push({ lat: HOME[0], lng: HOME[1], label: 'Our studio', color: '#ffffff', size: 0.03,
      meta: { Studio: 'Mantra', Location: 'Paris, FR', Status: 'Testing 5 prototypes' } })
    const arcs: GlobeArc[] = MARKET.competitors.map(c => ({
      from: HOME, to: [c.lat, c.lng] as [number, number], color: c.color,
    }))

    globeDispose = createGlobe(wrap, points, arcs, (p) => {
      if (!p) { pop.style.display = 'none'; return }
      pop.innerHTML = `
        <div class="pop-head">
          <span class="pop-dot" style="background:${p.color}"></span>
          <span class="pop-title">${p.label}</span>
          <button class="pop-close" id="pop-close">×</button>
        </div>
        <div class="pop-rows">
          ${Object.entries(p.meta ?? {}).map(([k, v]) =>
            `<div class="pop-row"><span>${k}</span><span>${v}</span></div>`).join('')}
        </div>
      `
      pop.style.display = 'block'
      document.getElementById('pop-close')?.addEventListener('click', () => { pop.style.display = 'none' })
    })
  }

  // ── Animate pipeline nodes (drives reveal timing, shown in badge) ──
  PIPELINE_NODES.forEach((_node, i) => {
    setTimeout(() => {
      const done = i + 1
      if (done < PIPELINE_NODES.length) {
        badge.querySelector('span:last-child')!.textContent =
          `${done}/${PIPELINE_NODES.length} · ${PIPELINE_NODES[i].label}`
      }
    }, i * 900 + 700)
  })

  // ── Creative previews (Overview tab) ──
  const ticks: (() => void)[] = []
  const rankedVariants = [...VARIANTS].sort((left, right) => {
    return nvidiaRank(left.id, nvidiaSummaries) - nvidiaRank(right.id, nvidiaSummaries)
  })
  rankedVariants.forEach((v, i) => {
    setTimeout(() => {
      const session = SESSIONS[v.id]
      const card = document.createElement('div')
      card.className = 'variant-card variant-card--in'
      card.dataset.versionId = String(v.id)
      card.innerHTML = `
        <div class="variant-preview">
          <canvas id="vcanvas-${v.id}" width="${VW}" height="${VH}"></canvas>
          <div class="variant-nvidia-rank"></div>
          <div class="variant-nvidia-score"><span>NVIDIA</span><strong></strong></div>
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
      applyNvidiaScores(variantsGrid, nvidiaSummaries)
      const canvas = document.getElementById('vcanvas-' + v.id) as HTMLCanvasElement
      ticks.push(GAME_FNS[v.id](canvas))
    }, 1500 + i * 200)
  })

  let raf = 0
  function loop() { raf = requestAnimationFrame(loop); ticks.forEach(t => t()) }
  loop()
  window.addEventListener('hashchange', () => {
    cancelAnimationFrame(raf)
    if (globeDispose) globeDispose()
  }, { once: true })

  // ── Competitor list (Competitors tab) — spend & scale ──
  MARKET.competitors.forEach(c => {
    const up = c.spendTrend >= 0
    const row = document.createElement('div')
    row.className = 'market-comp'
    row.innerHTML = `
      <span class="mc-dot" style="background:${c.color}"></span>
      <div class="mc-main">
        <span class="mc-name">${c.name}</span>
        <span class="mc-pub">${c.publisher} · ${c.city}</span>
        <span class="mc-tags">
          <span class="mc-tag">Ad spend ${c.adSpend}</span>
          <span class="mc-tag mc-trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(c.spendTrend)}%</span>
          <span class="mc-tag">${c.topNetwork}</span>
        </span>
      </div>
      <div class="mc-stats">
        <span title="Installs 30d">${c.installs}</span>
        <span title="Active creatives">${c.creatives} ads</span>
      </div>
    `
    marketList.appendChild(row)
  })

  // ── Metrics: headline KPIs ──
  const kpiWrap = document.getElementById('metric-kpis')!
  METRIC_KPIS.forEach(k => {
    const up = k.trend >= 0
    const el = document.createElement('div')
    el.className = 'mkpi'
    el.innerHTML = `
      <span class="mkpi-val">${k.val}</span>
      <span class="mkpi-lbl">${k.lbl}</span>
      <span class="mkpi-trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(k.trend)}% MoM</span>
    `
    kpiWrap.appendChild(el)
  })

  // ── Metrics: Share of Voice + velocity ──
  const sovList = document.getElementById('sov-list')!
  const maxSov = Math.max(...SOV.map(s => s.sov))
  SOV.forEach(s => {
    const up = s.velocity >= 0
    const row = document.createElement('div')
    row.className = 'sov-row'
    row.innerHTML = `
      <span class="sov-name">${s.name}<span class="sov-pub">${s.pub}</span></span>
      <div class="sov-bar-wrap"><div class="sov-bar" style="width:${(s.sov / maxSov * 100).toFixed(0)}%"></div></div>
      <span class="sov-val">${s.sov}%</span>
      <span class="sov-vel ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${Math.abs(s.velocity)}%</span>
    `
    sovList.appendChild(row)
  })

  // ── Metrics: emotional-pitch mix (stacked bar) ──
  const pitchBar = document.getElementById('pitch-bar')!
  const pitchLegend = document.getElementById('pitch-legend')!
  PITCH_MIX.forEach(p => {
    const seg = document.createElement('div')
    seg.className = 'pitch-seg'
    seg.style.width = p.pct + '%'
    seg.style.background = p.color
    seg.title = `${p.pitch} · ${p.pct}%`
    pitchBar.appendChild(seg)
    const leg = document.createElement('span')
    leg.className = 'pitch-leg'
    leg.innerHTML = `<span class="pl-dot" style="background:${p.color}"></span>${p.pitch} <strong>${p.pct}%</strong>`
    pitchLegend.appendChild(leg)
  })

  // ── Metrics: creative freshness ──
  const freshList = document.getElementById('fresh-list')!
  FRESHNESS.forEach(f => {
    const row = document.createElement('div')
    row.className = 'fresh-row'
    row.innerHTML = `
      <span class="fresh-name">${f.name}</span>
      <div class="fresh-bar-wrap"><div class="fresh-bar" style="width:${f.fresh}%;background:${f.color}"></div></div>
      <span class="fresh-val">${f.fresh}%</span>
    `
    freshList.appendChild(row)
  })

  // ── Metrics: top geos ──
  const geoList = document.getElementById('geo-list')!
  const maxGeo = Math.max(...GEO_SPLIT.map(g => g.share))
  GEO_SPLIT.forEach(g => {
    const row = document.createElement('div')
    row.className = 'geo-row'
    row.innerHTML = `
      <span class="geo-name">${g.geo}</span>
      <div class="geo-bar-wrap"><div class="geo-bar" style="width:${(g.share / maxGeo * 100).toFixed(0)}%"></div></div>
      <span class="geo-val">${g.share}%</span>
    `
    geoList.appendChild(row)
  })

  // ── Metrics: UA spend by network ──
  const netList = document.getElementById('net-list')!
  const maxShare = Math.max(...NETWORK_SPLIT.map(n => n.share))
  NETWORK_SPLIT.forEach(n => {
    const up = n.trend >= 0
    const row = document.createElement('div')
    row.className = 'net-row'
    row.innerHTML = `
      <span class="net-name">${n.network}</span>
      <div class="net-bar-wrap">
        <div class="net-bar" style="width:${(n.share / maxShare * 100).toFixed(0)}%"></div>
      </div>
      <span class="net-share">${n.share}%</span>
      <span class="net-trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${Math.abs(n.trend)}%</span>
    `
    netList.appendChild(row)
  })

  // ── Metrics: est. ad spend by competitor ──
  const spendList = document.getElementById('spend-list')!
  const spendVals = MARKET.competitors.map(c => parseFloat(c.adSpend.replace(/[$M]/g, '')))
  const maxSpend = Math.max(...spendVals)
  MARKET.competitors.forEach((c, i) => {
    const row = document.createElement('div')
    row.className = 'spend-row'
    row.innerHTML = `
      <span class="spend-name" style="color:${c.color}">${c.name}</span>
      <div class="spend-bar-wrap">
        <div class="spend-bar" style="width:${(spendVals[i] / maxSpend * 100).toFixed(0)}%;background:${c.color}"></div>
      </div>
      <span class="spend-val">${c.adSpend}</span>
    `
    spendList.appendChild(row)
  })

  // ── Benchmark bars (Metrics tab) ──
  VARIANTS.forEach(v => {
    const cpi = parseFloat(v.cpi.replace('$', ''))
    const beats = cpi < medCpi
    const session = SESSIONS[v.id]
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

  // ── Finish badge ──
  const totalDelay = PIPELINE_NODES.length * 900 + 400
  setTimeout(() => {
    badge.innerHTML = route.variantsPending
      ? '<span style="color:var(--accent);font-weight:600;font-size:13px">Dashboard ready · variants pending</span>'
      : '<span style="color:var(--accent);font-weight:600;font-size:13px">✓ Pipeline complete</span>'
  }, totalDelay)
}

interface VerifiedAdsAccount {
  connected: true
  environment: 'TEST'
  descriptiveName: string
  testAccount: true
  manager: false
}

interface PausedTestCampaign {
  campaignId: string
  status: 'PAUSED'
  testAccount: true
  created: boolean
  attempt: number
  previousRemovedCount: number
}

interface GoogleAdsPolicyResponse {
  code: 'EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED' | 'MISSING_EU_POLITICAL_ADVERTISING_SELF_DECLARATION'
  source: 'Google Ads API v24'
  requestId: string | null
  timestamp: string
  campaignCreated: false
  adsServed: false
  spend: false
}

interface UploadedDemoAsset {
  assetId: string
  name: string
  type: 'IMAGE'
  source: string
  testAccount: true
  created: boolean
  timestamp: string
  campaignId: string
  campaignAttempt: number
  linked: boolean
  campaignStatus: 'PAUSED'
}

function isVerifiedTestAccount(value: unknown): value is VerifiedAdsAccount {
  if (typeof value !== 'object' || value === null) return false
  const account = value as Record<string, unknown>
  return account.connected === true
    && account.environment === 'TEST'
    && typeof account.descriptiveName === 'string'
    && account.descriptiveName.length > 0
    && account.testAccount === true
    && account.manager === false
}

function isPausedTestCampaign(value: unknown): value is PausedTestCampaign {
  if (typeof value !== 'object' || value === null) return false
  const campaign = value as Record<string, unknown>
  return typeof campaign.campaignId === 'string'
    && campaign.campaignId.length > 0
    && campaign.status === 'PAUSED'
    && campaign.testAccount === true
    && typeof campaign.created === 'boolean'
    && typeof campaign.attempt === 'number'
    && Number.isInteger(campaign.attempt)
    && campaign.attempt > 0
    && typeof campaign.previousRemovedCount === 'number'
    && Number.isInteger(campaign.previousRemovedCount)
    && campaign.previousRemovedCount >= 0
}

function isGoogleAdsPolicyResponse(value: unknown): value is GoogleAdsPolicyResponse {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Record<string, unknown>
  return (response.code === 'EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED'
      || response.code === 'MISSING_EU_POLITICAL_ADVERTISING_SELF_DECLARATION')
    && response.source === 'Google Ads API v24'
    && (typeof response.requestId === 'string' || response.requestId === null)
    && typeof response.timestamp === 'string'
    && response.campaignCreated === false
    && response.adsServed === false
    && response.spend === false
}

function isUploadedDemoAsset(value: unknown): value is UploadedDemoAsset {
  if (typeof value !== 'object' || value === null) return false
  const asset = value as Record<string, unknown>
  return typeof asset.assetId === 'string'
    && asset.assetId.length > 0
    && typeof asset.name === 'string'
    && asset.name.length > 0
    && asset.type === 'IMAGE'
    && typeof asset.source === 'string'
    && asset.testAccount === true
    && typeof asset.created === 'boolean'
    && typeof asset.timestamp === 'string'
    && typeof asset.campaignId === 'string'
    && asset.campaignId.length > 0
    && typeof asset.campaignAttempt === 'number'
    && Number.isInteger(asset.campaignAttempt)
    && typeof asset.linked === 'boolean'
    && asset.campaignStatus === 'PAUSED'
}

function nvidiaRank(versionId: number, summaries: NvidiaVersionSummary[]): number {
  return summaries.find(summary => summary.id === String(versionId))?.rank ?? Number.MAX_SAFE_INTEGER
}

function applyNvidiaScores(container: HTMLElement, summaries: NvidiaVersionSummary[]) {
  const summaryById = new Map(summaries.map(summary => [summary.id, summary]))
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.variant-card'))
  cards.forEach(card => {
    const summary = summaryById.get(card.dataset.versionId ?? '')
    if (!summary) return
    const hue = Math.max(0, Math.min(120, (summary.score - 45) * 2.18))
    const glow = Math.max(0.18, Math.min(0.85, (summary.score - 45) / 55))
    card.style.setProperty('--variant-nv-hue', hue.toFixed(0))
    card.style.setProperty('--variant-nv-glow', glow.toFixed(2))
    card.classList.toggle('variant-card--nvidia-pick', summary.rank === 1)
    card.classList.toggle('variant-card--nvidia-kill', summary.verdict === 'kill')
    const rank = card.querySelector<HTMLElement>('.variant-nvidia-rank')
    const score = card.querySelector<HTMLElement>('.variant-nvidia-score strong')
    if (rank) rank.textContent = summary.rank === 1 ? 'NVIDIA PICK' : `#${summary.rank}`
    if (score) score.textContent = summary.score.toFixed(1)
  })
  cards
    .sort((left, right) => {
      const leftRank = summaryById.get(left.dataset.versionId ?? '')?.rank ?? Number.MAX_SAFE_INTEGER
      const rightRank = summaryById.get(right.dataset.versionId ?? '')?.rank ?? Number.MAX_SAFE_INTEGER
      return leftRank - rightRank
    })
    .forEach(card => container.appendChild(card))
}
