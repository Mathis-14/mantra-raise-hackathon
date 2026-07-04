// Deterministic scenario → variant generator. Takes a validated AdScenarioSpec
// and a base HTML, and produces everything downstream needs: the mutated
// playable HTML, the bounded config, a concrete 9:16 creative script, a
// playtest checklist, a human summary and a dashboard blurb. Pure/deterministic
// — no I/O, no randomness.

import type { Variant } from "@/contracts/types";
import { validateScenario, type AdScenarioSpec } from "./schema";
import { buildVariantHtml, resolveVariantConfig, type VariantConfig } from "./mutation";

export interface HumanSummary {
  trend_targeted: string;
  gameplay_changed: string;
  why_it_should_work: string;
  recording_moment: string;
  keep_kill_metric: string;
}

export interface GeneratedVariant {
  scenario: AdScenarioSpec;
  config: VariantConfig;
  variant: Pick<Variant, "name" | "hypothesis" | "game_html">;
  human_summary: HumanSummary;
  recording_plan: AdScenarioSpec["recording_plan"];
  creative_prompt: string;
  playtest_checklist: string[];
  dashboard_blurb: string;
}

function creativePrompt(spec: AdScenarioSpec): string {
  const s = spec.playable_script;
  const r = spec.recording_plan;
  return [
    `Vertical 9:16 ad, ${s.duration_seconds}s. ${r.camera_focus}`,
    `0-3s: ${s.opening_0_3s}`,
    `3-12s: ${s.middle_3_12s}`,
    `12-20s: ${s.climax_12_20s}`,
    `20-25s: ${s.end_card_20_25s}`,
    `Overlay text (in order): ${r.overlay_text.join(" | ")}.`,
    `Must capture: ${r.must_capture_moments.join(", ")}.`,
    `Hook: "${spec.creative_angle.hook}". CTA: "${spec.creative_angle.cta}".`,
  ].join("\n");
}

function playtestChecklist(spec: AdScenarioSpec): string[] {
  const sc = spec.success_criteria;
  return [
    `Readability: ${sc.visual_readability}`,
    `Fun signal: ${sc.fun_signal}`,
    `Ad signal: ${sc.ad_signal}`,
    `Keep/kill: ${sc.keep_kill_rule}`,
    ...spec.recording_plan.must_capture_moments.map((m) => `Capture: ${m}`),
  ];
}

function humanSummary(spec: AdScenarioSpec): HumanSummary {
  return {
    trend_targeted: spec.trend.name,
    gameplay_changed: `${spec.gameplay_mutation.mechanic_focus}: ${spec.gameplay_mutation.allowed_changes.join("; ")}`,
    why_it_should_work: spec.hypothesis.statement,
    recording_moment: spec.recording_plan.must_capture_moments[0] ?? spec.playable_script.climax_12_20s,
    keep_kill_metric: spec.hypothesis.metric_to_watch,
  };
}

/**
 * Builds a fully-resolved GeneratedVariant from a spec + base HTML. Re-validates
 * the spec, resolves+clamps the config, and injects it into a copy of the HTML.
 * Deterministic. Throws AdScenarioError on invalid spec / config / injection.
 */
export function generateVariantFromScenario(
  spec: AdScenarioSpec,
  baseHtml: string,
): GeneratedVariant {
  const validated = validateScenario(spec);
  const config = resolveVariantConfig(validated);
  const gameHtml = buildVariantHtml(baseHtml, config);

  return {
    scenario: validated,
    config,
    variant: {
      name: validated.title,
      hypothesis: validated.hypothesis.statement,
      game_html: gameHtml,
    },
    human_summary: humanSummary(validated),
    recording_plan: validated.recording_plan,
    creative_prompt: creativePrompt(validated),
    playtest_checklist: playtestChecklist(validated),
    dashboard_blurb: `${validated.title} — ${validated.creative_angle.hook} (${validated.gameplay_mutation.mechanic_focus})`,
  };
}
