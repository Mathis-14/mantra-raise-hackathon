# Latency Issue

## Problem

The playtest is functionally correct but too slow to feel good as a live demo. Cost is not the
priority. Rapidity and reliability are.

Latest measured live run:

- Run ID: `43670223-9081-4b3c-97ba-f3cc56ad8396`
- Game: uploaded `game/mob-control-clone.html`
- Result: 10 turns, validated report, status `awaiting_approval`
- Total session time: about `94.1s`
- Play loop time: about `85.6s`
- CU total time: about `53.0s`
- CU p50 latency: `5118ms`
- CU p95 latency: `6689ms`
- Action total time: about `29.9s`
- Capture total time: about `1.1s`
- Report generation: about `7.4s`
- Estimated CU cost from usage events: about `$0.135`

## Where Time Goes

The stream itself is not the main latency source. The main delays are:

1. Gemini Computer Use calls, around 5 to 7 seconds per turn in the verified run.
2. Long game actions such as `hold_and_steer`, often 2.5s requested duration plus execution overhead.
3. Report generation after play ends.

Screenshot capture and upload are comparatively small in this run.

## Current Constraints

- Do not cut at victory. The agent must continue after a win because bugs can happen after win
  screens or next-level transitions.
- Do not replace Computer Use with privileged game-state scripting for the main play verdict.
- Do not skip Zod validation or weaken report schema.
- Do not add dependencies without explicit approval.
- Keep `GEMINI_API_KEY` and Supabase service role server-only.

## Existing Speed Levers Already In Use

- Gemini model is `gemini-3.5-flash`.
- Service tier is set to `priority`.
- Previous interaction ID is reused.
- The loop batches up to `MAX_CALLS_PER_TURN = 4`, but the model often emits one action per turn.
- The playtest is capped by budget and minimum remaining time.

## Candidate Fixes To Benchmark

1. Reduce action durations for `hold_and_steer`.
   - Current default is 2500ms.
   - Benchmark lower values such as 900ms, 1200ms, and 1600ms on the Mob Control clone.
   - Acceptance: still reaches gates reliably and still catches post-win issues.

2. Prompt for more action batching.
   - The executor can handle multiple calls per CU turn, but the model often chooses one action.
   - Update prompts to encourage obvious batches: select loadout, click play, then start steering
     when the UI is predictable.
   - Acceptance: fewer CU turns without more errors.

3. Make the UI feel live during model waits.
   - If the game is static while CU thinks, the phone looks frozen.
   - Show honest "thinking/observing" state and last action timestamp, not fake gameplay.
   - Continue streaming real game frames and cursor state.

4. Separate demo-time report from full report only if still Zod-validated.
   - Fast-path self verdict already exists for some cases.
   - Any change must preserve a valid `PlaytestReport`.

5. Benchmark viewport/framing changes.
   - A phone-shaped viewport may reduce useless screenshot pixels and improve both display and CU
     interpretation.
   - Must verify it does not reintroduce clipping.

## Acceptance Criteria

- First visible action feels prompt after upload/run creation.
- A clean run still reaches at least 10 turns or the planned bounded post-win sweep.
- The agent continues beyond victory.
- The validated report still prints/persists.
- Supabase events remain complete.
- Per-run timing summary stays available for comparison.
