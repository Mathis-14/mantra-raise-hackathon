import type {
  GameplayComparison,
  GameplayVersionAnalysis,
  GameplayVersionInput,
  NvidiaAnalysisDraft,
} from "./schema";

export const SCORE_WEIGHTS = Object.freeze({
  color: 0.3,
  audio: 0.25,
  video: 0.45,
});

export function scoreVersion(args: {
  input: GameplayVersionInput;
  draft: NvidiaAnalysisDraft;
  model: string;
}): Omit<GameplayVersionAnalysis, "rank"> {
  const overallScore = roundOneDecimal(
    args.draft.color.score * SCORE_WEIGHTS.color
      + args.draft.audio.score * SCORE_WEIGHTS.audio
      + args.draft.video.score * SCORE_WEIGHTS.video,
  );

  return {
    version_id: args.input.id,
    version_name: args.input.name,
    video_url: args.input.videoUrl,
    ...args.draft,
    overall_score: overallScore,
    provenance: {
      provider: "NVIDIA",
      model: args.model,
    },
  };
}

export function rankVersions(args: {
  runId: string;
  analyses: Omit<GameplayVersionAnalysis, "rank">[];
}): GameplayComparison {
  if (args.analyses.length < 2) {
    throw new Error("At least two gameplay analyses are required for comparison");
  }

  const versions = [...args.analyses]
    .sort((left, right) => (
      right.overall_score - left.overall_score
        || left.version_id.localeCompare(right.version_id)
    ))
    .map((analysis, index) => ({ ...analysis, rank: index + 1 }));
  const winner = versions[0];
  const runnerUp = versions[1];
  if (!winner || !runnerUp) {
    throw new Error("Comparison ranking did not produce a winner and runner-up");
  }

  return {
    run_id: args.runId,
    winner_version_id: winner.version_id,
    winner_reason: buildWinnerReason(winner, runnerUp),
    score_weights: SCORE_WEIGHTS,
    versions,
  };
}

function buildWinnerReason(
  winner: GameplayVersionAnalysis,
  runnerUp: GameplayVersionAnalysis,
): string {
  const advantages = [
    { label: "color readability", delta: winner.color.score - runnerUp.color.score },
    { label: "audio feedback", delta: winner.audio.score - runnerUp.audio.score },
    { label: "video pacing", delta: winner.video.score - runnerUp.video.score },
  ].sort((left, right) => right.delta - left.delta);
  const strongest = advantages[0];
  const margin = roundOneDecimal(winner.overall_score - runnerUp.overall_score);

  if (!strongest || strongest.delta <= 0) {
    return `${winner.version_name} leads by ${margin} points on the weighted NVIDIA score.`;
  }
  return `${winner.version_name} leads by ${margin} points, with its largest advantage in ${strongest.label}.`;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
