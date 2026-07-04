import assert from "node:assert/strict";
import test from "node:test";

import type { Creative, CreativeAttributes, MetricPoint } from "@/contracts/types";
import { evaluateCreatives } from "@/nodes/growth-intelligence";
import { simulateMetrics } from "@/nodes/growth-intelligence/simulation";

const RUN_ID = "00000000-0000-4000-a000-000000000001";
const CREATED_AT = "2026-07-04T10:00:00.000Z";

const STRONG_ATTRIBUTES: CreativeAttributes = {
  hook_type: "action_first",
  gameplay_category: "crowd action",
  progression_style: "upgrade",
  novelty: 0.92,
  pacing: 0.9,
  audience_fit: 0.9,
  predicted_engagement: 0.92,
  visual_clarity: 0.94,
};

const ITERATE_ATTRIBUTES: CreativeAttributes = {
  hook_type: "progression",
  gameplay_category: "idle",
  progression_style: "endless",
  novelty: 0.35,
  pacing: 0.35,
  audience_fit: 0.4,
  predicted_engagement: 0.35,
  visual_clarity: 0.38,
};

const WEAK_ATTRIBUTES: CreativeAttributes = {
  hook_type: "progression",
  gameplay_category: "idle",
  progression_style: "narrative",
  novelty: 0.15,
  pacing: 0.18,
  audience_fit: 0.2,
  predicted_engagement: 0.2,
  visual_clarity: 0.22,
};

function creative(
  id: string,
  variantId: string | null,
  attributes: CreativeAttributes,
): Creative {
  return {
    id,
    run_id: RUN_ID,
    variant_id: variantId,
    video_url: `https://example.test/${id}.mp4`,
    duration_s: 20,
    attributes,
    status: "generated",
    created_at: CREATED_AT,
  };
}

function campaignCreatives(): Creative[] {
  return [
    creative("creative-strong", "variant-a", STRONG_ATTRIBUTES),
    creative("creative-iterate", "variant-b", ITERATE_ATTRIBUTES),
    creative("creative-weak", null, WEAK_ATTRIBUTES),
  ];
}

function metricIndex(metrics: readonly MetricPoint[]): Map<string, MetricPoint> {
  return new Map(metrics.map((metric) => [metric.creative_id, metric]));
}

test("simulation is deterministic and internally coherent", () => {
  const creatives = campaignCreatives();
  const first = simulateMetrics(creatives);
  const second = simulateMetrics(structuredClone(creatives));

  assert.deepEqual(second, first);
  for (const [index, metric] of first.entries()) {
    const source = creatives[index];
    assert.ok(source);
    assert.equal(metric.clicks, Math.round(metric.impressions * metric.ctr));
    assert.equal(metric.cpi, Math.round((metric.spend_usd / metric.installs) * 100) / 100);
    assert.ok(metric.watch_time_s >= 0 && metric.watch_time_s <= source.duration_s);
    assert.ok(metric.completion_rate >= 0 && metric.completion_rate <= 1);
    assert.ok(metric.ctr >= 0 && metric.ctr <= 1);
  }
});

test("input order does not alter metrics or ranked decisions", () => {
  const creatives = campaignCreatives();
  const reversed = [...creatives].reverse();
  const forwardMetrics = simulateMetrics(creatives);
  const reversedMetrics = simulateMetrics(reversed);

  assert.deepEqual(metricIndex(reversedMetrics), metricIndex(forwardMetrics));

  const forwardDecision = evaluateCreatives(RUN_ID, creatives, forwardMetrics);
  const reversedDecision = evaluateCreatives(RUN_ID, reversed, reversedMetrics);
  assert.deepEqual(reversedDecision, forwardDecision);
});

