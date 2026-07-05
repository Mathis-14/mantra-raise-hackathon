# Verification And Repro

## Verifiers Already Run

```bash
npm run typecheck
npm --prefix frontend run build
npm run lint
npm run build
```

Results:

- `npm run typecheck`: passed.
- `npm --prefix frontend run build`: passed.
- `npm run lint`: passed with 11 existing warnings in JS asset/game files.
- `npm run build`: passed outside the sandbox. In the sandbox, Turbopack fails because it cannot bind
  a local port; this is an environment issue, not a code issue.

## Live Run Evidence

Fresh local live run:

```text
run_id: 43670223-9081-4b3c-97ba-f3cc56ad8396
project_id: 0622e657-198e-4420-9d1c-55c47eeee4ad
status: awaiting_approval
turns: 10
headline: Functional but generic Mob Control clone with basic mechanics and no unique hooks.
```

Observed events:

- `playtesting_started`
- `playtest_started`
- frames `0..10`
- multiple `action` events
- `post_win_sweep_started`
- `session_ended: budget`
- validated playtest report
- `playtest_timing_summary`
- `playtest_complete_awaiting_approval`

SSE stream check returned a real `frame` event for the same run:

```bash
curl -sS -N --max-time 5 \
  http://127.0.0.1:4317/runs/43670223-9081-4b3c-97ba-f3cc56ad8396/stream
```

PNA preflight check passed:

```bash
curl -sS -i -X OPTIONS \
  -H 'Origin: https://mantra-demo.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Private-Network: true' \
  http://127.0.0.1:4317/runs/43670223-9081-4b3c-97ba-f3cc56ad8396/stream
```

Important response headers:

```text
HTTP/1.1 204 No Content
access-control-allow-origin: https://mantra-demo.vercel.app
access-control-allow-methods: GET, OPTIONS
access-control-allow-private-network: true
```

## Repro Steps

Start services:

```bash
npm run dev
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5175
npm run worker
```

Expected endpoints:

- Next: `http://localhost:3000`
- Vite: `http://127.0.0.1:5175/` or the next free Vite port
- Worker stream health: `http://127.0.0.1:4317/health`

Then:

1. Open the Vite UI.
2. Upload an HTML game.
3. Watch the `Situation 1` phone.
4. Confirm whether the phone receives continuously changing live frames.
5. Confirm whether the game content is correctly framed inside the phone.
6. Confirm whether cursor/click overlay matches the visible target.

## What Still Needs Visual Verification

The backend and stream endpoint were verified. The visible phone display still needs a browser-level
visual test:

- open Vite route during an active run;
- capture screenshot/video of the carousel;
- inspect whether `Situation 1` is truly live;
- inspect whether the frame is adapted to phone dimensions;
- inspect cursor alignment.

This is the core issue to fix next.
