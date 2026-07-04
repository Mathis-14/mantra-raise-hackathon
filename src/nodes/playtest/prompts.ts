import type { TranscriptEntry, TerminationReason } from "./types";

export const PLAYER_PROMPT = `
You are a real mobile-game player evaluating whether this HTML prototype is fun.
You only know what is visible on the screen. Do not infer hidden game state.

Mission:
- Start the game if a menu or button is visible. French UI is common; "JOUER" means play.
- Play as naturally as possible. Explore, react to what happens, and try to win.
- For Mob Control-like games, hold and drag to fire continuously and steer the stream.
- For MOB RUSH specifically: click JOUER, keep the pointer held on the track, drag left/right
  through blue multiplier gates, avoid red penalty gates, and destroy the red base.
- If you reach VICTOIRE, do not stop immediately. Quickly check the reward/coins screen, click
  SUIVANT or NIVEAU SUIVANT if visible, confirm the next level starts, and play 5-10 seconds.
- If you reach DEFAITE, DÉFAITE, game over, REJOUER, or RÉESSAYER, you may restart once to check
  the replay path.
- When you have enough evidence after those continuation checks, stop asking for tool calls and
  return only strict JSON with keys: playable, fun_score, fun_rationale, friction_points, bugs,
  session_summary, headline.

Prefer reliable actions:
- Use click for menus and obvious buttons.
- Use hold_and_steer for active hold-to-fire lane gameplay. Use one hold_and_steer call per
  gameplay turn; keep release false unless you intentionally stop firing.
- Use click for menus and overlays, not hold_and_steer.
- If the next UI actions are obvious and low-risk, batch 2-4 function calls in one turn
  (for example click JOUER then start holding, or click NIVEAU SUIVANT then start gameplay).
- Do not batch fine steering choices that need fresh visual feedback.
`.trim();

export const ACTION_LOOP_NUDGE = `
You seem to be repeating the same action. Change strategy based on the latest screen:
try holding and dragging, aim at gates/enemies, or stop with a verdict if you have enough evidence.
`.trim();

export const POST_WIN_SWEEP_PROMPT = `
You appear to have reached a win/victory state. Do not finish yet.
Run a fast post-win sweep:
1. Check whether reward/coins/continue feedback is visible.
2. Click SUIVANT or NIVEAU SUIVANT if visible.
3. Confirm the next level starts and play 5-10 seconds with one short hold_and_steer or hold/drag.
4. If a replay/restart path is visible, click it once and confirm it works.
If those checks are done or not reachable quickly, stop and return strict JSON with the report keys.
`.trim();

export function buildReportPrompt(args: {
  transcript: TranscriptEntry[];
  terminationReason: TerminationReason;
  selfVerdict: string | null;
  partial: boolean;
  parseError?: string;
}) {
  const transcriptLines = args.transcript
    .map((entry) => {
      const intent = entry.intent ? ` — ${entry.intent}` : "";
      return `Turn ${entry.turn}: ${entry.action}${intent} => ${entry.result}`;
    })
    .join("\n");

  const retryLine = args.parseError
    ? `\nPrevious JSON failed validation. Fix this error: ${args.parseError}\n`
    : "";

  return `
You are writing Mantra's playtest verdict for a hypercasual game prototype.
Write like a player and studio evaluator, not a QA bot.

Termination: ${args.terminationReason}
Partial session: ${args.partial ? "yes" : "no"}
Model self-verdict during play: ${args.selfVerdict ?? "none"}

Transcript:
${transcriptLines || "No actions recorded."}

Return strict JSON matching the requested schema.
- playable: true only if the agent meaningfully interacted with the game.
- fun_score: integer or decimal from 0 to 10.
- fun_rationale: explain the score from game feel.
- friction_points: ordered by severity; include confusion, pacing, controls, feedback.
- bugs: visible technical/gameplay failures only.
- session_summary: concise summary of what the agent did and saw.
- headline: one-line verdict suitable for a dashboard card.
- If a post-win continuation check happened, include reward/next-level/replay findings in
  session_summary and put visible continuation failures in bugs.
${retryLine}
`.trim();
}
