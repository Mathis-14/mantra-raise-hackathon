import { createHash } from "node:crypto";

export const CAMPAIGN_PHASES = [
  "preparing",
  "deployed",
  "collecting_metrics",
  "metrics_collected",
] as const;

export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number];

export interface SimulatedCampaign {
  id: string;
  runId: string;
  creativeIds: readonly string[];
}

export interface CampaignLifecycleStep {
  campaign_id: string;
  phase: CampaignPhase;
  progress: number;
}

const PHASE_PROGRESS: Record<CampaignPhase, number> = {
  preparing: 10,
  deployed: 25,
  collecting_metrics: 40,
  metrics_collected: 50,
};

export function createSimulatedCampaign(
  runId: string,
  creativeIds: readonly string[],
): SimulatedCampaign {
  const sortedCreativeIds = [...creativeIds].sort();
  const fingerprint = JSON.stringify([runId, sortedCreativeIds]);
  const digest = createHash("sha256").update(fingerprint).digest("hex").slice(0, 24);

  return {
    id: `sim-${digest}`,
    runId,
    creativeIds: sortedCreativeIds,
  };
}

export function campaignLifecycleStep(
  campaign: SimulatedCampaign,
  phase: CampaignPhase,
): CampaignLifecycleStep {
  return {
    campaign_id: campaign.id,
    phase,
    progress: PHASE_PROGRESS[phase],
  };
}

export function buildCampaignLifecycle(
  campaign: SimulatedCampaign,
): CampaignLifecycleStep[] {
  return CAMPAIGN_PHASES.map((phase) => campaignLifecycleStep(campaign, phase));
}
