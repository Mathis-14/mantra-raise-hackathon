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

const MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'

const VERSIONS: DemoVersionAnalysis[] = [
  {
    id: 'high-contrast',
    name: 'High Contrast',
    rank: 1,
    overallScore: 84,
    verdict: 'promising',
    summary: 'Best overall readability and the clearest audiovisual reward feedback.',
    dimensions: {
      color: { score: 88, summary: 'Enemies and gates stay distinct during crowding.' },
      audio: { score: 79, summary: 'Impacts and rewards are clear and synchronized.' },
      video: { score: 84, summary: 'An early decision point sustains momentum.' },
    },
    evidence: [
      { timestamp: '00:04.6', observation: 'Enemy silhouettes remain distinct against the track.' },
      { timestamp: '00:11.2', observation: 'Reward sound lands with the visual crowd expansion.' },
    ],
  },
  {
    id: 'audio-punch',
    name: 'Audio Punch',
    rank: 2,
    overallScore: 77.4,
    verdict: 'promising',
    summary: 'Strong feedback improves game feel, but visual crowding remains unresolved.',
    dimensions: {
      color: { score: 68, summary: 'Crowds still merge with the track at peak density.' },
      audio: { score: 91, summary: 'The strongest impacts and reward confirmation.' },
      video: { score: 76, summary: 'Good tempo with one quiet middle interval.' },
    },
    evidence: [
      { timestamp: '00:07.9', observation: 'Impact transient makes the collision immediately legible.' },
      { timestamp: '00:16.4', observation: 'Overlapping units reduce visual threat recognition.' },
    ],
  },
  {
    id: 'original',
    name: 'Original',
    rank: 3,
    overallScore: 62.5,
    verdict: 'iterate',
    summary: 'The core loop reads, but weak contrast and feedback reduce the payoff.',
    dimensions: {
      color: { score: 61, summary: 'Enemies blend into the track during crowded encounters.' },
      audio: { score: 58, summary: 'Important collisions have weak feedback.' },
      video: { score: 66, summary: 'The opening works, but the middle loses momentum.' },
    },
    evidence: [
      { timestamp: '00:08.2', observation: 'No new threat or reward appears for several seconds.' },
      { timestamp: '00:14.7', observation: 'Gate and background colors become difficult to separate.' },
    ],
  },
]

const DEMO_VIEW: ComparisonView = {
  model: MODEL,
  winnerId: 'high-contrast',
  winnerReason: 'High Contrast leads through better color readability and sustained pacing.',
  versions: VERSIONS,
  live: false,
}

export function renderNvidiaComparison(container: HTMLElement, view: ComparisonView = DEMO_VIEW) {
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
      renderNvidiaComparison(container, parseComparisonView(parsed))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid comparison file'
      window.alert(`Could not load NVIDIA comparison: ${message}`)
    }
  })
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
  return `
    <article class="nv-version${winnerClass}">
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
