import type { Creative, Decision, MetricPoint } from "@/contracts/types";
import { evaluateCreatives } from "@/nodes/growth-intelligence";
import { simulateMetrics } from "@/nodes/growth-intelligence/simulation";

const RUN_ID = "00000000-0000-4000-a000-000000000001";
const CREATED_AT = "2026-07-04T10:00:00.000Z";

const CREATIVE_LABELS: Record<string, string> = {
  "10000000-0000-4000-a000-000000000001": "Action-first crowd hook",
  "10000000-0000-4000-a000-000000000002": "Slow progression hook",
  "10000000-0000-4000-a000-000000000003": "Original narrative hook",
};

const VARIANT_LABELS: Record<string, string> = {
  "20000000-0000-4000-a000-000000000001": "Variant A",
  "20000000-0000-4000-a000-000000000002": "Variant B",
};

const creatives: Creative[] = [
  {
    id: "10000000-0000-4000-a000-000000000001",
    run_id: RUN_ID,
    variant_id: "20000000-0000-4000-a000-000000000001",
    video_url: "https://example.test/action-first-crowd.mp4",
    duration_s: 20,
    status: "generated",
    created_at: CREATED_AT,
    attributes: {
      hook_type: "action_first",
      gameplay_category: "crowd action",
      progression_style: "upgrade",
      novelty: 0.92,
      pacing: 0.9,
      audience_fit: 0.9,
      predicted_engagement: 0.92,
      visual_clarity: 0.94,
    },
  },
  {
    id: "10000000-0000-4000-a000-000000000002",
    run_id: RUN_ID,
    variant_id: "20000000-0000-4000-a000-000000000002",
    video_url: "https://example.test/slow-progression.mp4",
    duration_s: 20,
    status: "generated",
    created_at: CREATED_AT,
    attributes: {
      hook_type: "progression",
      gameplay_category: "idle",
      progression_style: "endless",
      novelty: 0.35,
      pacing: 0.35,
      audience_fit: 0.4,
      predicted_engagement: 0.35,
      visual_clarity: 0.38,
    },
  },
  {
    id: "10000000-0000-4000-a000-000000000003",
    run_id: RUN_ID,
    variant_id: null,
    video_url: "https://example.test/original-narrative.mp4",
    duration_s: 20,
    status: "generated",
    created_at: CREATED_AT,
    attributes: {
      hook_type: "progression",
      gameplay_category: "idle",
      progression_style: "narrative",
      novelty: 0.15,
      pacing: 0.18,
      audience_fit: 0.2,
      predicted_engagement: 0.2,
      visual_clarity: 0.22,
    },
  },
];

function labelFor(creativeId: string): string {
  return CREATIVE_LABELS[creativeId] ?? creativeId;
}

function prototypeLabel(variantId: string | null): string {
  return variantId === null ? "Original" : VARIANT_LABELS[variantId] ?? variantId;
}

function withFriendlyVariantLabels(value: string): string {
  return Object.entries(VARIANT_LABELS).reduce(
    (result, [variantId, label]) => result
      .replaceAll(`the variant ${variantId}`, label)
      .replaceAll(`variant ${variantId}`, label)
      .replaceAll(variantId, label),
    value,
  );
}

function printMetrics(metrics: readonly MetricPoint[]): void {
  console.log("\nCampaign metrics");
  console.table(metrics.map((metric) => ({
    creative: labelFor(metric.creative_id),
    impressions: metric.impressions,
    clicks: metric.clicks,
    installs: metric.installs,
    CTR: `${(metric.ctr * 100).toFixed(2)}%`,
    watch_time: `${metric.watch_time_s.toFixed(1)}s`,
    completion: `${(metric.completion_rate * 100).toFixed(1)}%`,
    CPI: `$${metric.cpi.toFixed(2)}`,
  })));
}

function printDecision(decision: Decision): void {
  console.log("\nCreative ranking");
  console.table(decision.evaluations.map((evaluation) => ({
    rank: evaluation.rank,
    creative: labelFor(evaluation.creative_id),
    prototype: prototypeLabel(evaluation.variant_id),
    score: evaluation.overall_score,
    confidence: `${(evaluation.confidence * 100).toFixed(0)}%`,
    decision: evaluation.decision,
  })));

  console.log("\nUA reasoning");
  for (const evaluation of decision.evaluations) {
    console.log(`\n${evaluation.rank}. ${labelFor(evaluation.creative_id)} — ${evaluation.decision}`);
    console.log(evaluation.explanation.summary);
    console.log(`Strength: ${evaluation.explanation.strengths[0] ?? "No clear strength."}`);
    console.log(`Risk: ${evaluation.explanation.weaknesses[0] ?? "No material weakness."}`);
    console.log(`Next action: ${evaluation.explanation.next_action}`);
  }

  const recommendation = decision.prototype_recommendation;
  console.log("\nPrototype recommendation");
  console.log(withFriendlyVariantLabels(decision.next_build_recommendation));
  console.log(withFriendlyVariantLabels(recommendation.rationale));
  console.log(`Confidence: ${(recommendation.confidence * 100).toFixed(0)}%`);
  for (const action of recommendation.next_actions) {
    console.log(`- ${withFriendlyVariantLabels(action)}`);
  }
}

async function main(): Promise<void> {
  const jsonOnly = process.argv.includes("--json");

  if (!jsonOnly) {
    console.log("Growth Intelligence — standalone MVP");
    console.log("Google Ads creative deployment and campaign metrics are deterministic simulations.");
    console.log(`\n[1/4] Preparing ${creatives.length} creatives`);
    console.log("[2/4] Deploying creatives to simulated campaign");
  }

  if (!jsonOnly) {
    console.log("[3/4] Collecting deterministic campaign metrics");
  }
  const metrics = simulateMetrics(creatives);

  if (!jsonOnly) {
    console.log("[4/4] Scoring creatives and selecting a prototype direction");
  }
  const decision = evaluateCreatives(RUN_ID, creatives, metrics);

  if (jsonOnly) {
    console.log(JSON.stringify({ metrics, decision }, null, 2));
    return;
  }

  printMetrics(metrics);
  printDecision(decision);
  console.log("\nComplete");
}

main().catch((error: unknown) => {
  console.error("growth_intelligence_demo_failed", error);
  process.exitCode = 1;
});
