// owner: TBD (unassigned in the task split — claim it in team chat).
// Generates ad-creative videos (Veo via @google/genai) from the game and its
// variants. Veo jobs are async and can take minutes — poll, don't block other
// runs. MUST ship with committed fallback videos so a Veo outage or quota
// miss can never kill the demo.
//
// Read before building: https://ai.google.dev/gemini-api/docs/video

import type { Creative, Variant } from "@/contracts/types";

export interface CreativesInput {
  runId: string;
  gameUrl: string;
  variants: Variant[];
}

export async function generateCreatives(input: CreativesInput): Promise<Creative[]> {
  throw new Error(`not implemented — owner: TBD (run ${input.runId})`);
}
