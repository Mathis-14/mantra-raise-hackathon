// owner: Aymen — Google Ads deploy (STUB by design) + metrics (SEEDED by design).
// Honesty line: real ingestion architecture, simulated numbers — a live campaign
// needs ~48h to exit the learning phase, which a one-day build cannot produce.
// Seed believable curves where one creative clearly wins (that's the demo beat).

import type { Creative, MetricPoint } from "@/contracts/types";
import { emitEvent } from "@/lib/events";
import { simulateMetrics } from "@/nodes/growth-intelligence/simulation";

export interface DeployInput {
  runId: string;
  creatives: Creative[];
}

/** Performs the stub deployment; the orchestrator persists creative statuses. */
export async function deployCreatives(input: DeployInput): Promise<void> {
  await emitEvent({
    run_id: input.runId,
    node: "ads",
    type: "status",
    message: "Preparing simulated Google Ads campaign",
    screenshot_url: null,
    data: {
      phase: "preparing_campaign",
      progress: 10,
      creative_count: input.creatives.length,
      deployment_mode: "stubbed",
    },
  });
  await emitEvent({
    run_id: input.runId,
    node: "ads",
    type: "action",
    message: `Deployed ${input.creatives.length} creative(s) to the simulated campaign`,
    screenshot_url: null,
    data: {
      phase: "deploying_creatives",
      progress: 25,
      creative_ids: input.creatives.map((creative) => creative.id),
      deployment_mode: "stubbed",
    },
  });
}

export interface CollectMetricsInput {
  runId: string;
  creatives: Creative[];
}

/** Returns seeded per-creative time-series for the orchestrator to persist. */
export async function collectMetrics(input: CollectMetricsInput): Promise<MetricPoint[]> {
  await emitEvent({
    run_id: input.runId,
    node: "ads",
    type: "status",
    message: "Collecting deterministic simulated campaign metrics",
    screenshot_url: null,
    data: {
      phase: "collecting_metrics",
      progress: 40,
      creative_count: input.creatives.length,
      simulation: "deterministic",
    },
  });

  const metrics = simulateMetrics(input.creatives);

  await emitEvent({
    run_id: input.runId,
    node: "ads",
    type: "observation",
    message: `Collected simulated metrics for ${metrics.length} creative(s)`,
    screenshot_url: null,
    data: {
      phase: "metrics_collected",
      progress: 50,
      creative_ids: metrics.map((metric) => metric.creative_id),
      simulation: "deterministic",
    },
  });

  return metrics;
}
