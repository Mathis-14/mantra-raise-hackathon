# Mantra — Agent Guide

An autonomous agent that plays a prototype game like a real player, tells the studio if it's fun **before** any ad spend, then closes the creative-testing loop: variants → video creatives → deploy → metrics → keep/kill → what to build next.

This file is the single source of truth for working in this repo. Read it before starting any task. It is:

- **Normative** — new work must move the codebase toward these practices, never imitate existing code that violates them.
- **Living** — when you learn something durable (decision, constraint, incident, convention), update this file **in the same change**. Do not use hidden memory as a substitute for updating this file.

Claude Code reads `CLAUDE.md`, which imports this file with `@AGENTS.md`. Codex and Cursor read it directly. Do not let them drift.

## Project context

**RAISE hackathon — Google DeepMind in-person track. Single-day build.**

Hypercasual studios burn money discovering that prototypes aren't fun: a human must play each one, judge it, cut creatives, and read metrics — and most prototypes die anyway. The judgment that matters most ("is this fun?") happens through **play**, not instrumentation. Mantra moves the kill decision **before** the ad spend by letting an agent play the game the way a player would — visually, through the screen, with zero privileged access to game state.

**Computer Use is the heart, not a feature.** Every other node could be scripted; the play-based fun verdict cannot. That verdict is what makes the rest of the pipeline worth trusting — it's the load-bearing primitive for the DeepMind judges.

```
Input: HTML game (Mob Control clone in game/) + market/trend context
  └── 1. Playtest (Gemini Computer Use — THE star): plays end to end,
  │      emits live actions/screenshots, produces a player's verdict
  └── 2. Approval gate (dashboard button)
  └── 3. Variants: N mutated versions of the game, each testing a hypothesis
  └── 4. Creatives: ad videos via Veo from game + variants
  └── 5. Deploy: Google Ads (STUB by design)
  └── 6. Measure: metrics (SEEDED by design — honesty line below)
  └── 7. Decide: keep/kill per creative + next-build recommendation
  └── Memory: knowledge base compounds across projects; agent runs continuously
```

**Honesty line (never blur it):** playtest, variants, and video generation are real. Ads deploy is a stub and metrics are seeded — a live campaign needs ~48h to exit the learning phase. Exactly one thing is simulated, deliberately; everything upstream is genuine. Say this plainly in the demo and the README.

**Demo (~1 min):** problem (15s) → agent playing + report, pre-recorded & sped up (25s, the wow) → variants + videos (15s) → live dashboard, metrics, keep/kill (15s). Keep one live element so it doesn't feel canned.

## Stack


| Layer             | Choice                                                                             |
| ----------------- | ---------------------------------------------------------------------------------- |
| App               | Single Next.js app (App Router, React 19, TS strict) — dashboard + API + all nodes |
| Long-running work | `npm run worker` (tsx) on a laptop — Playwright/Computer Use cannot run on Vercel  |
| State + realtime  | Supabase (Postgres). Single source of truth; dashboard subscribes via realtime     |
| Playtest          | Playwright + Gemini Computer Use (`@google/genai`)                                 |
| Creatives         | Veo via `@google/genai` (+ committed fallback videos)                              |
| Validation        | Zod — every request body, env var, and LLM output parsed at the boundary           |
| Styling           | Tailwind CSS 4                                                                     |
| Package manager   | npm — do not switch                                                                |
| Deploy            | Vercel (dashboard + API); worker stays local for the demo                          |




## Commands

```bash
npm install
npx playwright install chromium   # once, for the playtest node
npm run dev            # dashboard + API on :3000
npm run worker         # orchestrator + nodes (needs .env) — EXACTLY ONE per machine
npm run game           # game dev server on :5173 — needed for index.html uploads
npm run typecheck
npm run lint
npm run build
```

Setup: copy `.env.example` → `.env`, fill keys (ask Mathis). Apply `supabase/schema.sql` in the Supabase SQL editor of the shared project.

## Live playtest runbook (follow exactly — each miss burned real debugging time)

