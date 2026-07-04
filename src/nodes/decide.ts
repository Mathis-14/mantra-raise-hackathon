// owner: Aymen — keep/kill + next-build recommendation. Closes the loop:
// reads the attention signal (metrics) + the playtest report, decides which
// creatives live, and — the output studios actually want — which prototype
// direction to build next. LLM-assisted is fine; parse/validate the model
// output into Decision before persisting (no uncontrolled AI writes).

import type { Creative, Decision, MetricPoint, PlaytestReport } from "@/contracts/types";
import { emitEvent } from "@/lib/events";
import { evaluateCreatives } from "@/nodes/growth-intelligence";

export interface DecideInput {
  runId: string;
  report: PlaytestReport;
  creatives: Creative[];
  metrics: MetricPoint[];
}

export async function decide(input: DecideInput): Promise<Decision> {
  await emitEvent({
    run_id: input.runId,
    node: "decide",
    type: "status",
    message: "Evaluating creative performance",
    screenshot_url: null,
    data: { phase: "evaluating_creatives", progress: 60 },
  });

  const decision = evaluateCreatives(input.runId, input.creatives, input.metrics);

  await emitEvent({
    run_id: input.runId,
    node: "decide",
    type: "action",
    message: "Ranked creative variants",
    screenshot_url: null,
    data: {
      phase: "ranking_variants",
      progress: 70,
      ranked_creative_ids: decision.evaluations.map((evaluation) => evaluation.creative_id),
    },
  });
  await emitEvent({
    run_id: input.runId,
    node: "decide",
    type: "action",
    message: "Selected campaign winners",
    screenshot_url: null,
    data: {
      phase: "selecting_winners",
      progress: 80,
      keep_creative_ids: decision.keep_creative_ids,
      iterate_creative_ids: decision.iterate_creative_ids,
      kill_creative_ids: decision.kill_creative_ids,
    },
  });
  await emitEvent({
    run_id: input.runId,
    node: "decide",
    type: "action",
    message: "Generated prototype recommendation",
    screenshot_url: null,
    data: {
      phase: "generating_recommendation",
      progress: 90,
      outcome: decision.prototype_recommendation.outcome,
      selected_variant_id: decision.prototype_recommendation.selected_variant_id,
    },
  });
  await emitEvent({
    run_id: input.runId,
    node: "decide",
    type: "status",
    message: "Growth Intelligence evaluation complete",
    screenshot_url: null,
    data: {
      phase: "complete",
      progress: 100,
      evaluated_creative_count: decision.evaluations.length,
    },
  });

  return decision;
}
