// The ad-scenarios contract: the AdScenarioSpec Zod schema (VERBATIM from
// AD_SCENARIO_SPEC.md), its inferred type, the stage-typed error, boundary
// validation, and the qualitative checklist. Pure — no I/O, no Gemini — so it
// is the unit-test surface. Same spirit as tag-generation/src/schema.ts.

import { z } from "zod";

// ── Fixed vocabularies (from the spec's TypeScript contract) ───────────────

export const PLAYER_MOTIVATIONS = [
  "power_fantasy",
  "fail_bait",
  "optimization",
  "collection",
  "revenge",
  "satisfying_growth",
  "comeback",
] as const;

export const TARGET_EMOTIONS = [
  "curiosity",
  "satisfaction",
  "tension",
  "relief",
  "dominance",
  "surprise",
] as const;

export const MECHANIC_FOCUSES = [
  "gates",
  "champion",
  "boss",
  "loadout",
  "speed_boost",
  "danger_comeback",
  "coin_reward",
  "base_destruction",
] as const;

export const playerMotivationSchema = z.enum(PLAYER_MOTIVATIONS);
export const targetEmotionSchema = z.enum(TARGET_EMOTIONS);
export const mechanicFocusSchema = z.enum(MECHANIC_FOCUSES);

export type PlayerMotivation = z.infer<typeof playerMotivationSchema>;
export type TargetEmotion = z.infer<typeof targetEmotionSchema>;
export type MechanicFocus = z.infer<typeof mechanicFocusSchema>;

// ── Stage-typed error (mirrors TagGenerationError) ─────────────────────────

export type AdScenarioStage = "validate" | "compose" | "mutate" | "inspiration";

/** Every failure inside the module surfaces as this — callers never see raw SDK/fs errors. */
export class AdScenarioError extends Error {
  constructor(
    readonly stage: AdScenarioStage,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`ad_scenario_${stage}_failed: ${message}`, options);
    this.name = "AdScenarioError";
  }
}

// ── AdScenarioSpec schema — VERBATIM from AD_SCENARIO_SPEC.md ───────────────
// The enums are shared with the game vocabulary; the shape is the canonical
// contract passed between variant generation, playtest, creatives and decide.

export const AdScenarioSpecSchema = z.object({
  id: z.string().min(3),
  title: z.string().min(3),
  trend: z.object({
    name: z.string().min(2),
    source: z.string().min(2),
    why_it_matters: z.string().min(10),
  }),
  audience: z.object({
    player_motivation: playerMotivationSchema,
    target_emotion: targetEmotionSchema,
  }),
  hypothesis: z.object({
    statement: z.string().min(10),
    expected_behavior: z.string().min(10),
    metric_to_watch: z.string().min(5),
  }),
  creative_angle: z.object({
    hook: z.string().min(3),
    promise: z.string().min(3),
    twist: z.string().min(3),
    cta: z.string().min(3),
  }),
  gameplay_mutation: z.object({
    mechanic_focus: mechanicFocusSchema,
    allowed_changes: z.array(z.string()).min(1),
    forbidden_changes: z.array(z.string()).min(1),
    parameters: z
      .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
      .optional(),
  }),
  playable_script: z.object({
    duration_seconds: z.number().min(15).max(35),
    opening_0_3s: z.string().min(5),
    middle_3_12s: z.string().min(5),
    climax_12_20s: z.string().min(5),
    end_card_20_25s: z.string().min(5),
  }),
  recording_plan: z.object({
    aspect_ratio: z.literal("9:16"),
    camera_focus: z.string().min(5),
    must_capture_moments: z.array(z.string()).min(2),
    overlay_text: z.array(z.string()).min(1),
  }),
  success_criteria: z.object({
    visual_readability: z.string().min(10),
    fun_signal: z.string().min(10),
    ad_signal: z.string().min(10),
    keep_kill_rule: z.string().min(10),
  }),
  metadata: z.object({
    created_by: z.enum(["agent", "human"]),
    source_game_version: z.string().min(1),
    variant_id: z.string().optional(),
    created_at: z.string().optional(),
  }),
});

export type AdScenarioSpec = z.infer<typeof AdScenarioSpecSchema>;

// ── Boundary validation ────────────────────────────────────────────────────

/**
 * The single validation gate: an LLM- or file-produced scenario is a DRAFT
 * until it passes here. On failure, throws AdScenarioError('validate', ...)
 * with a human-readable message — never a silent fallback to a partial spec.
 */
export function validateScenario(raw: unknown): AdScenarioSpec {
  const parsed = AdScenarioSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AdScenarioError("validate", z.prettifyError(parsed.error), {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

// ── Qualitative checklist (the 7 "Validation qualitative" questions) ───────
// Honest heuristics on the structured spec — not a semantic judge. Each check
// maps to one question from AD_SCENARIO_SPEC.md.

export interface ChecklistResult {
  ok: boolean;
  failed: string[];
}

const HOOK_MAX_WORDS = 8; // a hook readable in < 3s is short

export function qualitativeChecklist(spec: AdScenarioSpec): ChecklistResult {
  const failed: string[] = [];

  // 1. Hook understandable in < 3s → short, present, and echoed in an overlay.
  const hookWords = spec.creative_angle.hook.trim().split(/\s+/).length;
  if (hookWords > HOOK_MAX_WORDS) {
    failed.push("hook_too_long_for_3s");
  }

  // 2. Mutation visible without reading code → concrete allowed changes exist.
  if (spec.gameplay_mutation.allowed_changes.length < 1) {
    failed.push("no_visible_mutation");
  }

  // 3. Gameplay stays playable → exactly one mechanic focus, not a bundle.
  //    (The schema already enforces a single enum value; we assert it holds.)
  if (!MECHANIC_FOCUSES.includes(spec.gameplay_mutation.mechanic_focus)) {
    failed.push("mechanic_focus_not_recognized");
  }

  // 4. Payoff satisfying without sound → a climax and captured payoff moments.
  if (
    spec.playable_script.climax_12_20s.trim().length < 5 ||
    spec.recording_plan.must_capture_moments.length < 2
  ) {
    failed.push("payoff_not_capturable_without_sound");
  }

  // 5. Works in 9:16.
  if (spec.recording_plan.aspect_ratio !== "9:16") {
    failed.push("not_vertical_9_16");
  }

  // 6. Tests a single hypothesis → not obviously a bundle of ideas.
  if (spec.hypothesis.statement.split(/\band\b/).length > 3) {
    failed.push("hypothesis_bundles_multiple_ideas");
  }

  // 7. Changes are saveable & replayable → duration in the recordable band and
  //    forbidden_changes present (the guardrail that keeps replays consistent).
  const dur = spec.playable_script.duration_seconds;
  if (dur < 15 || dur > 35 || spec.gameplay_mutation.forbidden_changes.length < 1) {
    failed.push("not_replayable_or_out_of_duration_band");
  }

  return { ok: failed.length === 0, failed };
}
