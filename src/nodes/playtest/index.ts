// owner: Mathis — Computer Use playtest node. THE load-bearing node: the agent
// plays the game through the rendered screen (Playwright + Gemini Computer Use),
// no privileged access to game state. Its verdict is a player's verdict.
//
// Read before building: https://ai.google.dev/gemini-api/docs/computer-use
// (screenshot → model action → execute → repeat loop). Do NOT code this from
// memory — the API is new and moves fast.
//
// Must emit events (type "action"/"observation"/"screenshot") continuously via
// emitEvent() so the dashboard shows the agent playing live.

import type { PlaytestInput, PlaytestReport } from "@/contracts/types";

export async function runPlaytest(input: PlaytestInput): Promise<PlaytestReport> {
  throw new Error(`not implemented — owner: Mathis (run ${input.runId})`);
}
