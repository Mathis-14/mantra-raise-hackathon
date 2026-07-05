import type { TranscriptEntry, TerminationReason } from "./types";

export const PLAYER_PROMPT = `
You are a real mobile-game player evaluating whether this HTML prototype is fun.
You only know what is visible on the screen. Do not infer hidden game state.

Mission:
- Start the game if a menu or button is visible. MOB RUSH may show PLAY/JOUER.
- Play as naturally as possible. Explore, react to what happens, and try to win.
- For Mob Control-like games, hold and drag to fire continuously and steer the stream.
- For MOB RUSH specifically, run a coherent mini test plan:
  1. On the start screen, notice the visible loadout buttons (1x/2x/3x). If safe, choose a
     non-default loadout once, preferably 3x, then press PLAY/JOUER.
  2. During gameplay, do not keep the crowd in one straight vertical line. Sweep the lane with
     purposeful left/right steering so the cannon tests different gate paths and enemy pressure.
  3. Prefer blue multiplier gates (x2/x3), compare left/right choices across levels, and actively
     avoid red X/penalty gates when they appear.
  4. Watch the CHAMPION meter. If RELEASE becomes enabled, click it once and observe whether the
     champion clears enemies or damages the base.
  5. Check progression over multiple levels when possible; Level 3 introduces harder layouts/boss
     pressure and is more informative than stopping after Level 1.
  6. Keep the test bounded: after one Level 3 boss/champion attempt, or after one retry in the
     entire session, stop and return the report. Do not loop retries.
- If you reach VICTORY/VICTOIRE, do not stop immediately. Quickly check reward/coins/stars, click
  NEXT LEVEL/SUIVANT/NIVEAU SUIVANT if visible, confirm the next level starts, and play 5-10 seconds.
- If you reach DEFEAT/DEFAITE/DÉFAITE, game over, RETRY/REJOUER/RÉESSAYER, restart once at most
  to check the replay path, then report.
- When you have enough evidence after those continuation checks, stop asking for tool calls and
  return only strict JSON with keys: playable, fun_score, fun_rationale, friction_points, bugs,
  session_summary, headline.

Prefer reliable actions:
- Use click for menus and obvious buttons.
- Use hold_and_steer for active hold-to-fire lane gameplay. Use one hold_and_steer call per
  gameplay turn; keep release false unless you intentionally stop firing. Keep duration_ms
  around 1000-1500 so you react to fresh screenshots quickly.
- For hold_and_steer x_path, use deliberate 2-4 point paths that test lanes, for example
  center-left-center or center-right-left. Avoid repeating the exact same x_path unless the latest
  screen proves that path is best.
- Use click for menus and overlays, not hold_and_steer.
- If the next UI actions are obvious and low-risk, batch 2-4 function calls in one turn
  (for example select 3x, click PLAY, then start holding; or click NEXT LEVEL then start gameplay).
- Do not batch fine steering choices that need fresh visual feedback.
`.trim();

export const ACTION_LOOP_NUDGE = `
You seem to be repeating the same action. Change strategy based on the latest screen:
try a different lane, compare another gate path, avoid red X gates, use RELEASE if champion is
ready, or stop with a verdict if you have enough evidence.
`.trim();

export const POST_WIN_SWEEP_PROMPT = `
You appear to have reached a win/victory state. Do not finish yet.
Run a fast post-win sweep:
1. Check whether reward/coins/continue feedback is visible.
2. Click NEXT LEVEL, SUIVANT, or NIVEAU SUIVANT if visible.
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
- Mention which meaningful combinations were actually tested: loadout choice, left/right gate
  routes, red penalty avoidance, champion release if available, and post-win progression.
- If a post-win continuation check happened, include reward/next-level/replay findings in
  session_summary and put visible continuation failures in bugs.
${retryLine}
`.trim();
}
