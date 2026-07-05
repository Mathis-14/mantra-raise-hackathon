export type FlowScreen = 'landing' | 'playtest' | 'variants' | 'ads' | 'pipeline'
export type FlowStep = 'playtest' | 'variants' | 'ads' | 'dashboard'

export interface FlowRoute {
  screen: FlowScreen
  runId: string | null
  gameUrl: string | null
  variantsPending: boolean
  liveStreamBaseUrl: string | null
}

export interface RouteTarget {
  runId?: string | null
  gameUrl?: string | null
  variantsPending?: boolean
  liveStreamBaseUrl?: string | null
}

const STEP_LABELS: Array<{ id: FlowStep; index: string; label: string }> = [
  { id: 'playtest', index: '1', label: 'Gameplay' },
  { id: 'variants', index: '2', label: 'Variants' },
  { id: 'ads', index: '3', label: 'Ads' },
  { id: 'dashboard', index: '4', label: 'Dashboard' },
]

export function parseRoute(): FlowRoute {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  const [screenPart = '', query = ''] = hash.split('?')
  const params = new URLSearchParams(query)

  const screen =
    screenPart === 'playtest' || screenPart === 'variants' ||
    screenPart === 'ads' || screenPart === 'pipeline'
      ? screenPart
      : 'landing'

  return {
    screen,
    runId: params.get('run'),
    gameUrl: params.get('game'),
    variantsPending: params.get('variantsPending') === '1',
    liveStreamBaseUrl: params.get('live'),
  }
}

export function setRoute(screen: FlowScreen, target: RouteTarget = {}) {
  if (screen === 'landing') {
    location.hash = ''
    return
  }

  const params = new URLSearchParams()
  if (target.runId) params.set('run', target.runId)
  if (target.gameUrl) params.set('game', target.gameUrl)
  if (target.variantsPending) params.set('variantsPending', '1')
  if (target.liveStreamBaseUrl) params.set('live', target.liveStreamBaseUrl)

  const query = params.toString()
  location.hash = query ? `${screen}?${query}` : screen
}

function stepClass(step: FlowStep, active: FlowStep): string {
  const activeIndex = STEP_LABELS.findIndex((item) => item.id === active)
  const stepIndex = STEP_LABELS.findIndex((item) => item.id === step)
  if (stepIndex < activeIndex) return 'flow-step flow-step--complete'
  if (stepIndex === activeIndex) return 'flow-step flow-step--active'
  return 'flow-step'
}

export function renderStepper(active: FlowStep): string {
  return `
    <div class="flow-stepper" aria-label="Pipeline progress">
      ${STEP_LABELS.map((step) => `
        <div class="${stepClass(step.id, active)}">
          <span class="flow-step-circle">${step.index}</span>
          <span class="flow-step-label">${step.label}</span>
        </div>
      `).join('')}
    </div>
  `
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error'
}
