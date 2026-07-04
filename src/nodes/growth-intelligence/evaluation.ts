import type {
  Creative,
  CreativeEvaluation,
  Decision,
  MetricPoint,
} from "@/contracts/types";

import { explainCreative } from "@/nodes/growth-intelligence/explanations";
import { recommendPrototype } from "@/nodes/growth-intelligence/recommendation";
import { scoreCreative } from "@/nodes/growth-intelligence/scoring";

type UnrankedEvaluation = Omit<CreativeEvaluation, "rank">;

function metricsByCreative(
  creatives: readonly Creative[],
  metrics: readonly MetricPoint[],
): Map<string, MetricPoint> {
  const creativeIds = new Set<string>(creatives.map((creative) => creative.id));
  const result = new Map<string, MetricPoint>();

  for (const metric of metrics) {
    if (!creativeIds.has(metric.creative_id)) {
      throw new Error(`Metrics contain unknown creative ${metric.creative_id}`);
    }
    if (result.has(metric.creative_id)) {
      throw new Error(`Expected one metric point for creative ${metric.creative_id}`);
    }
    result.set(metric.creative_id, metric);
  }

  return result;
}

function evaluateCreative(creative: Creative, metric: MetricPoint): UnrankedEvaluation {
  const score = scoreCreative(creative, metric);
  return {
    creative_id: creative.id,
    variant_id: creative.variant_id,
    overall_score: score.overallScore,
    confidence: score.confidence,
    decision: score.decision,
    score_breakdown: score.breakdown,
    explanation: explainCreative(
      creative,
      metric,
      score.breakdown,
      score.decision,
    ),
  };
}

export function evaluateCreatives(
  runId: string,
  creatives: readonly Creative[],
  metrics: readonly MetricPoint[],
): Decision {
  if (creatives.length === 0) {
    throw new Error("At least one creative is required for evaluation");
  }

  const metricIndex = metricsByCreative(creatives, metrics);
  const evaluations = creatives
    .map((creative) => {
      const metric = metricIndex.get(creative.id);
      if (!metric) {
        throw new Error(`Missing metrics for creative ${creative.id}`);
      }
      return evaluateCreative(creative, metric);
    })
    .sort(
      (left, right) => right.overall_score - left.overall_score || left.creative_id.localeCompare(right.creative_id),
    )
    .map((evaluation, index): CreativeEvaluation => ({ ...evaluation, rank: index + 1 }));

  const recommendation = recommendPrototype(evaluations);
  const keepIds = evaluations.filter(({ decision }) => decision === "KEEP").map(({ creative_id }) => creative_id);
  const iterateIds = evaluations.filter(({ decision }) => decision === "ITERATE").map(({ creative_id }) => creative_id);
  const killIds = evaluations.filter(({ decision }) => decision === "KILL").map(({ creative_id }) => creative_id);
  const recommendationText = recommendation.outcome === "no_clear_winner"
    ? "No prototype has a decisive acquisition signal yet; iterate the leading concepts before committing development."
    : recommendation.selected_variant_id === null
      ? "Continue developing the original prototype and use its winning creative as the next control."
      : `Continue developing variant ${recommendation.selected_variant_id} and use its winning creative as the next control.`;

  return {
    run_id: runId,
    keep_creative_ids: keepIds,
    iterate_creative_ids: iterateIds,
    kill_creative_ids: killIds,
    evaluations,
    prototype_recommendation: recommendation,
    next_build_recommendation: recommendationText,
    rationale: `${keepIds.length} creative(s) kept, ${iterateIds.length} queued for iteration, and ${killIds.length} killed. ${recommendation.rationale}`,
  };
}
