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
- If you reach VICTOIRE, DEFAITE, DÉFAITE, game over, or a replay overlay, you may restart once.
- When you have enough evidence, stop asking for tool calls and give a concise player's verdict.

Prefer reliable actions:
- Use click for menus and obvious buttons.
- Use slow drag or mouse_down + move + mouse_up for hold-to-fire games.
- If the next UI actions are obvious, you may emit multiple function calls in one turn.
`.trim();

export const ACTION_LOOP_NUDGE = `
You seem to be repeating the same action. Change strategy based on the latest screen:
try holding and dragging, aim at gates/enemies, or stop with a verdict if you have enough evidence.
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
${retryLine}
`.trim();
}
