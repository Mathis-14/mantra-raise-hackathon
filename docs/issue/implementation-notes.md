# Implementation Notes

## Important Files

- `src/nodes/playtest/live-stream.ts`
  - Local SSE server and in-memory frame/action publisher.
  - This file is already 341 lines, over the AGENTS.md "split past about 300 lines" tripwire. If
    touched again, split it into smaller modules such as stream server, publisher, and action mapping.

- `src/nodes/playtest/index.ts`
  - Calls `startPlaytestScreencast`.
  - Calls `publishLiveAction`.
  - Calls `publishLiveFrame` after screenshots.
  - Still emits all durable Supabase events through `emitEvent`.

- `src/nodes/playtest/browser.ts`
  - `openBrowserSession` now defaults to headless.
  - Current viewport still comes from `VIEWPORT` in `src/nodes/playtest/config.ts`.

- `src/orchestrator/loop.ts`
  - Removed the old Vite `#playtest?...&agent=1` target.
  - Passes the raw uploaded `gameUrl` into `runPlaytest`.
  - Emits `live_stream_url` in the orchestrator status event.

- `frontend/src/playtest.ts`
  - Renders `Original` as uploaded-game preview.
  - Renders `Situation 1` as the live agent stream phone when a run exists.
  - Supports optional `live=` hash param through `FlowRoute.liveStreamBaseUrl`.

- `frontend/src/style.css`
  - Contains phone frame CSS and live stream CSS.
  - `.phone-live-frame` currently uses `object-fit: contain`.

## Current Data Flow

```text
Vite upload UI
  -> Next /api/uploads/game
  -> Next /api/projects
  -> Next /api/runs
  -> Supabase run status created
  -> npm run worker claims run
  -> runPlaytest opens uploaded game URL in Playwright
  -> Gemini CU sees screenshots and emits actions
  -> Playwright executes actions
  -> Supabase events/screenshots/report persist
  -> local SSE stream publishes frames/actions
  -> Vite Situation 1 phone consumes SSE
```

## Vercel Preparation

The dashboard/API can be hosted on Vercel, but the worker remains local for the demo. The local SSE
server includes:

- localhost origins allowed;
- `https://*.vercel.app` origins allowed;
- `Access-Control-Allow-Private-Network: true` for Chrome PNA preflight.

This is preparation only. It has not been proven from a deployed Vercel URL yet.

## Do Not Do

- Do not restore `agent=1` as the main solution.
- Do not open a second visible Vite page for the agent.
- Do not fake gameplay in the phone.
- Do not edit `game/` or `references/`.
- Do not change `src/contracts/types.ts` unless you also update schema and all consumers.
- Do not stop the run immediately after victory.

## Likely Best Next Change

Make the worker's visual coordinate system match the phone:

1. Benchmark a phone-shaped Playwright viewport for `runPlaytest`.
2. Verify Computer Use still clicks and steers correctly.
3. If it works, stream that same phone-shaped frame to the carousel.
4. If it fails, keep the CU viewport as-is but stream a precisely computed game crop with matching
   cursor coordinate transform.

The key invariant: the pixels shown in the phone and the coordinates used for the cursor overlay must
use the same transform.
