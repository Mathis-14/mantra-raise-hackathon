export type RunStatus =
  | 'created'
  | 'playtesting'
  | 'awaiting_approval'
  | 'generating_variants'
  | 'generating_creatives'
  | 'deploying'
  | 'measuring'
  | 'deciding'
  | 'done'
  | 'failed'

export interface UploadGameResponse {
  gameUrl: string
  storagePath: string
  filename: string
}

export interface ProjectRef {
  id: string
  name: string
  gameUrl: string
}

export interface RunRef {
  id: string
  status: RunStatus
}

export interface FlowEvent {
  id: string
  node: string
  type: string
  message: string
  screenshotUrl: string | null
  createdAt: string
}

export interface FlowVariant {
  id: string
  name: string
  hypothesis: string
  gameHtml: string
}

export interface RunState {
  run: RunRef
  project: ProjectRef | null
  events: FlowEvent[]
  variants: FlowVariant[]
  headline: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') throw new Error(`Invalid API response: ${key}`)
  return value
}

function getOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function parseStatus(value: unknown): RunStatus {
  switch (value) {
    case 'created':
    case 'playtesting':
    case 'awaiting_approval':
    case 'generating_variants':
    case 'generating_creatives':
    case 'deploying':
    case 'measuring':
    case 'deciding':
    case 'done':
    case 'failed':
      return value
    default:
      throw new Error('Invalid API response: status')
  }
}

async function readJson(response: Response): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : response.statusText
    throw new Error(message)
  }
  return payload
}

function parseUploadResponse(payload: unknown): UploadGameResponse {
  if (!isRecord(payload)) throw new Error('Invalid upload response')
  return {
    gameUrl: getString(payload, 'game_url'),
    storagePath: getString(payload, 'storage_path'),
    filename: getString(payload, 'filename'),
  }
}

function parseProject(payload: unknown): ProjectRef {
  if (!isRecord(payload)) throw new Error('Invalid project response')
  return {
    id: getString(payload, 'id'),
    name: getString(payload, 'name'),
    gameUrl: getString(payload, 'game_url'),
  }
}

function parseRun(payload: unknown): RunRef {
  if (!isRecord(payload)) throw new Error('Invalid run response')
  return {
    id: getString(payload, 'id'),
    status: parseStatus(payload.status),
  }
}

function parseEvents(payload: unknown): FlowEvent[] {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((item) => {
    if (!isRecord(item) || typeof item.message !== 'string') return []
    return [{
      id: getOptionalString(item, 'id') ?? `${item.message}-${item.created_at ?? ''}`,
      node: getOptionalString(item, 'node') ?? 'agent',
      type: getOptionalString(item, 'type') ?? 'status',
      message: item.message,
      screenshotUrl: getOptionalString(item, 'screenshot_url'),
      createdAt: getOptionalString(item, 'created_at') ?? '',
    }]
  })
}

function parseVariants(payload: unknown): FlowVariant[] {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = getOptionalString(item, 'id')
    const name = getOptionalString(item, 'name')
    const gameHtml = getOptionalString(item, 'game_html')
    if (!id || !name || !gameHtml) return []

    return [{
      id,
      name,
      hypothesis: getOptionalString(item, 'hypothesis') ?? 'Generated variant',
      gameHtml,
    }]
  })
}

function parseHeadline(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  return getOptionalString(payload, 'headline')
}

function parseRunState(payload: unknown): RunState {
  if (!isRecord(payload)) throw new Error('Invalid run state response')
  return {
    run: parseRun(payload.run),
    project: payload.project === null ? null : parseProject(payload.project),
    events: parseEvents(payload.events),
    variants: parseVariants(payload.variants),
    headline: parseHeadline(payload.playtest_report),
  }
}

export async function uploadGame(file: File): Promise<UploadGameResponse> {
  const formData = new FormData()
  formData.set('file', file)

  return parseUploadResponse(await readJson(await fetch('/api/uploads/game', {
    method: 'POST',
    body: formData,
  })))
}

export async function createProject(input: {
  name: string
  gameUrl: string
  marketContext: string | null
}): Promise<ProjectRef> {
  return parseProject(await readJson(await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      game_url: input.gameUrl,
      market_context: input.marketContext,
    }),
  })))
}

export async function startRun(projectId: string): Promise<RunRef> {
  return parseRun(await readJson(await fetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  })))
}

export async function approveRun(runId: string): Promise<RunRef> {
  return parseRun(await readJson(await fetch(`/api/runs/${encodeURIComponent(runId)}/approve`, {
    method: 'POST',
  })))
}

export async function fetchRunState(runId: string): Promise<RunState> {
  return parseRunState(await readJson(await fetch(`/api/runs/${encodeURIComponent(runId)}/state`, {
    cache: 'no-store',
  })))
}
