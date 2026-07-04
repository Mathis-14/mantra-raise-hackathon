import { createHash } from "node:crypto";

import type {
  Creative,
  CreativeEvaluation,
  Decision,
  MetricPoint,
} from "@/contracts/types";

const STUB_IMPRESSIONS = 1_000;
const STUB_CLICKS = 20;
const STUB_INSTALLS = 5;
const STUB_SPEND_USD = 10;
const STUB_CTR = STUB_CLICKS / STUB_IMPRESSIONS;
const STUB_CPI = STUB_SPEND_USD / STUB_INSTALLS;
const STUB_COMPLETION_RATE = 0.3;
const STUB_WATCH_RETENTION = 0.4;
const STUB_SCORE = 50;
const STUB_CONFIDENCE = 0.5;

function deterministicUuid(namespace: string, value: string): string {
  const hex = createHash("sha256").update(`${namespace}:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function collectStubMetrics(creatives: readonly Creative[]): MetricPoint[] {
  return creatives.map((creative) => ({
    id: deterministicUuid("metric", creative.id),
    creative_id: creative.id,
    ts: creative.created_at,
    impressions: STUB_IMPRESSIONS,
    clicks: STUB_CLICKS,
    installs: STUB_INSTALLS,
    spend_usd: STUB_SPEND_USD,
    ctr: STUB_CTR,
    cpi: STUB_CPI,
    watch_time_s: creative.duration_s * STUB_WATCH_RETENTION,
    completion_rate: STUB_COMPLETION_RATE,
  }));
}

function createStubEvaluation(metric: MetricPoint, rank: number): CreativeEvaluation {
  return {
    creative_id: metric.creative_id,
    variant_id: null,
    rank,
    overall_score: STUB_SCORE,
    confidence: STUB_CONFIDENCE,
    decision: "ITERATE",
    score_breakdown: {
      ctr: STUB_SCORE,
      watch_time: STUB_SCORE,
      completion_rate: STUB_SCORE,
      cpi: STUB_SCORE,
      audience_fit: STUB_SCORE,
    },
    explanation: {
      summary: "The campaign produced a neutral placeholder result pending deterministic scoring.",
      strengths: [],
      weaknesses: ["The full Growth Intelligence scoring model has not been applied yet."],
      next_action: "Run the deterministic scoring model before making a production decision.",
    },
  };
}

export function createStubDecision(runId: string, metrics: readonly MetricPoint[]): Decision {
  const creativeIds = [...new Set<string>(metrics.map((metric) => metric.creative_id))].sort();
  const evaluations = creativeIds.map((creativeId, index) => {
    const metric = metrics.find((candidate) => candidate.creative_id === creativeId);
    if (!metric) {
      throw new Error(`Missing metrics for creative ${creativeId}`);
    }
    return createStubEvaluation(metric, index + 1);
  });

  return {
    run_id: runId,
    keep_creative_ids: [],
    iterate_creative_ids: creativeIds,
    kill_creative_ids: [],
    evaluations,
    prototype_recommendation: {
      outcome: "no_clear_winner",
      selected_variant_id: null,
      supporting_creative_ids: [],
      confidence: STUB_CONFIDENCE,
      rationale: "The stub evaluator intentionally defers prototype selection until scoring is available.",
      next_actions: ["Apply deterministic scoring and compare prototype-level performance."],
    },
    next_build_recommendation: "Collect deterministic scores before selecting a prototype direction.",
    rationale: "All creatives remain in iteration while the scoring stage is stubbed.",
  };
}