1. **Start, each in its own terminal:** `npm run dev` (:3000) · `npm --prefix frontend run dev -- --host 127.0.0.1 --port 5175` (Vite UI) · `npm run worker` · `npm run game` (only if uploading the multi-file game's `index.html`).
2. **Exactly one worker per machine (D011).** Port 4317 is the mutex: if `npm run worker` fails with `live_stream_port_in_use`, a worker already runs — find it with `lsof -nP -iTCP:4317` and kill it before starting a new one. Never leave an old worker alive: it races run claims with stale in-memory code (headed browser, no stream frames) and the symptoms look like frontend bugs.
3. **Restart the worker after any change under `src/nodes/`, `src/orchestrator/`, or `src/worker/`** — tsx loads code at startup, there is no hot reload. A worker started before your change silently runs the old code.
4. **Upload rules:** a self-contained HTML (inline JS/CSS; absolute `https:` CDN refs OK) uploads to storage — `game/mob-control-clone.html` works as-is. The multi-file game's `index.html` (references `/src/main.js`) requires `npm run game` running: the upload API auto-detects the dev server on ports 5173–5180 and plays it directly. Anything else is rejected with a 400 that says why.
5. **Expected result:** in the Vite UI, upload → "Run agent" → within ~5s of the worker claim, the `Situation 1` phone shows live gameplay (LIVE pill, action captions, cursor overlay); the agent continues past victory (post-win sweep), and the run auto-advances to variants when the report lands.
6. **If `Situation 1` says "Live stream unavailable":** the run was almost certainly claimed by a wrong/stale worker or no worker — check `lsof -nP -iTCP:4317`, check the run's events for `playtesting_started`, and re-check step 2.

## Architecture

```
game/                    # EXISTING input game + assets — PROTECTED (see Agent rules)
references/              # EXISTING market refs (Mob Control gifs) — PROTECTED
supabase/schema.sql      # DB schema — mirrors src/contracts/types.ts, change together
docs/DEMO.md             # demo script + pre-record checklist
src/
├── contracts/types.ts   # CANONICAL shared surface — see conflict rules below
├── lib/                 # canonical modules: supabase.ts, env.ts, events.ts
├── app/                 # dashboard pages + thin API routes
├── components/          # dashboard UI
├── orchestrator/        # state-machine controller loop
├── nodes/               # playtest/ · variants · creatives · ads · decide
└── worker/              # long-running entry point (runs orchestrator locally)
```

Structural rules:

- **Dependencies point inward.** Routes and pages are wiring; nodes own pipeline logic; `contracts/` owns shapes. If you feel the need to put pipeline logic in a route or UI state in a node — stop and rethink the layer.
- **The state machine is the only mover.** `RunStatus` + `RUN_TRANSITIONS` in `src/contracts/types.ts` define every legal step. Never set a status the map forbids; the approval gate is the only edge the dashboard advances.
- **All liveness goes through** `events` **rows** (`src/lib/events.ts`). If the dashboard can't see it, it didn't happen.
- **Parse at the boundary.** Request bodies, env, and LLM/Veo output go through Zod before they touch logic. LLM output is a draft until validated — no uncontrolled AI writes.
- **Time-box every external call** (Gemini, Veo, Supabase). One slow dependency must not hang the worker loop; a failed run goes to `failed` with `failed_step`, the loop keeps going.
- Don't scaffold speculative folders or abstractions. Monolith tripwire: split modules past ~300 lines.



## Ownership & conflict rules

Four people, one app, one day. These rules exist so we never block each other:


| Area                                                                   | Owner                        |
| ---------------------------------------------------------------------- | ---------------------------- |
| `game/`, `src/app/` pages, `src/components/`                           | Noé + Romain                 |
| `src/orchestrator/`, `src/worker/`                                     | Tom                          |
| `src/nodes/ads.ts`, `src/nodes/decide.ts`                              | Aymen                        |
| `src/nodes/playtest/`, `docs/DEMO.md`                                  | Mathis                       |
| `src/nodes/variants.ts`, `src/nodes/creatives.ts`                      | **TBD — claim in team chat** |
| `src/contracts/types.ts`, `src/lib/`, `supabase/schema.sql`, this file | Shared — rules below         |


- **Stay in your directories.** Editing outside your area = shout in team chat first.
- `src/contracts/types.ts` **is canonical.** Changing it = announce to the team + update every consumer (including `supabase/schema.sql`) in the same commit. Never work around it with local types.
- **Canonical modules are mandatory:** Supabase access only via `src/lib/supabase.ts`; env only via `src/lib/env.ts`; liveness only via `src/lib/events.ts`. No second client, no raw `process.env`, no console-driven "liveness".
- **Node signatures are locked** (`src/nodes/`* exported functions). Internals are private to their owner; consumers depend on signatures only.
- `main` **stays runnable at all times.** Pull before push. Small commits. If you break `main`, fixing it preempts everything else.



## Take a step back before writing code

1. **Has this already been built?** Grep first — duplication is the most common agent failure.
2. **Does this file already encode the answer?**
3. **Is this the right layer, and the right owner's directory?**
4. **Is it on the demo path?** If not, it can probably wait.

A 20-second clarification in team chat beats a 2-hour wrong implementation.

## Quality rules

- No `any` / `as any`, no double casts, no non-null assertions to silence uncertainty — fix the type. Explicit generics when constructing from external data (`new Set<string>(data)`).
- Guard clauses first; named constants over magic numbers; comments capture business decisions only, never narrate code.
- When introducing a helper, migrate every inline duplicate in the same commit. Delete dead code entirely — grep for zero callers.
- **Security:** keys live in `.env` only (gitignored) — `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never reach the browser, logs, or commits. The anon key is read-only by RLS; all writes go through API routes/worker.
- **Logging:** structured `snake_case` event names with identifiers; never log keys or full prompts.



## Testing & verification

Hackathon rule: the demo path is the test surface.

- `npm run typecheck` must pass before every push — type errors cost more time than they save under pressure.
- After any change touching the pipeline: re-run the full flow (create project → run → approve → done) and watch the dashboard. **Do not assume previous results are still valid.**
- Unit tests only where logic branches meaningfully (transition guards, metric seeding, decision parsing). Never weaken or delete a check to make something pass.
- Throwaway test scripts are means-to-verify — don't commit them.



## Git workflow

- Work on `main` (hackathon mode) or short-lived `<type>/<slug>` branches for risky work. Keep every commit runnable.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`), imperative, English. All repo artifacts in English.
- **No** `Co-Authored-By` **or tool-attribution lines** in commits or PR text. Strip accidental trailers before push.
- **No force pushes, no destructive git operations** (`push --force`, `reset --hard`, `clean -f`, history rewrites) — with five committers on one branch this is how a day dies. Ask first, always.
- Why: commits and merges are irreversible coordination points during the hackathon. Agents must never assume approval.
- Agents: never commit without explicit human approval for that commit.
- Agents: never commit on `main`; commit only on a feature/fix branch after approval.
- Agents: never merge branches or PRs. A human owns PR creation/merge unless they explicitly delegate PR preparation, and merge remains human-owned.
- Agents: never push without the owner's go-ahead.



