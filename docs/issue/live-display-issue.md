# Live Display Issue

## Problem

The agent should visibly play inside the existing Vite carousel, specifically in the `Situation 1`
phone. It must not open another visible Vite UI or a separate user-facing browser window.

Current state:

- The worker stream endpoint returns real frames.
- The `Situation 1` phone has an EventSource consumer.
- But the visible display is still not convincingly live and not adapted to the phone frame.

Expected state:

- Upload HTML, start run, stay in the Vite carousel.
- `Original` phone shows the uploaded game preview.
- `Situation 1` phone shows the worker-controlled agent playing in real time.
- The image fills the phone correctly without showing a desktop-sized page squeezed into the phone.
- Cursor/click overlay aligns with the visible game content.

## Current Implementation

Worker stream:

- `src/nodes/playtest/live-stream.ts`
  - Starts local HTTP/SSE server on `127.0.0.1:4317`.
  - `GET /runs/:runId/stream` streams `frame`, `action`, and `status` events.
  - `OPTIONS` replies with CORS and `Access-Control-Allow-Private-Network: true`.
  - Uses Chrome DevTools Protocol `Page.startScreencast`.
  - Also publishes captured turn frames through `publishLiveFrame`.

Playtest loop:

- `src/nodes/playtest/index.ts`
  - Starts screencast after Playwright opens the game.
  - Publishes action metadata after each CU action.
  - Publishes screenshot captures after each turn.

Frontend:

- `frontend/src/playtest.ts`
  - `LIVE_AGENT_PHONE_ID = 1`.
  - Connects to `http://127.0.0.1:4317/runs/<runId>/stream`.
  - Sets `agent-live-frame.src` to `data:image/jpeg;base64,...`.
  - Draws cursor/click overlay from normalized action coordinates.
  - Maps coordinates using the full streamed frame aspect.

Styling:

- `frontend/src/style.css`
  - `.phone-live-frame` uses `object-fit: contain`.
  - The phone screen aspect is `160 / 284`.
  - The Playwright viewport is currently `1280 x 1100`, so the streamed frame aspect does not match
    the phone aspect.

## Likely Causes

1. The worker captures a full desktop-ish viewport (`1280 x 1100`) and the phone is narrow/tall.
   `object-fit: contain` squeezes the full viewport into the phone instead of showing a phone-native
   crop.
2. The game itself is centered inside the Playwright viewport, so the useful game area may occupy
   only a slice of the streamed frame.
3. If the user opens the carousel after the run has already progressed or ended, the SSE server sends
   only the latest cached frame. That can look like a still, not live play.
4. If CDP screencast frames are not reaching the UI reliably, the fallback frames only update once
   per CU turn, which is too slow to feel live.
5. Cursor coordinates are based on Gemini normalized viewport coordinates. If the displayed image is
   cropped, letterboxed, or scaled differently, the cursor will drift unless the same transform is
   applied to both image and coordinates.

## Acceptance Criteria

- No second Vite UI is opened by the worker.
- The agent video appears in `Situation 1`, not the center/original phone.
- First live frame appears in the phone within about 2 seconds after the worker starts playing.
- While the game is moving, the phone image changes continuously, not only once per CU turn.
- The visible game content fills the phone in a natural mobile composition.
- No important game UI is clipped.
- Cursor/click overlay lands on the visible target.
- If the stream is unavailable, the phone shows a hard stream error rather than fake gameplay.

## Recommended Debug Path

1. Add temporary visible diagnostics in `Situation 1`: frame count, latest frame timestamp, event type
   (`screencast` vs `capture`), and rendered image dimensions.
2. Use browser devtools or a small test page to confirm `frame` EventSource messages continue during
   active gameplay.
3. Take a Playwright screenshot of the Vite UI during a run and inspect whether the phone image is
   changing and properly framed.
4. Decide the framing strategy:
   - preferred: make the Playwright/CU viewport phone-shaped so screenshots and action coordinates
     share one coordinate system;
   - alternative: crop to the game canvas/container and apply identical crop math to cursor mapping;
   - avoid: `object-fit: cover` alone, because it can hide UI and break coordinate alignment.
5. Keep Supabase events as durable state; do not move source-of-truth liveness into the SSE stream.
