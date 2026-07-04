import type {
  CreativeEvaluation,
  Decision,
  MetricPoint,
} from "@/contracts/types";

const STUB_SCORE = 50;
const STUB_CONFIDENCE = 0.5;

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