## Agent rules

- Read affected files before editing. Implement only the requested scope. New dependencies need explicit approval.
- **Do not trust internal knowledge for Gemini APIs — they are too new.** Read the docs first, every time:
  - Computer Use: [https://ai.google.dev/gemini-api/docs/computer-use](https://ai.google.dev/gemini-api/docs/computer-use)
  - Veo (video): [https://ai.google.dev/gemini-api/docs/video](https://ai.google.dev/gemini-api/docs/video)
  - SDK: `node_modules/@google/genai/` docs/types
- **Protected paths (read-only):** `game/` **and** `references/`**.** Team-made game + assets and market references — never modify, reformat, or delete without explicit approval from Noé/Romain. Variants copy `game_html`; they never edit the source game.
- **No destructive commands without explicit approval:** `rm -rf`, dropping/truncating Supabase tables, deleting cloud resources, overwriting files you didn't create. Look at the target before deleting; if it doesn't match expectations, stop and surface it.
- Don't kill teammates' dev servers or the worker process.
- When adding a hard-won rule here, state the one-line **Why** first, then the rule.



## Decision log

- **D001** — 2026-07-04 — Single Next.js app at repo root (no separate backend): Vercel-simple, one codebase for four people. Rejected: monorepo with a Python playtest service.
- **D002** — 2026-07-04 — Computer Use node in TypeScript (Playwright + `@google/genai`): one language everywhere. Rejected: Python quickstart path.
- **D003** — 2026-07-04 — Supabase as single source of truth + realtime dashboard feed. Rejected: SQLite+polling (no shared state across machines), in-memory (dies on restart).
- **D004** — 2026-07-04 — Hand-rolled state machine (status union + transition map + worker loop). Rejected: LangGraph/Trigger.dev — nothing to learn on the clock.
- **D005** — 2026-07-04 — Long-running work (orchestrator + playtest) runs in `npm run worker` on a laptop; Vercel hosts dashboard + API. Why: Playwright/CU can't run in serverless routes. Both sides talk only to Supabase.
- **D006** — 2026-07-04 — Ads deploy stubbed + metrics seeded, everything upstream real (the honesty line). Why: campaigns need ~48h to produce signal.
- **D007** — 2026-07-04 — Contracts locked in `src/contracts/types.ts`; directory ownership per stream. Why: four parallel builders, zero integration hours to spare.
- **D008 — UNRESOLVED** — 2026-07-05 — Production browser runner after the local demo. Default direction: keep Vercel for dashboard/API and move Playwright/CU to Vercel Sandbox if it proves stable; Cloudflare Browser Run remains the fallback candidate. Keep the hackathon demo local until this is tested.
- **D009 — UNRESOLVED** — 2026-07-05 — Vercel-hosted dashboard reading a laptop worker stream. Why: public HTTPS pages talking to `127.0.0.1` need browser CORS/Private Network Access validation. The local worker stream must answer CORS preflights with `Access-Control-Allow-Private-Network: true`; do not assume this path is production-ready until tested from the deployed Vercel URL.
- **D010** — 2026-07-05 — The live phone view is a local visual mirror, not source-of-truth state. Why: an OS/Playwright browser window cannot be embedded into an existing browser DOM phone. The worker streams frames/actions to the carousel for the demo; durable liveness still goes through `events` rows.
- **D011** — 2026-07-05 — Exactly one worker per machine; the live-stream port (4317) bind is the mutex. Why: a stale duplicate worker races run claims and replays old in-memory code (headed browser pointed at the carousel, no stream frames) — this burned a debugging hour. A second `npm run worker` now fails fast with a clear message. Related: uploads must be self-contained HTML (local `src=`/`href=` references 404 after upload), enforced with a 400 at `/api/uploads/game`; if the uploaded HTML references `/src/...`, the API auto-detects the local game dev server (ports 5173–5180) and plays it directly.
- **D012** — 2026-07-05 — Headless playtest Chromium must launch with GPU flags (`--enable-gpu --use-angle=metal` on macOS). Why: headless defaults to SwiftShader software WebGL — the demo game ran at 7 fps (looked like the game itself lagged); with Metal it runs at 120 fps (measured on Apple M3). Set in `src/nodes/playtest/browser.ts`.



## External services


| Service    | Purpose                                                               | Env vars                                                                                 |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Gemini API | Computer Use (playtest) + Veo (creatives) + LLM (variants, decisions) | `GEMINI_API_KEY`                                                                         |
| Supabase   | Pipeline state, events feed, knowledge base, realtime                 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Vercel     | Dashboard + API hosting                                               | —                                                                                        |


---



## Hackathon mode

Single-day build. The demo path **is** the product.

**What changes:**

- **Riskiest first:** the Computer Use playtest node starts immediately — it's the long pole and the money shot. Everything else layers onto a working spine.
- **Vertical slice over breadth:** one game, one full loop, demoed flawlessly. Cut scope, not the demo path.
- Commit early and often to `main`; every commit runnable, so we can roll back live.
- Verification = re-running the demo flow after every change. A broken demo found at minute 5 is fixable; at minute 55 it is not.
- **A fallback for every external dependency:** pre-recorded CU gameplay clip (sped up — the wow moment), committed fallback videos for Veo, seeded metrics. Networks fail on stage.

**What never relaxes:** no secrets in client code or commits · typecheck passes · parse LLM/Veo output before acting on it · protected paths stay protected · this file stays current so every teammate's agent stays aligned.

**Demo checklist:**

- [ ] CU playtest proven end-to-end on the Mob Control clone (ugly is fine)
- [ ] Veo creatives generated from the game — because the playtest ran (primitive composition)
- [ ] Full run-through from a clean state, twice
- [ ] Fallbacks tested: kill the network, replay the canned path
- [ ] Pre-recorded agent-playing clip exported and sped up
- [ ] Pitch states the honesty line + "we evaluate game feel through play, not instrumentation"
