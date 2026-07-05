# Playtest Live Carousel Issue Packet

Purpose: handoff context for another agent to continue the live playtest carousel work without
reconstructing the chat history.

Read in this order:

1. [`current-build-state.md`](./current-build-state.md)
2. [`live-display-issue.md`](./live-display-issue.md)
3. [`latency-issue.md`](./latency-issue.md)
4. [`implementation-notes.md`](./implementation-notes.md)
5. [`verification-and-repro.md`](./verification-and-repro.md)

## TL;DR

The pipeline now creates backend runs, the local worker claims them, Gemini Computer Use plays the
uploaded HTML game, Supabase receives events/screenshots/report rows, and a local SSE stream exists
at `http://127.0.0.1:4317`.

The remaining issue is the demo surface: the agent must visibly play inside the `Situation 1` phone
in the Vite carousel. The current stream endpoint returns real JPEG frames, but the visible UI is
still not convincingly live and the frame is not adapted to the phone screen. Latency is also too
high for a clean live demo: the verified run took about 94s for 10 turns, with CU p50 around 5.1s.

Do not solve this by opening a second browser UI or by stopping at victory. The worker should keep
testing after victory because bugs can appear after win screens.
