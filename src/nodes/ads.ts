// owner: Aymen — Google Ads deploy (STUB by design) + metrics (SEEDED by design).
// Honesty line: real ingestion architecture, simulated numbers — a live campaign
// needs ~48h to exit the learning phase, which a one-day build cannot produce.
// Seed believable curves where one creative clearly wins (that's the demo beat).

import type { Creative, MetricPoint } from "@/contracts/types";
import { simulateMetrics } from "@/nodes/growth-intelligence/simulation";

export interface DeployInput {
  runId: string;
  creatives: Creative[];
}

/** Performs the stub deployment; the orchestrator persists creative statuses. */
export async function deployCreatives(input: DeployInput): Promise<void> {
  void input;
}

export interface CollectMetricsInput {
  runId: string;
  creatives: Creative[];
}

/** Returns seeded per-creative time-series for the orchestrator to persist. */
export async function collectMetrics(input: CollectMetricsInput): Promise<MetricPoint[]> {
  return simulateMetrics(input.creatives);
}
