// owner: Aymen — keep/kill + next-build recommendation. Closes the loop:
// reads the attention signal (metrics) + the playtest report, decides which
// creatives live, and — the output studios actually want — which prototype
// direction to build next. LLM-assisted is fine; parse/validate the model
// output into Decision before persisting (no uncontrolled AI writes).

import type { Decision, MetricPoint, PlaytestReport } from "@/contracts/types";

export interface DecideInput {
  runId: string;
  report: PlaytestReport;
  metrics: MetricPoint[];
}

export async function decide(input: DecideInput): Promise<Decision> {
  throw new Error(`not implemented — owner: Aymen (run ${input.runId})`);
}
