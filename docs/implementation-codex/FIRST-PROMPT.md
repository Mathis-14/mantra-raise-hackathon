# FIRST-PROMPT — Auto-ship the Playtest Node

You are an autonomous build agent. Ship `src/nodes/playtest/` end-to-end — spec → verified,
milestone per milestone — with the human (Mathis) on-the-loop only at the stops defined below.
You write the loop, not just code: **a change that breaks the build is not done.**

## Read first, in this order (then do not re-litigate)

1. `AGENTS.md` — normative for everything (ownership, protected paths, quality bar, git rules).
2. `docs/implementation-codex/README.md` — locked decisions.
3. `docs/implementation-codex/architecture.md` — the design + verified API ground truth. Trust its
   API shapes; if reality contradicts them, that's a finding to report, not a reason to redesign.
4. `docs/implementation-codex/milestones.md` — your execution script (M0 → M5).
5. `docs/implementation-codex/research.md` — context only; every alternative there is already rejected.
6. `docs/implementation-codex/contingency-two-tier-hybrid.md` — read ONLY at the M5 gate.

## Locked spec

Implement `runPlaytest(input: PlaytestInput): Promise<PlaytestReport>` exactly as architected:
Playwright + Gemini Computer Use (Interactions API, `gemini-3.5-flash`) plays the game through the
screen, streams `action`/`observation`/`screenshot` events via `emitEvent()`, returns a
Zod-validated report. **Acceptance:** every milestone gate in `milestones.md` green, ending with
two consecutive clean dev-harness runs against a `local-games/` game and (M5) the real
`game/mob-control-clone.html`.

## Preflight (stop and report if any fails — do not work around)

- `GEMINI_API_KEY` present in `.env` (M0 is blocked without it).
- `npx playwright install chromium` completed.
- Supabase env vars present; `supabase/schema.sql` applied to the shared project.
- `local-games/` contains at least one test game HTML (Mathis provides; uncommitted by design).

## Verifiers (pinned commands)

| Gate | Command | Kind |
|---|---|---|
| Types | `npm run typecheck` | deterministic — must be green before EVERY commit |
| Lint | `npm run lint` | deterministic |
| Function | `npx tsx --env-file=.env src/nodes/playtest/dev.ts --game local-games/<file>.html --budget 120` | non-deterministic (live CU) — gate on: session runs ≥10 turns without crashing, events appear in Supabase, and (from M3) a valid `PlaytestReport` prints |

Loop-until-green per milestone, cap ~5 fix iterations; still red → STOP + report. Never weaken,
skip, or hack a check to pass it. After each milestone, run one adversarial review pass (independent
reviewer refutes the diff against the codex + AGENTS.md; reviewer reports, you apply or reject on
the record).

## Pre-approved sign-offs (granted once, here — Rule #1: no silent fallback beyond this list)

- The LLM prompts in `prompts.ts` (player persona, nudge, report prompt) as specified in
  `architecture.md`.
- `.gitignore` line for `local-games/`; creating `local-games/` and `docs/DEMO.md` edits (M5).
- `supabase/schema.sql` append: the `playtest-media` public bucket (M2) — **announce in team chat
  before applying**, per AGENTS.md shared-file rule.
- Commits on milestone branches `feat/playtest-m0-smoke` … `feat/playtest-m5-real-game` and merges
  to `main` (Conventional Commits, **no Co-Authored-By or any tool-attribution trailers**).

**NOT approved — stop and ask if you think you need it:** pushing to remote; touching `game/`,
`references/`, `src/contracts/types.ts`, `src/lib/*`, or other owners' directories beyond the
items above; adding npm dependencies; destructive git; firing the M5 hybrid contingency (present
the trigger evidence to Mathis and wait); weakening any Zod schema or time-box.

## Execution

For each milestone M0→M5 in `milestones.md`: branch → implement → verifier loop → adversarial
pass → merge to `main` → next. M0's smoke script stays uncommitted (scratch only). Keep every
commit runnable. Time-box the whole run: if a milestone exceeds ~2× its estimate, stop and report
rather than thrash.

## Handoff report (mandatory, at the end or at any stop)

Changed files; verifier results per milestone; adversarial findings + dispositions
(`fixed in <ref>` / `rejected: <reason>`); measured per-turn CU latency and $/session (from
`usage` logging); every deviation, assumption, and TODO; M5 gate evidence (did the agent engage
the real game?). Then STOP — Mathis reviews; **you never push or deploy.**
