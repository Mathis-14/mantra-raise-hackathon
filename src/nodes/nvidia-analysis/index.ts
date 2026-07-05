import { createNvidiaClient, type NvidiaClientOptions } from "./client";
import { rankVersions, scoreVersion } from "./scoring";
import {
  gameplayComparisonInputSchema,
  gameplayComparisonSchema,
  type GameplayComparison,
  type GameplayComparisonInput,
} from "./schema";

export type {
  GameplayComparison,
  GameplayComparisonInput,
  GameplayVersionAnalysis,
  GameplayVersionInput,
  NvidiaAnalysisDraft,
} from "./schema";

export async function compareGameplayVersions(
  input: unknown,
  clientOptions: NvidiaClientOptions = {},
): Promise<GameplayComparison> {
  const parsedInput = gameplayComparisonInputSchema.parse(input);
  const client = createNvidiaClient(clientOptions);
  const analyses = [];

  for (const version of parsedInput.versions) {
    const draft = await client.analyze(version);
    analyses.push(scoreVersion({ input: version, draft, model: client.model }));
  }

  return gameplayComparisonSchema.parse(rankVersions({
    runId: parsedInput.runId,
    analyses,
  }));
}
