import type {
  Creative,
  CreativeDecision,
  CreativeExplanation,
  CreativeScoreBreakdown,
  MetricPoint,
} from "@/contracts/types";

type ScoreKey = keyof CreativeScoreBreakdown;

const SCORE_KEYS: readonly ScoreKey[] = [
  "ctr",
  "watch_time",
  "completion_rate",
  "cpi",
  "audience_fit",
];

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function strength(key: ScoreKey, creative: Creative, metric: MetricPoint): string {
  const messages: Record<ScoreKey, string> = {
    ctr: `The ${percent(metric.ctr)} CTR shows the opening earns attention efficiently.`,
    watch_time: `Average watch time reaches ${metric.watch_time_s.toFixed(1)}s of the ${creative.duration_s.toFixed(1)}s creative.`,
    completion_rate: `The ${percent(metric.completion_rate)} completion rate indicates durable viewer interest.`,
    cpi: `The $${metric.cpi.toFixed(2)} CPI converts attention into installs efficiently.`,
    audience_fit: `The ${(creative.attributes.audience_fit * 100).toFixed(0)}% audience-fit signal supports scalable targeting.`,
  };
  return messages[key];
}

function weakness(key: ScoreKey, creative: Creative, metric: MetricPoint): string {
  const messages: Record<ScoreKey, string> = {
    ctr: `CTR is ${percent(metric.ctr)}; the first seconds need a clearer hook or faster payoff.`,
    watch_time: `Average watch time is ${metric.watch_time_s.toFixed(1)}s of ${creative.duration_s.toFixed(1)}s, signaling early drop-off.`,
    completion_rate: `Only ${percent(metric.completion_rate)} complete the creative, so the middle section is losing momentum.`,
    cpi: `CPI is $${metric.cpi.toFixed(2)}, which is too expensive for confident scaling.`,
    audience_fit: `Audience fit is ${(creative.attributes.audience_fit * 100).toFixed(0)}%; the concept and targeting are not aligned strongly enough.`,
  };
  return messages[key];
}

function nextAction(key: ScoreKey): string {
  const actions: Record<ScoreKey, string> = {
    ctr: "Test an action-first opening that communicates the gameplay payoff within two seconds.",
    watch_time: "Remove setup frames and bring the first progression beat earlier.",
    completion_rate: "Shorten the middle sequence and move the strongest reward reveal before the drop-off point.",
    cpi: "Tighten the audience promise and make the install payoff explicit in the final beat.",
    audience_fit: "Reframe the creative around the target audience's clearest gameplay motivation.",
  };
  return actions[key];
}

function orderedScores(breakdown: CreativeScoreBreakdown): Array<readonly [ScoreKey, number]> {
  return SCORE_KEYS.map((key) => [key, breakdown[key]] as const);
}

export function explainCreative(
  creative: Creative,
  metric: MetricPoint,
  breakdown: CreativeScoreBreakdown,
  decision: CreativeDecision,
): CreativeExplanation {
  const descending = orderedScores(breakdown).sort((left, right) => right[1] - left[1]);
  const ascending = [...descending].sort((left, right) => left[1] - right[1]);
  const strongest = descending[0];
  const weakest = ascending[0];
  if (!strongest || !weakest) {
    throw new Error(`Cannot explain creative ${creative.id} without score components`);
  }

  const summaryByDecision: Record<CreativeDecision, string> = {
    KEEP: "This creative combines efficient acquisition with strong attention and is ready to scale.",
    ITERATE: "This creative shows useful demand signal, but one performance constraint should be fixed before scaling.",
    KILL: "This creative does not generate enough efficient demand to justify further spend in its current form.",
  };

  const strengths = descending
    .filter(([, score]) => score >= 65)
    .slice(0, 2)
    .map(([key]) => strength(key, creative, metric));
  const weaknesses = ascending
    .filter(([, score]) => score < 65)
    .slice(0, 2)
    .map(([key]) => weakness(key, creative, metric));

  if (strengths.length === 0) {
    strengths.push(strength(strongest[0], creative, metric));
  }
  if (weaknesses.length === 0) {
    weaknesses.push(weakness(weakest[0], creative, metric));
  }

  return {
    summary: summaryByDecision[decision],
    strengths,
    weaknesses,
    next_action: decision === "KEEP"
      ? "Scale budget cautiously and preserve this hook as the control creative."
      : nextAction(weakest[0]),
  };
}
