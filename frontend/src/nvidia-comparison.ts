type DimensionName = 'color' | 'audio' | 'video'

interface DemoVersionAnalysis {
  id: string
  name: string
  rank: number
  overallScore: number
  verdict: 'promising' | 'iterate' | 'kill'
  summary: string
  dimensions: Record<DimensionName, { score: number; summary: string }>
  evidence: { timestamp: string; observation: string }[]
}

interface ComparisonView {
  model: string
  winnerId: string
  winnerReason: string
  versions: DemoVersionAnalysis[]
  live: boolean
}

export interface NvidiaVersionSummary {
  id: string
  rank: number
  score: number
  verdict: DemoVersionAnalysis['verdict']
}

const MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

const VERSIONS: DemoVersionAnalysis[] = [
  {
    id: '2',
    name: 'Sky Hop',
    rank: 1,
    overallScore: 91.2,
    verdict: 'promising',
    summary: 'The strongest first-look clarity, pacing, and reward loop of the set.',
    dimensions: {
      color: { score: 94, summary: 'Platforms and player remain distinct at every height.' },
      audio: { score: 84, summary: 'Landing feedback reinforces every successful jump.' },
      video: { score: 93, summary: 'A meaningful action and payoff arrive immediately.' },
    },
    evidence: [
      { timestamp: '00:02.1', observation: 'The first jump communicates the complete loop instantly.' },
      { timestamp: '00:09.4', observation: 'Vertical motion creates a clear anticipation-payoff rhythm.' },
    ],
  },
  {
    id: '0',
    name: 'Speed Dash',
    rank: 2,
    overallScore: 84,
    verdict: 'promising',
    summary: 'Strong motion and instant threat recognition create an effective hook.',
    dimensions: {
      color: { score: 88, summary: 'Obstacles stay distinct from the road and player.' },
      audio: { score: 79, summary: 'Dodges have clear but slightly repetitive feedback.' },
      video: { score: 84, summary: 'Continuous forward motion sustains attention.' },
    },
    evidence: [
      { timestamp: '00:04.6', observation: 'Incoming obstacle and escape lane read in one glance.' },
      { timestamp: '00:11.2', observation: 'Speed remains high without overwhelming the player.' },
    ],
  },
  {
    id: '4',
    name: 'Astro Dodge',
    rank: 3,
    overallScore: 77.4,
    verdict: 'promising',
    summary: 'Strong audiovisual feedback, with slightly weaker moment-to-moment clarity.',
    dimensions: {
      color: { score: 72, summary: 'Projectiles compete with the background at peak density.' },
      audio: { score: 91, summary: 'The strongest impacts and reward confirmation.' },
      video: { score: 75, summary: 'Good tempo with occasional visual overload.' },
    },
    evidence: [
      { timestamp: '00:07.9', observation: 'Impact transient makes a successful hit immediately legible.' },
      { timestamp: '00:16.4', observation: 'Overlapping projectiles reduce threat recognition.' },
    ],
  },
  {
    id: '1',
    name: 'Block Blitz',
    rank: 4,
    overallScore: 69.8,
    verdict: 'iterate',
    summary: 'Readable interactions, but the visual payoff does not escalate enough.',
    dimensions: {
      color: { score: 76, summary: 'Blocks are distinct but use a narrow color range.' },
      audio: { score: 66, summary: 'Repeated hits lack variation and progression.' },
      video: { score: 67, summary: 'The loop is clear but visually flat after the opening.' },
    },
    evidence: [
      { timestamp: '00:05.8', observation: 'The first break is clear but later hits feel identical.' },
      { timestamp: '00:13.2', observation: 'No larger reward changes the visual rhythm.' },
    ],
  },
  {
    id: '3',
    name: 'Neon Snake',
    rank: 5,
    overallScore: 56.8,
    verdict: 'kill',
    summary: 'The weakest hook: low event density and limited audiovisual progression.',
    dimensions: {
      color: { score: 63, summary: 'Neon contrast is strong but visually monotonous.' },
      audio: { score: 51, summary: 'Actions receive little differentiated feedback.' },
      video: { score: 56, summary: 'Long low-intensity intervals weaken retention.' },
    },
    evidence: [
      { timestamp: '00:08.2', observation: 'No new threat or reward appears for several seconds.' },
      { timestamp: '00:14.7', observation: 'Movement continues without a visible escalation.' },
    ],
  },
]

