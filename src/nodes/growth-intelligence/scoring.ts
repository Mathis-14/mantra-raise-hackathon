import type {
  Creative,
  CreativeDecision,
  CreativeScoreBreakdown,
  MetricPoint,
} from "@/contracts/types";

export const SCORE_WEIGHTS = {
  ctr: 0.3,
  watch_time: 0.15,
  completion_rate: 0.2,
  cpi: 0.25,
  audience_fit: 0.1,
} as const;

export const KPI_BENCHMARKS = {
  ctr: { floor: 0.008, target: 0.03, excellent: 0.045 },
  watch_time_retention: { floor: 0.25, target: 0.5, excellent: 0.75 },
  completion_rate: { floor: 0.15, target: 0.4, excellent: 0.65 },
  cpi_usd: { excellent: 1.5, target: 3.5, ceiling: 8 },
} as const;

export const DECISION_THRESHOLDS = {
  keep: 75,
  iterate: 50,
} as const;

export interface ScoredCreative {
  breakdown: CreativeScoreBreakdown;
  overallScore: number;
  confidence: number;
  decision: CreativeDecision;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}

function higherIsBetter(value: number, floor: number, excellent: number): number {
  return clamp(((value - floor) / (excellent - floor)) * 100, 0, 100);
}

function lowerIsBetter(value: number, excellent: number, ceiling: number): number {
  return clamp(((ceiling - value) / (ceiling - excellent)) * 100, 0, 100);
}

function validateMetric(metric: MetricPoint): void {
  const values = [
    metric.impressions,
    metric.clicks,
    metric.installs,
    metric.spend_usd,
    metric.ctr,
    metric.cpi,
    metric.watch_time_s,
    metric.completion_rate,
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`Metrics for creative ${metric.creative_id} must be finite`);
  }
  if (metric.impressions <= 0 || metric.watch_time_s < 0 || metric.cpi < 0) {
    throw new RangeError(`Metrics for creative ${metric.creative_id} contain invalid values`);
  }
  if (metric.ctr < 0 || metric.ctr > 1 || metric.completion_rate < 0 || metric.completion_rate > 1) {
    throw new RangeError(`Rates for creative ${metric.creative_id} must be between 0 and 1`);
  }
}

function calculateConfidence(metric: MetricPoint, breakdown: CreativeScoreBreakdown): number {
  const sampleConfidence = clamp(metric.impressions / 2_500, 0, 1);
  const componentScores = Object.values(breakdown);
  const scoreRange = Math.max(...componentScores) - Math.min(...componentScores);
  const consistencyConfidence = 1 - scoreRange / 100;
  return round(0.55 + sampleConfidence * 0.25 + consistencyConfidence * 0.2, 2);
}

function classify(overallScore: number): CreativeDecision {
  if (overallScore >= DECISION_THRESHOLDS.keep) {
    return "KEEP";
  }
  if (overallScore >= DECISION_THRESHOLDS.iterate) {
    return "ITERATE";
  }
  return "KILL";
}

export function scoreCreative(creative: Creative, metric: MetricPoint): ScoredCreative {
  if (metric.creative_id !== creative.id) {
    throw new Error(`Metric ${metric.id} does not belong to creative ${creative.id}`);
  }
  if (!Number.isFinite(creative.duration_s) || creative.duration_s <= 0) {
    throw new RangeError(`Creative ${creative.id} duration_s must be greater than zero`);
  }
  validateMetric(metric);

  const watchTimeRetention = metric.watch_time_s / creative.duration_s;
  const breakdown: CreativeScoreBreakdown = {
    ctr: round(higherIsBetter(metric.ctr, KPI_BENCHMARKS.ctr.floor, KPI_BENCHMARKS.ctr.excellent), 1),
    watch_time: round(
      higherIsBetter(
        watchTimeRetention,
        KPI_BENCHMARKS.watch_time_retention.floor,
        KPI_BENCHMARKS.watch_time_retention.excellent,
      ),
      1,
    ),
    completion_rate: round(
      higherIsBetter(
        metric.completion_rate,
        KPI_BENCHMARKS.completion_rate.floor,
        KPI_BENCHMARKS.completion_rate.excellent,
      ),
      1,
    ),
    cpi: round(lowerIsBetter(metric.cpi, KPI_BENCHMARKS.cpi_usd.excellent, KPI_BENCHMARKS.cpi_usd.ceiling), 1),
    audience_fit: round(clamp(creative.attributes.audience_fit, 0, 1) * 100, 1),
  };

  const overallScore = round(
    breakdown.ctr * SCORE_WEIGHTS.ctr +
      breakdown.watch_time * SCORE_WEIGHTS.watch_time +
      breakdown.completion_rate * SCORE_WEIGHTS.completion_rate +
      breakdown.cpi * SCORE_WEIGHTS.cpi +
      breakdown.audience_fit * SCORE_WEIGHTS.audience_fit,
    1,
  );

  return {
    breakdown,
    overallScore,
    confidence: calculateConfidence(metric, breakdown),
    decision: classify(overallScore),
  };
}
