// CANONICAL CONTRACTS — the only shared surface between the four work streams.
// Changing anything here = announce in team chat + update every consumer in the
// same commit. Never work around this file with local copies of these types.

// ── Pipeline state machine ──────────────────────────────────────────────────

export const RUN_STATUSES = [
  "created",
  "playtesting",
  "awaiting_approval",
  "generating_variants",
  "generating_creatives",
  "deploying",
  "measuring",
  "deciding",
  "done",
  "failed",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

// Legal transitions. The worker advances a run only along these edges; the
// approval gate (dashboard button) owns awaiting_approval → generating_variants.
export const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  created: ["playtesting", "failed"],
  playtesting: ["awaiting_approval", "failed"],
  awaiting_approval: ["generating_variants", "failed"],
  generating_variants: ["generating_creatives", "failed"],
  generating_creatives: ["deploying", "failed"],
  deploying: ["measuring", "failed"],
  measuring: ["deciding", "failed"],
  deciding: ["done", "failed"],
  done: [],
  failed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

// ── Core rows ───────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  /** URL the playtest agent opens — http(s) for hosted games, file:// for local HTML. */
  game_url: string;
  /** Market/trend context fed to variant generation and the decision node. */
  market_context: string | null;
  created_at: string;
}

export interface Run {
  id: string;
  project_id: string;
  status: RunStatus;
  /** Set only when status = failed. */
  failed_step: RunStatus | null;
  created_at: string;
  updated_at: string;
}

// ── Live activity feed (powers "what the agent is doing right now") ────────

export type AgentEventType =
  | "status" // run moved to a new pipeline step
  | "action" // agent did something (clicked, generated, deployed)
  | "observation" // agent noticed something (game state, metric movement)
  | "screenshot" // screenshot_url points to a capture of the agent playing
  | "error";

export type PipelineNode =
  | "orchestrator"
  | "playtest"
  | "variants"
  | "creatives"
  | "ads"
  | "decide";

export interface AgentEvent {
  id: string;
  run_id: string;
  node: PipelineNode;
  type: AgentEventType;
  message: string;
  screenshot_url: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export type NewAgentEvent = Omit<AgentEvent, "id" | "created_at">;

// ── Node inputs / outputs ───────────────────────────────────────────────────

/** The playtest verdict — a player's verdict, not a QA log. */
export interface PlaytestReport {
  run_id: string;
  /** Did the agent manage to play at all? */
  playable: boolean;
  /** 0–10 gut read on the core loop's fun, with reasoning in `fun_rationale`. */
  fun_score: number;
  fun_rationale: string;
  /** Where the game drags or confuses — ordered by severity. */
  friction_points: string[];
  bugs: string[];
  /** What the agent actually did, condensed (feeds the demo + variant gen). */
  session_summary: string;
  /** The report's one-line verdict for the dashboard card. */
  headline: string;
}

export interface PlaytestInput {
  runId: string;
  gameUrl: string;
  /** Hard cap on the play session — CU is slow; budget it. */
  timeBudgetS: number;
  /** Benchmark/debug knob. Defaults to true to preserve current artifact behavior. */
  recordVideo?: boolean;
}

export interface Variant {
  id: string;
  run_id: string;
  name: string;
  /** The change hypothesis: what this variant tests and why it might win. */
  hypothesis: string;
  /** Playable HTML of the mutated game. */
  game_html: string;
  created_at: string;
}

export const CREATIVE_HOOK_TYPES = [
  "action_first",
  "failure",
  "challenge",
  "progression",
  "reward",
  "surprise",
] as const;

export type CreativeHookType = (typeof CREATIVE_HOOK_TYPES)[number];

/**
 * Normalized creative signals supplied by creative generation.
 * Every numeric signal uses the inclusive 0-1 range.
 */
export interface CreativeAttributes {
  hook_type: CreativeHookType;
  gameplay_category: string;
  progression_style: string;
  novelty: number;
  pacing: number;
  audience_fit: number;
  predicted_engagement: number;
  visual_clarity: number;
}

export interface Creative {
  id: string;
  run_id: string;
  /** null = creative of the original game, not a variant. */
  variant_id: string | null;
  video_url: string;
  /** Video length used to derive retention and average watch time. */
  duration_s: number;
  attributes: CreativeAttributes;
  status: "generated" | "deployed" | "kept" | "iterate" | "killed";
  created_at: string;
}

/** Seeded for the demo — real ingestion architecture behind it (honesty line). */
export interface MetricPoint {
  id: string;
  creative_id: string;
  ts: string;
  impressions: number;
  clicks: number;
  installs: number;
  spend_usd: number;
  /** Click-through rate, the attention signal. */
  ctr: number;
  /** Cost per install — the kill metric. */
  cpi: number;
  watch_time_s: number;
  /** Fraction of video starts watched to completion, in the inclusive 0-1 range. */
  completion_rate: number;
}

export type CreativeDecision = "KEEP" | "ITERATE" | "KILL";

export interface CreativeScoreBreakdown {
  ctr: number;
  watch_time: number;
  completion_rate: number;
  cpi: number;
  audience_fit: number;
}

export interface CreativeExplanation {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  next_action: string;
}

export interface CreativeEvaluation {
  creative_id: string;
  variant_id: string | null;
  rank: number;
  overall_score: number;
  /** Confidence in the simulated judgment, in the inclusive 0-1 range. */
  confidence: number;
  decision: CreativeDecision;
  score_breakdown: CreativeScoreBreakdown;
  explanation: CreativeExplanation;
}

export interface PrototypeRecommendation {
  outcome: "continue_original" | "continue_variant" | "no_clear_winner";
  selected_variant_id: string | null;
  supporting_creative_ids: string[];
  confidence: number;
  rationale: string;
  next_actions: string[];
}

export interface Decision {
  run_id: string;
  keep_creative_ids: string[];
  iterate_creative_ids: string[];
  kill_creative_ids: string[];
  evaluations: CreativeEvaluation[];
  prototype_recommendation: PrototypeRecommendation;
  /** The output that closes the loop: which prototype direction to build next. */
  next_build_recommendation: string;
  rationale: string;
}

/** Knowledge-base entry — compounds context across projects (null project_id = global). */
export interface MemoryEntry {
  id: string;
  project_id: string | null;
  kind: string;
  content: string;
  created_at: string;
}
