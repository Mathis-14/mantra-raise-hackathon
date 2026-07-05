// owner: Aymen — creative deployment (SIMULATED) + metrics (SEEDED by design).
// A PAUSED campaign shell can be created separately in a verified test account;
// creatives are never uploaded and all campaign performance remains simulated.
// Seed believable curves where one creative clearly wins (that's the demo beat).

import type { Creative, MetricPoint } from "@/contracts/types";
import { emitEvent } from "@/lib/events";
import {
  campaignLifecycleStep,
  createSimulatedCampaign,
} from "@/nodes/growth-intelligence/campaign";
import { simulateMetrics } from "@/nodes/growth-intelligence/simulation";
import { parseCreatives, parseRunId } from "@/nodes/growth-intelligence/validation";

export interface DeployInput {
  runId: string;
  creatives: Creative[];
}

/** Records simulated creative deployment; the orchestrator persists creative statuses. */
export async function deployCreatives(input: DeployInput): Promise<void> {
  const runId = parseRunId(input.runId);
  const creatives = parseCreatives(input.creatives);
  const campaign = createSimulatedCampaign(
    runId,
    creatives.map((creative) => creative.id),
  );

  await emitEvent({
    run_id: runId,
    node: "ads",
    type: "status",
    message: "Preparing simulated creative deployment",
    screenshot_url: null,
    data: {
      ...campaignLifecycleStep(campaign, "preparing"),
      creative_count: creatives.length,
      deployment_mode: "creative_deployment_simulated",
    },
  });
  await emitEvent({
    run_id: runId,
    node: "ads",
    type: "action",
    message: `Prepared ${creatives.length} creative(s) for simulated campaign evaluation`,
    screenshot_url: null,
    data: {
      ...campaignLifecycleStep(campaign, "deployed"),
      creative_ids: campaign.creativeIds,
      deployment_mode: "creative_deployment_simulated",
    },
  });
}

export interface CollectMetricsInput {
  runId: string;
  creatives: Creative[];
}

/** Returns seeded per-creative time-series for the orchestrator to persist. */
export async function collectMetrics(input: CollectMetricsInput): Promise<MetricPoint[]> {
  const runId = parseRunId(input.runId);
  const creatives = parseCreatives(input.creatives);
  const campaign = createSimulatedCampaign(
    runId,
    creatives.map((creative) => creative.id),
  );

  await emitEvent({
    run_id: runId,
    node: "ads",
    type: "status",
    message: "Collecting deterministic simulated campaign metrics",
    screenshot_url: null,
    data: {
      ...campaignLifecycleStep(campaign, "collecting_metrics"),
      creative_count: creatives.length,
      simulation: "deterministic",
    },
  });

  const metrics = simulateMetrics(creatives);

  await emitEvent({
    run_id: runId,
    node: "ads",
    type: "observation",
    message: `Collected simulated metrics for ${metrics.length} creative(s)`,
    screenshot_url: null,
    data: {
      ...campaignLifecycleStep(campaign, "metrics_collected"),
      creative_ids: campaign.creativeIds,
      simulation: "deterministic",
    },
  });

  return metrics;
}
