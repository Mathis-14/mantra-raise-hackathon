# Playtest Node — Implementation Codex

Execution-ready plan for `src/nodes/playtest/` (owner: Mathis). Built for milestone-by-milestone
implementation (auto-ship compatible): each milestone in [milestones.md](./milestones.md) is a
self-contained brief with branch name, deliverables, and verification.

**Read `AGENTS.md` first — it is normative.** This codex adds node-level detail; it never overrides it.

## Files

| File | Contents |
|---|---|
| [FIRST-PROMPT.md](./FIRST-PROMPT.md) | **The auto-ship entry point** — hand this prompt to the build agent; loop schema, verifiers, pre-approved sign-offs |
| [architecture.md](./architecture.md) | Node design: file layout, CU loop, action mapping, exact API shapes, failure containment |
| [milestones.md](./milestones.md) | M0–M5 with branch names, step-by-step deliverables, per-milestone verification |
| [research.md](./research.md) | Why this architecture won (sandboxes/frameworks/Live API rejected), cost math, latency levers, pitch ammo |
| [contingency-two-tier-hybrid.md](./contingency-two-tier-hybrid.md) | **The other choice** — reflex+strategist design, its M5 trigger criterion, pivot instructions |

## What this node is

The load-bearing primitive of Mantra: an agent plays an HTML game **through the rendered screen**
(Playwright + Gemini Computer Use, zero privileged access to game state) and returns a player's fun
verdict. Locked signature (`src/contracts/types.ts`):

```ts
runPlaytest(input: PlaytestInput): Promise<PlaytestReport>
```

All liveness flows through `emitEvent()` (`src/lib/events.ts`) as `action` / `observation` /
`screenshot` events. Runs inside `npm run worker` on a laptop (never Vercel). The orchestrator —
not this node — persists the report and owns status transitions.

## Locked decisions (summary)

1. **Gemini Interactions API**, `gemini-3.5-flash` primary (CU is a built-in tool since 2026-06-24),
   `gemini-2.5-computer-use-preview-10-2025` fallback constant. Key is **Tier 3** — quota/cost are
   non-issues (~$0.15–1 per session; one Veo creative costs 12–60× more).
2. **Efficiency config**: `thinking_level: 'low'` (latency lever), `resolution: 'medium'` on
   screenshot parts, byte-identical prefix for implicit caching, per-turn `usage` logged into event
   `data` (real $/playtest in the dashboard).
3. **CU-only build effort.** The two-tier hybrid is a written contingency with an explicit M5
   trigger — see [contingency-two-tier-hybrid.md](./contingency-two-tier-hybrid.md). Not a milestone.
4. **Hold-and-drag**: slow-drag baseline; ranked experiments hold-latch → action batching →
   `steer_to` macro; M4 adopts what proves rock-solid.
5. **Test games** live in gitignored `local-games/` (uncommitted, from Mathis's personal repo),
   opened via `file://`. Production uses `Project.game_url` — same code path.
6. **Screenshots** for the live dashboard: public Supabase Storage bucket `playtest-media`
   (schema.sql addition — announce to team). Local frames + session `.webm` go to `playtest-artifacts/`.
7. **Game speed: full speed, no runtime manipulation.** If the agent can't cope, that is the finding.
8. **Demo**: pre-recorded sped-up clip (mandatory fallback) + live headed Chromium on stage + live
   dashboard feed.
9. **Branches**: one per milestone (`feat/playtest-m0-smoke` … `feat/playtest-m5-real-game`),
   merged to `main` after `npm run typecheck` + a dev-harness run. Conventional Commits, **no
   Co-Authored-By or tool-attribution trailers**. Push only with Mathis's go-ahead.

## Hard constraints (from AGENTS.md — never relax)

- `game/` and `references/` are **read-only**. Variants copy `game_html`; never edit the source game.
- Supabase only via `src/lib/supabase.ts`; env only via `src/lib/env.ts`; liveness only via
  `src/lib/events.ts`. No raw `process.env`, no second client.
- Every LLM output is a draft until Zod-parses — including CU action arguments.
- Time-box every external call; a failed run goes to `failed` + `failed_step`, the worker keeps looping.
- No `any`/`as any`/non-null assertions. Typecheck passes before every push.
- Secrets never reach the browser, logs, or commits.

## Relay to team (research side-findings)

- Creatives node must target **`veo-3.1`** — older Veo models were shut down 2026-06-30.
- Keep pipeline LLM calls on Flash-class models.
- At M4, propose an AGENTS.md decision-log entry: hand-rolled local CU loop chosen over
  sandboxes/frameworks/Live API (one-line why) — shared file, announce in team chat.
