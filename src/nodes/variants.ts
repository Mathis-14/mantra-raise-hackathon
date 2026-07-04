// owner: TBD (unassigned in the task split — claim it in team chat).
// Generates N mutated versions of the game HTML, each testing one hypothesis
// drawn from the playtest report + market context. Output must stay playable —
// a variant the playtest agent can't open is worthless downstream.

import type { PlaytestReport, Variant } from "@/contracts/types";

export interface VariantsInput {
  runId: string;
  gameHtml: string;
  report: PlaytestReport;
  marketContext: string | null;
  count: number;
}

export async function generateVariants(input: VariantsInput): Promise<Variant[]> {
  throw new Error(`not implemented — owner: TBD (run ${input.runId})`);
}
