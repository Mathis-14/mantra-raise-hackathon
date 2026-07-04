# Mantra

An autonomous agent that **plays your prototype game like a real player** — through the screen, via Gemini Computer Use — tells you if it's fun before you spend a euro on ads, then closes the loop: variants → Veo creatives → deploy → metrics → keep/kill → what to build next.

Built at the RAISE hackathon (Google DeepMind track). Read **[AGENTS.md](AGENTS.md)** before touching anything — it's the single source of truth (architecture, ownership map, rules).

## Setup

```bash
npm install
npx playwright install chromium        # playtest node only
cp .env.example .env                   # fill keys — ask Mathis
```

Apply `supabase/schema.sql` in the shared Supabase project's SQL editor (once).

## Run

```bash
npm run dev        # dashboard → http://localhost:3000
npm run worker     # orchestrator + pipeline nodes (separate terminal)
```

## Repo map

| Path | What |
|---|---|
| `game/` | Input game (Mob Control clone) — protected, see AGENTS.md |
| `src/contracts/types.ts` | Canonical shared types + pipeline state machine |
| `src/nodes/` | Pipeline nodes: playtest (Computer Use), variants, creatives (Veo), ads, decide |
| `src/orchestrator/` + `src/worker/` | State-machine loop, runs locally |
| `src/app/` | Dashboard + thin API routes |
| `docs/DEMO.md` | Demo script + pre-record checklist |

**Honesty line:** playtest, variants, and video generation are real; ads deploy is stubbed and metrics are seeded (a live campaign needs ~48h of learning phase). Exactly one simulated thing, deliberately.
