# Playtest Node — Milestones

Brick by brick; every milestone ends merged to `main`, runnable. M0+M1 together target a full ugly
loop in ≤ ~2h (riskiest-first: the CU loop is the long pole and the money shot).

**Per-milestone gate (all of them):** `npm run typecheck` passes + a `dev.ts` run against a
`local-games/` game while watching the dashboard (`npm run dev`). Conventional Commits, no
Co-Authored-By/tool trailers. Merge to `main` directly; push only with Mathis's go-ahead.

---

## M0 — `feat/playtest-m0-smoke` (~30–40 min) — BLOCKED until `GEMINI_API_KEY` is in `.env`

Goal: prove the key + model + API surface before writing the loop.

1. `npx playwright install chromium` (once).
2. Scratchpad smoke script (**never committed** — AGENTS.md: throwaway scripts are means-to-verify):
   open any page with Playwright, take 1 screenshot, call `ai.interactions.create` with the
   computer_use tool on `gemini-3.5-flash`, print the returned function calls. Repeat against
   `gemini-2.5-computer-use-preview-10-2025`.
   - Verifies: key has CU access (Tier 3 ⇒ quota fine, but CU is preview), the exact response
     shape, multi-call turns, `function_result` mechanics, any SDK quirks (e.g. `api_version` param).
3. Record findings (which model works, latency per turn) in `config.ts` comments.

**Commit:** `feat(playtest): gemini CU client + config constants` — `gemini.ts`, `config.ts`,
`.gitignore` line for `local-games/`.
**Verify:** typecheck; smoke script printed a valid CU action for both (or the chosen) model.

## M1 — `feat/playtest-m1-loop` (~60–90 min) — THE MONEY SHOT EXISTS HERE

Goal: headed Chromium visibly plays a `local-games/` game end to end, ugly.

1. `browser.ts` (launch, viewport, capture, recordVideo), `actions.ts` (Zod action schema,
   denormalization, slow-drag baseline, legacy aliases, safety-ack), minimal loop in `index.ts`
   (no report yet — return a placeholder that Zod-fails loudly if leaked… no: throw at the end
   with a clear "M3 pending" error after emitting session events; the harness prints the transcript).
2. `dev.ts` harness (creates `dev:` project + run at status `playtesting`, calls `runPlaytest`).
3. `action` events flow to the dashboard (`screenshot_url` null for now).

**Commit:** `feat(playtest): CU loop plays a local game via dev harness`.
**Verify:** watch the browser play ≥10 coherent turns on a test game; events visible in the
dashboard run feed; typecheck.

## M2 — `feat/playtest-m2-screens` (~30 min)

Goal: the dashboard shows live frames of the agent playing.

1. `screens.ts`: local frame sink + detached Supabase Storage upload → `screenshot` events with
   public URLs.
2. Append the `playtest-media` bucket SQL to `supabase/schema.sql` and apply it in the shared
   Supabase project. **Announce the shared-file change in team chat.**

**Commit:** `feat(playtest): live screenshot feed via supabase storage`.
**Verify:** dashboard run page renders frames appearing during a dev run; loop latency unchanged
(uploads detached).

## M3 — `feat/playtest-m3-report` (~45 min)

Goal: `runPlaytest` fulfills its contract end to end.

1. `prompts.ts` (player persona, French-UI notes, hold-to-fire explanation, termination rules) —
   `report.ts` (transcript + keyframes → structured output → Zod → 2 attempts).
2. Termination reasons wired (`budget|max_turns|model_done|cu_error`); partial-session path returns
   an honest report when ≥ `MIN_TURNS_FOR_REPORT`.

**Commit:** `feat(playtest): zod-validated playtest report`.
**Verify:** dev run returns a complete `PlaytestReport`; `fun_score` is 0–10; headline reads like a
verdict, not a log; typecheck.

## M4 — `feat/playtest-m4-hardening` (~45 min)

Goal: nothing hangs, everything degrades honestly; pick the winning input strategy.

1. All time-boxes + the 1-retry policy; deadline re-check before retries; kill-the-network test
   mid-session → run fails honestly (or partial report if ≥ MIN_TURNS), worker pattern intact.
2. Latency-playbook experiments in order: hold-latch → action batching → `steer_to` macro.
   Keep what is rock-solid, flag off the rest. Record the reliability verdict in code comments.
3. Per-turn `usage` cost logging into event `data`; headless flag.
4. Propose the AGENTS.md decision-log entry (hand-rolled local CU loop over sandboxes/frameworks/
   Live API) — shared file, announce.

**Commit(s):** `feat(playtest): hardening + latency experiments`.
**Verify:** network-kill test; a full dev run with the chosen input strategy clears (or honestly
fails) level 1; cost per run visible in events.

## M5 — `feat/playtest-m5-real-game` (~45 min + recording)

Goal: the real demo asset, on the real game.

1. Run against `game/mob-control-clone.html` (**read-only** — never modify it). Tune `prompts.ts`
   for the French UI / JOUER / VICTOIRE / DÉFAITE.
2. **GATE — evaluate the contingency trigger** (see contingency-two-tier-hybrid.md): if the agent
   cannot meaningfully engage (can't clear level 1 / incoherent steering despite the M4 winner),
   pivot the gameplay layer per that document. Otherwise proceed.
3. Integrate with Tom's orchestrator when it lands (it calls `runPlaytest`, persists the report,
   advances `playtesting → awaiting_approval`). Full clean-state pipeline twice.
4. Record the demo assets: full session via Playwright `recordVideo` (webm in
   `playtest-artifacts/`), cut to ~20s at 6× (`ffmpeg -i in.webm -filter:v "setpts=PTS/6" -an out.mp4`),
   report card as closing frame; plus one full fallback recording. Stretch only: upload the replay
   webm + emit `observation` event with `data.video_url` for a run-page embed (coordinate with
   Noé/Romain before building).
5. Update `docs/DEMO.md` beats (clip + live headed window + dashboard) and tick its checklist.

**Commits:** `feat(playtest): real-game tuning` · `docs: demo clip + checklist`.
**Verify:** two consecutive clean full-pipeline runs; clip exported; fallback recording exists;
re-run the demo flow after ANY later change touching the node.
