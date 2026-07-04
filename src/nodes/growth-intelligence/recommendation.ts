import type {
  CreativeEvaluation,
  PrototypeRecommendation,
} from "@/contracts/types";

const MINIMUM_PROTOTYPE_SCORE = 65;
const MINIMUM_WINNING_MARGIN = 5;
const BEST_CREATIVE_WEIGHT = 0.7;
const PORTFOLIO_WEIGHT = 0.3;
const ORIGINAL_KEY = "__original__";

interface PrototypeCandidate {
  key: string;
  variantId: string | null;
  score: number;
  evaluations: CreativeEvaluation[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}

function buildCandidates(evaluations: readonly CreativeEvaluation[]): PrototypeCandidate[] {
  const groups = new Map<string, CreativeEvaluation[]>();
  for (const evaluation of evaluations) {
    const key = evaluation.variant_id ?? ORIGINAL_KEY;
    const existing = groups.get(key) ?? [];
    existing.push(evaluation);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const ordered = [...group].sort(
        (left, right) => right.overall_score - left.overall_score || left.creative_id.localeCompare(right.creative_id),
      );
      const best = ordered[0];
      if (!best) {
        throw new Error(`Prototype group ${key} has no evaluations`);
      }
      const average = ordered.reduce((sum, evaluation) => sum + evaluation.overall_score, 0) / ordered.length;
      return {
        key,
        variantId: best.variant_id,
        score: round(best.overall_score * BEST_CREATIVE_WEIGHT + average * PORTFOLIO_WEIGHT, 1),
        evaluations: ordered,
      };
    })
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));
}

function noWinner(candidates: readonly PrototypeCandidate[], rationale: string): PrototypeRecommendation {
  const supportingCreativeIds = candidates
    .flatMap((candidate) => candidate.evaluations.slice(0, 1))
    .sort((left, right) => left.rank - right.rank || left.creative_id.localeCompare(right.creative_id))
    .map((evaluation) => evaluation.creative_id);

  return {
    outcome: "no_clear_winner",
    selected_variant_id: null,
    supporting_creative_ids: supportingCreativeIds,
    confidence: 0.5,
    rationale,
    next_actions: ["Iterate the strongest creative from each prototype and rerun the same benchmark."],
  };
}

export function recommendPrototype(
  evaluations: readonly CreativeEvaluation[],
): PrototypeRecommendation {
  if (evaluations.length === 0) {
    return noWinner([], "No evaluated creatives are available to support a prototype decision.");
  }

  const candidates = buildCandidates(evaluations);
  const winner = candidates[0];
  if (!winner) {
    return noWinner([], "No prototype candidates are available to compare.");
  }
  if (winner.score < MINIMUM_PROTOTYPE_SCORE) {
    return noWinner(
      candidates,
      `The leading prototype scored ${winner.score}, below the ${MINIMUM_PROTOTYPE_SCORE}-point continuation threshold.`,
    );
  }

  const runnerUp = candidates[1];
  const margin = runnerUp ? round(winner.score - runnerUp.score, 1) : winner.score;
  if (runnerUp && margin < MINIMUM_WINNING_MARGIN) {
    return noWinner(
      candidates,
      `The top prototypes are separated by only ${margin} points, below the ${MINIMUM_WINNING_MARGIN}-point decision margin.`,
    );
  }

  const keepRate = winner.evaluations.filter((evaluation) => evaluation.decision === "KEEP").length /
    winner.evaluations.length;
  const confidence = round(clamp(0.6 + Math.min(margin, 20) / 20 * 0.25 + keepRate * 0.1, 0.6, 0.95), 2);
  const supportingCreativeIds = winner.evaluations
    .filter((evaluation) => evaluation.decision !== "KILL")
    .slice(0, 3)
    .map((evaluation) => evaluation.creative_id);
  const isOriginal = winner.variantId === null;
  const prototypeLabel = isOriginal ? "original prototype" : `variant ${winner.variantId}`;

  return {
    outcome: isOriginal ? "continue_original" : "continue_variant",
    selected_variant_id: winner.variantId,
    supporting_creative_ids: supportingCreativeIds,
    confidence,
    rationale: `${prototypeLabel} leads with a ${winner.score} prototype score${runnerUp ? ` and a ${margin}-point margin` : ""}.`,
    next_actions: [
      `Continue development of the ${prototypeLabel}.`,
      "Use its highest-ranked creative as the control for the next concept test.",
    ],
  };
}
