# Current Build State

## Branch And Status

Current branch during this handoff:

```bash
feat/plug-real-workflow
```

Important: the work described here is uncommitted. There are earlier uncommitted workflow changes
plus the live-stream changes. Do not assume this is already in `main`.

Current dirty areas include:

- `frontend/src/main.ts`, `frontend/src/pipeline.ts`, `frontend/src/playtest.ts`, `frontend/src/style.css`
- `frontend/src/api.ts`, `frontend/src/flow.ts`, `frontend/src/variants.ts`, `frontend/vite.config.ts`
- `src/app/api/runs/[id]/state/`
- `src/app/api/uploads/`
- `src/nodes/playtest/browser.ts`, `src/nodes/playtest/index.ts`, `src/nodes/playtest/live-stream.ts`
- `src/orchestrator/loop.ts`, `src/worker/index.ts`
- `AGENTS.md`, `supabase/schema.sql`

## Intended Flow

1. User uploads an HTML game in the Vite UI.
2. Vite calls Next API routes through its `/api` proxy.
3. Next uploads the HTML to Supabase Storage and returns a playable route under
   `/api/uploads/game/...`.
4. Next creates a project and run in Supabase.
5. `npm run worker` claims the newest `created` run and moves it to `playtesting`.
6. `runPlaytest` opens the uploaded game URL in Playwright and Gemini Computer Use plays visually.
7. Playtest emits durable `events` rows and screenshots to Supabase.
8. A local worker SSE stream publishes live frames/actions for the carousel phone.
9. Frontend `Situation 1` subscribes to the SSE stream and should show the agent playing.
10. After report generation, the run advances to `awaiting_approval`; the UI auto-approves into variants.

## What Works

- Upload route works for `game/mob-control-clone.html`.
- Worker claim path works.
- Playtest still writes Supabase events, screenshots, usage, timing summary, and validated report.
- The worker no longer intentionally opens the Vite `#playtest?...&agent=1` route.
- The local SSE stream exists on `http://127.0.0.1:4317`.
- CORS/Private Network Access headers are present for Vercel-origin browser requests.
- A live test run completed 10 turns and reached `awaiting_approval`.

## What Is Not Done

- The visible Vite carousel is not yet verified as a polished live demo surface.
- The `Situation 1` phone display is not adapted to the game frame: it uses the worker viewport frame,
  not a phone-native crop/viewport.
- The visual feed may look like stale still images rather than continuous live play.
- Latency is too high for an impressive live demo unless the UI communicates progress or the loop is
  made faster.
- Gameplay-situation extraction into five functional gameplays is still future work.
- Variant generation into five phones is still partially scaffolded, not fully shipped.

## Local Services

Expected local services:

- Next API/dashboard: `http://localhost:3000`
- Vite UI: usually `http://127.0.0.1:5175/`; in the latest test it fell back to `5176`
- Worker SSE stream: `http://127.0.0.1:4317`

If a port is already used, check which process is the real active server before killing anything.
AGENTS.md says not to kill teammate dev servers casually.