const DEMO_VIEW: ComparisonView = {
  model: MODEL,
  winnerId: '2',
  winnerReason: 'Sky Hop wins because its mechanic reads instantly and every jump creates a visible anticipation-payoff loop.',
  versions: VERSIONS,
  live: false,
}

export function getNvidiaVersionSummaries(): NvidiaVersionSummary[] {
  return summariesFromView(DEMO_VIEW)
}

export function renderNvidiaComparison(
  container: HTMLElement,
  onLoaded?: (summaries: NvidiaVersionSummary[]) => void,
) {
  renderComparisonView(container, DEMO_VIEW, onLoaded)
}

function renderComparisonView(
  container: HTMLElement,
  view: ComparisonView,
  onLoaded?: (summaries: NvidiaVersionSummary[]) => void,
) {
  const winner = view.versions.find(version => version.id === view.winnerId)
  if (!winner) return

  container.innerHTML = `
    <div class="nv-provenance">
      <span class="nv-provider">NVIDIA NIM</span>
      <span class="nv-model">${view.model}</span>
      <span class="nv-mode">${view.live ? 'Live NVIDIA result' : 'Demo comparison · live result not loaded'}</span>
      <button class="nv-load" id="nv-load-result" type="button">Load result JSON</button>
      <input id="nv-result-file" type="file" accept="application/json,.json" hidden />
    </div>

    <div class="nv-winner">
      <div>
        <div class="nv-kicker">NVIDIA recommendation</div>
        <h2>${winner.name} is the best gameplay version</h2>
        <p>${view.winnerReason}</p>
      </div>
      <div class="nv-winner-score">
        <strong>${winner.overallScore.toFixed(1)}</strong>
        <span>weighted score</span>
      </div>
    </div>

    <div class="nv-weights">
      Score weighting: <strong>45% video pacing</strong> · <strong>30% color readability</strong> · <strong>25% audio feedback</strong>
    </div>

    <div class="nv-version-grid">
      ${view.versions.map(renderVersionCard).join('')}
    </div>
  `

  const loadButton = container.querySelector<HTMLButtonElement>('#nv-load-result')
  const fileInput = container.querySelector<HTMLInputElement>('#nv-result-file')
  loadButton?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const nextView = parseComparisonView(parsed)
      onLoaded?.(summariesFromView(nextView))
      renderComparisonView(container, nextView, onLoaded)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid comparison file'
      window.alert(`Could not load NVIDIA comparison: ${message}`)
    }
  })
}

function summariesFromView(view: ComparisonView): NvidiaVersionSummary[] {
  return view.versions.map(version => ({
    id: version.id,
    rank: version.rank,
    score: version.overallScore,
    verdict: version.verdict,
  }))
}

function parseComparisonView(value: unknown): ComparisonView {
  if (!isRecord(value) || typeof value.winner_version_id !== 'string' || typeof value.winner_reason !== 'string') {
    throw new Error('Missing NVIDIA winner fields')
  }
  if (!Array.isArray(value.versions) || value.versions.length < 2) {
    throw new Error('At least two analyzed versions are required')
  }
  const versions = value.versions.map(parseLiveVersion)
  const winner = versions.find(version => version.id === value.winner_version_id)
  if (!winner) throw new Error('Winner does not match an analyzed version')

  const firstRawVersion = value.versions[0]
  const model = isRecord(firstRawVersion)
    && isRecord(firstRawVersion.provenance)
    && typeof firstRawVersion.provenance.model === 'string'
      ? firstRawVersion.provenance.model
      : MODEL
  return {
    model,
    winnerId: value.winner_version_id,
    winnerReason: value.winner_reason,
    versions,
    live: true,
  }
}

