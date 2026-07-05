# Contingency — Two-Tier Hybrid (reflex + strategist)

**Status: NOT built. Written down so a pivot costs hours, not the day.** This is "the other choice"
Mathis weighed against the pure CU loop; it lost on demo-narrative grounds (Computer Use is the
star per AGENTS.md), not on technical merit. It is the industry-converged pattern for real-time
games — DeepMind's SIMA 2 works exactly this way (Gemini "no longer maps pixels directly to
actions"), which makes it a talking point rather than a compromise if we ever fire it.

## Trigger (evaluated at the M5 gate — be honest, don't fire it early)

Pivot the **gameplay layer only** if, on the real game (`game/mob-control-clone.html`), with the
M4-winning input strategy (hold-latch and/or batching):

- the agent cannot clear level 1 in ~3 attempts, **or**
- steering is incoherent (actions visibly unrelated to game state — not merely losing; losing with
  coherent play is valid signal and NOT a trigger).

If neither holds, this file stays dormant. Menus/report/liveness are unaffected either way.

## Design

```
┌────────────── every ~5s ───────────────┐
│ Gemini strategist (gemini-2.5-flash or │   sees: latest keyframe(s) + HUD state summary
│ flash-lite, plain generateContent)     │   emits: ONE intent, Zod-parsed:
└────────────────┬───────────────────────┘   { targetXNorm: 0-999, hold: boolean, note: string }
                 │ intent
┌────────────────▼───────────────────────┐
│ Reflex layer (pure TS, ~30 lines)      │   holds the pointer, eases toward targetXNorm with
│ runs at game speed inside the loop     │   small mouse.move steps every ~100ms until the next
└────────────────────────────────────────┘   intent replaces it
```

- **CU still opens the session**: navigates, clicks JOUER, handles overlays — Computer Use remains
  the demo's heart and the pitch stays true ("plays through the screen, zero privileged access";
  the reflex layer is the agent's motor system, the model still makes every decision).
- The strategist's `note` strings become `observation` events (the live feed gets richer, not poorer).
- Report generation is unchanged — same transcript + keyframes → `PlaytestReport`.
- Cost profile: <$0.05/session (~36 flash calls @ 1 keyframe each). Latency profile: the game never
  waits on the model; the pointer is always live.

## Implementation sketch (est. 2–3h)

1. `strategist.ts`: `getIntent(keyframe, hudSummary): Promise<Intent>` — plain `generateContent`,
   JSON schema + Zod, 10s time-box, on failure keep the previous intent (fail-static, not fail-stop).
2. `reflex.ts`: interval loop owning the pointer (reuses the hold-latch state machine from
   `actions.ts` — that code is required for both paths, no waste).
3. `index.ts`: mode switch `PLAYTEST_MODE: 'cu' | 'hybrid'` — CU path for menus in both modes;
   hybrid swaps the in-game turn loop for strategist+reflex. Events and report code untouched.

## Why it wasn't primary

- AGENTS.md: "Computer Use is the heart, not a feature" — the pure CU loop is the strongest,
  simplest narrative for the DeepMind judges.
- One-day focus: two gameplay architectures = split verification effort on the demo path.
- Cost was disproven as a motivation (playtest ≈ $0.20; Veo creatives are 12–60× more per run).

## Pitch line if fired

"Real-time games defeat per-action vision loops — best published completion is under 1%
(VideoGameBench). So the agent does what DeepMind's SIMA 2 does: Gemini decides, a reflex layer
executes. Computer Use drives everything up to the gameplay, and every decision on screen is still
the model's."
