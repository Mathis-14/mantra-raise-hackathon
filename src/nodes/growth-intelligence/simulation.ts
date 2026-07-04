import { createHash } from "node:crypto";

import type {
  Creative,
  CreativeHookType,
  MetricPoint,
} from "@/contracts/types";
import { parseCreatives } from "@/nodes/growth-intelligence/validation";

const SIMULATED_SPEND_USD = 30;
const MIN_CTR = 0.006;
const MAX_CTR = 0.05;
const MIN_COMPLETION_RATE = 0.12;
const MAX_COMPLETION_RATE = 0.72;
const MIN_INSTALL_RATE = 0.08;
const MAX_INSTALL_RATE = 0.42;

const HOOK_STRENGTH: Record<CreativeHookType, number> = {
  action_first: 0.86,
  failure: 0.72,
  challenge: 0.78,
  progression: 0.68,
  reward: 0.74,
  surprise: 0.82,
};

const GAMEPLAY_CATEGORY_STRENGTHS: ReadonlyArray<readonly [string, number]> = [
  ["crowd", 0.78],
  ["action", 0.76],
  ["shooter", 0.74],
  ["runner", 0.72],
  ["arcade", 0.7],
  ["strategy", 0.66],
  ["merge", 0.64],
  ["puzzle", 0.6],
  ["idle", 0.56],
];

const PROGRESSION_STRENGTHS: ReadonlyArray<readonly [string, number]> = [
  ["upgrade", 0.8],
  ["evolution", 0.76],
  ["level", 0.7],
  ["collection", 0.66],
  ["unlock", 0.64],
  ["endless", 0.58],
  ["narrative", 0.54],
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}

function normalizedSignal(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function categoryStrength(
  value: string,
  strengths: ReadonlyArray<readonly [string, number]>,
): number {
  const normalized = value.trim().toLowerCase();
  return strengths.find(([keyword]) => normalized.includes(keyword))?.[1] ?? 0.62;
}

function deterministicUuid(namespace: string, value: string): string {
  const hex = createHash("sha256").update(`${namespace}:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function simulateCreative(creative: Creative): MetricPoint {
  if (!Number.isFinite(creative.duration_s) || creative.duration_s <= 0) {
    throw new RangeError(`Creative ${creative.id} duration_s must be greater than zero`);
  }

  const { attributes } = creative;
  const novelty = normalizedSignal(attributes.novelty, `${creative.id}.novelty`);
  const pacing = normalizedSignal(attributes.pacing, `${creative.id}.pacing`);
  const audienceFit = normalizedSignal(attributes.audience_fit, `${creative.id}.audience_fit`);
  const predictedEngagement = normalizedSignal(
    attributes.predicted_engagement,
    `${creative.id}.predicted_engagement`,
  );
  const visualClarity = normalizedSignal(
    attributes.visual_clarity,
    `${creative.id}.visual_clarity`,
  );
  const hookStrength = HOOK_STRENGTH[attributes.hook_type];
  const gameplayStrength = categoryStrength(
    attributes.gameplay_category,
    GAMEPLAY_CATEGORY_STRENGTHS,
  );
  const progressionStrength = categoryStrength(
    attributes.progression_style,
    PROGRESSION_STRENGTHS,
  );

  const attentionQuality =
    hookStrength * 0.24 +
    pacing * 0.2 +
    predictedEngagement * 0.18 +
    visualClarity * 0.16 +
    novelty * 0.12 +
    gameplayStrength * 0.1;
  const expectedCtr = clamp(0.004 + attentionQuality * 0.052, MIN_CTR, MAX_CTR);

  const retentionQuality =
    hookStrength * 0.2 +
    pacing * 0.22 +
    visualClarity * 0.2 +
    progressionStrength * 0.16 +
    predictedEngagement * 0.14 +
    novelty * 0.08;
  const completionRate = clamp(
    0.06 + retentionQuality * 0.72,
    MIN_COMPLETION_RATE,
    MAX_COMPLETION_RATE,
  );
  const partialViewRetention = 0.18 + pacing * 0.18 + visualClarity * 0.12;
  const averageWatchRetention =
    completionRate + (1 - completionRate) * partialViewRetention;

  const conversionQuality =
    audienceFit * 0.36 +
    gameplayStrength * 0.22 +
    visualClarity * 0.16 +
    progressionStrength * 0.16 +
    novelty * 0.1;
  const installRate = clamp(
    0.045 + conversionQuality * 0.43,
    MIN_INSTALL_RATE,
    MAX_INSTALL_RATE,
  );

  // Better-matched audiences are more competitive, so they cost more to reach.
  const cpmUsd = 7.5 + audienceFit * 4.5 + gameplayStrength * 1.5;
  const impressions = Math.max(1, Math.round((SIMULATED_SPEND_USD / cpmUsd) * 1_000));
  const clicks = Math.max(1, Math.round(impressions * expectedCtr));
  const installs = Math.max(1, Math.round(clicks * installRate));

  return {
    id: deterministicUuid("metric", creative.id),
    creative_id: creative.id,
    ts: creative.created_at,
    impressions,
    clicks,
    installs,
    spend_usd: SIMULATED_SPEND_USD,
    ctr: round(clicks / impressions, 6),
    cpi: round(SIMULATED_SPEND_USD / installs, 2),
    watch_time_s: round(creative.duration_s * averageWatchRetention, 2),
    completion_rate: round(completionRate, 4),
  };
}

export function simulateMetrics(creatives: readonly Creative[]): MetricPoint[] {
  return parseCreatives(creatives).map(simulateCreative);
}