function parseLiveVersion(value: unknown): DemoVersionAnalysis {
  if (!isRecord(value)) throw new Error('Invalid version analysis')
  if (
    typeof value.version_id !== 'string'
    || typeof value.version_name !== 'string'
    || typeof value.rank !== 'number'
    || typeof value.overall_score !== 'number'
    || typeof value.summary !== 'string'
    || (value.verdict !== 'promising' && value.verdict !== 'iterate' && value.verdict !== 'kill')
  ) {
    throw new Error('Invalid version identity or score')
  }
  return {
    id: value.version_id,
    name: value.version_name,
    rank: value.rank,
    overallScore: value.overall_score,
    verdict: value.verdict,
    summary: value.summary,
    dimensions: {
      color: parseLiveDimension(value.color),
      audio: parseLiveDimension(value.audio),
      video: parseLiveDimension(value.video),
    },
    evidence: parseLiveEvidence(value.evidence),
  }
}

function parseLiveDimension(value: unknown): { score: number; summary: string } {
  if (!isRecord(value) || typeof value.score !== 'number' || typeof value.summary !== 'string') {
    throw new Error('Invalid NVIDIA dimension score')
  }
  return { score: value.score, summary: value.summary }
}

function parseLiveEvidence(value: unknown): { timestamp: string; observation: string }[] {
  if (!Array.isArray(value)) throw new Error('Invalid NVIDIA evidence')
  return value.slice(0, 3).map(item => {
    if (!isRecord(item) || typeof item.timestamp_seconds !== 'number' || typeof item.observation !== 'string') {
      throw new Error('Invalid timestamped evidence')
    }
    return { timestamp: formatTimestamp(item.timestamp_seconds), observation: item.observation }
  })
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${String(minutes).padStart(2, '0')}:${remainder}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function renderVersionCard(version: DemoVersionAnalysis): string {
  const winnerClass = version.rank === 1 ? ' nv-version--winner' : ''
  const strength = Math.max(0, Math.min(1, (version.overallScore - 50) / 50))
  const tint = strength * 0.12
  const winnerTint = 0.12 + strength * 0.16
  return `
    <article class="nv-version nv-version--rank-${Math.min(version.rank, 3)}${winnerClass}" style="--nv-tint:${tint.toFixed(3)};--nv-winner-tint:${winnerTint.toFixed(3)}">
      <div class="nv-version-head">
        <span class="nv-rank">#${version.rank}</span>
        <div>
          <h3>${version.name}</h3>
          <span class="nv-verdict nv-verdict--${version.verdict}">${version.verdict}</span>
        </div>
        <strong class="nv-score">${version.overallScore.toFixed(1)}</strong>
      </div>
      <p class="nv-summary">${version.summary}</p>
      <div class="nv-dimensions">
        ${renderDimension('Color', version.dimensions.color)}
        ${renderDimension('Audio', version.dimensions.audio)}
        ${renderDimension('Video', version.dimensions.video)}
      </div>
      <div class="nv-evidence-title">Timestamped evidence</div>
      <div class="nv-evidence">
        ${version.evidence.map(item => `
          <div><time>${item.timestamp}</time><span>${item.observation}</span></div>
        `).join('')}
      </div>
    </article>
  `
}

function renderDimension(
  label: string,
  dimension: { score: number; summary: string },
): string {
  return `
    <div class="nv-dimension" title="${dimension.summary}">
      <div class="nv-dimension-head"><span>${label}</span><strong>${dimension.score}</strong></div>
      <div class="nv-bar"><span style="width:${dimension.score}%"></span></div>
      <p>${dimension.summary}</p>
    </div>
  `
}