test("evaluation produces one stable KEEP, ITERATE, or KILL result per creative", () => {
  const creatives = campaignCreatives();
  const decision = evaluateCreatives(RUN_ID, creatives, simulateMetrics(creatives));

  assert.deepEqual(
    decision.evaluations.map(({ creative_id, decision: outcome, rank }) => ({
      creative_id,
      outcome,
      rank,
    })),
    [
      { creative_id: "creative-strong", outcome: "KEEP", rank: 1 },
      { creative_id: "creative-iterate", outcome: "ITERATE", rank: 2 },
      { creative_id: "creative-weak", outcome: "KILL", rank: 3 },
    ],
  );
  assert.deepEqual(decision.keep_creative_ids, ["creative-strong"]);
  assert.deepEqual(decision.iterate_creative_ids, ["creative-iterate"]);
  assert.deepEqual(decision.kill_creative_ids, ["creative-weak"]);
  assert.equal(new Set(decision.evaluations.map(({ creative_id }) => creative_id)).size, creatives.length);
});

test("strong KEEP explanations do not invent a weakness", () => {
  const creatives = campaignCreatives();
  const decision = evaluateCreatives(RUN_ID, creatives, simulateMetrics(creatives));
  const winner = decision.evaluations.find(({ decision: outcome }) => outcome === "KEEP");

  assert.ok(winner);
  assert.deepEqual(winner.explanation.weaknesses, []);
  assert.match(winner.explanation.next_action, /scale/i);
});

test("weak prototype evidence returns no clear winner", () => {
  const creatives = campaignCreatives().slice(1);
  const decision = evaluateCreatives(RUN_ID, creatives, simulateMetrics(creatives));

  assert.equal(decision.prototype_recommendation.outcome, "no_clear_winner");
  assert.equal(decision.prototype_recommendation.selected_variant_id, null);
  assert.match(decision.next_build_recommendation, /no prototype/i);
});

test("evaluation rejects incomplete or foreign metric sets", () => {
  const creatives = campaignCreatives();
  const metrics = simulateMetrics(creatives);
  const firstMetric = metrics[0];
  assert.ok(firstMetric);

  assert.throws(
    () => evaluateCreatives(RUN_ID, creatives, metrics.slice(1)),
    /Missing metrics for creative creative-strong/,
  );
  assert.throws(
    () => evaluateCreatives(RUN_ID, creatives, [
      ...metrics,
      { ...firstMetric, id: "foreign-metric", creative_id: "foreign-creative" },
    ]),
    /Metrics contain unknown creative foreign-creative/,
  );
});

test("simulation rejects creative signals outside the normalized range", () => {
  const invalid = creative("creative-invalid", null, {
    ...STRONG_ATTRIBUTES,
    audience_fit: 1.1,
  });

  assert.throws(() => simulateMetrics([invalid]), /audience_fit/);
});

test("simulation rejects malformed creative boundary data", () => {
  const source = creative("creative-invalid", null, STRONG_ATTRIBUTES);

  assert.throws(
    () => simulateMetrics([{ ...source, id: "" }]),
    /ID must not be empty/,
  );
  assert.throws(
    () => simulateMetrics([{ ...source, duration_s: 0 }]),
    /duration_s/,
  );
  assert.throws(
    () => simulateMetrics([{
      ...source,
      attributes: { ...source.attributes, gameplay_category: "" },
    }]),
    /gameplay_category/,
  );
});

test("evaluation rejects incoherent metric counts", () => {
  const creatives = campaignCreatives();
  const metrics = simulateMetrics(creatives);
  const firstMetric = metrics[0];
  assert.ok(firstMetric);

  assert.throws(
    () => evaluateCreatives(RUN_ID, creatives, [
      { ...firstMetric, clicks: firstMetric.impressions + 1 },
      ...metrics.slice(1),
    ]),
    /clicks must not exceed impressions/,
  );
  assert.throws(
    () => evaluateCreatives(RUN_ID, creatives, [
      { ...firstMetric, installs: firstMetric.clicks + 1 },
      ...metrics.slice(1),
    ]),
    /installs must not exceed clicks/,
  );
});
