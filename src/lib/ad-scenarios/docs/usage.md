# Usage

```ts
import {
  composeScenario,
  generateVariantFromScenario,
  loadInspiration,
} from "@/lib/ad-scenarios";

// 1. Trend → validated scenario (Gemini structured output; falls back to a
//    validated template on any failure — this call never throws).
const scenario = await composeScenario({
  trend: "Fail-bait ads with impossible choices are trending",
  marketContext: "hypercasual, tier-1 UA",
  inspiration: loadInspiration(),          // read-only index of references/ads-inspo
  now: new Date().toISOString(),
});

// 2. Scenario + base game HTML → playable variant + all downstream metadata.
const gen = generateVariantFromScenario(scenario, baseGameHtml);
// gen.variant.game_html   — mutated, playable HTML (config injected)
// gen.config              — the bounded window.__MOB_VARIANT__ payload
// gen.creative_prompt     — concrete 9:16 video script
// gen.recording_plan      — camera focus, must-capture moments, overlays
// gen.playtest_checklist  — what the playtest agent should verify
// gen.human_summary       — dashboard-friendly summary
```

`composeScenario` requires `GEMINI_API_KEY` in `.env` (read via `geminiEnv()`);
without it, it silently returns the deterministic template fallback. Server/
worker only — never call from the browser.

## How to create a NEW ad scenario

1. **Pick one `mechanic_focus`** — the single mechanic the ad tests (gates,
   champion, boss, loadout, speed_boost, danger_comeback, coin_reward,
   base_destruction). One hypothesis per ad.
2. **Fill the `AdScenarioSpec` contract** (see `AD_SCENARIO_SPEC.md`): trend,
   audience, hypothesis, creative_angle, gameplay_mutation (allowed +
   forbidden), a concrete 0-3/3-12/12-20/20-25s script, recording_plan (9:16,
   ≥2 must-capture moments, short overlays), success_criteria, metadata.
   Compose the mutation from bounded vocabulary blocks (`VOCABULARY`,
   `blocksForMechanic(focus)`); prefer parametric changes over structural ones.
3. **Validate** — `validateScenario(raw)` throws `AdScenarioError('validate')`
   with a readable message if anything is missing. A draft is not a scenario.
4. **Quality-gate** — `qualitativeChecklist(spec)` must return `{ ok: true }`
   (hook readable < 3s, mutation visible, playable, payoff without sound, 9:16,
   single hypothesis, replayable).
5. **Generate** — `generateVariantFromScenario(spec, baseHtml)` produces the
   mutated HTML, config, creative prompt, recording plan and checklist.
6. **Record** — capture the variant in 9:16, hitting every must-capture moment.

## Anti-patterns (rejected by design)

- Cosmetic reskin with no visible mechanic change.
- A scenario with no clear payoff, or overlay text explaining an unreadable
  mechanic.
- Bundling multiple hypotheses into one ad.
- Deep meta systems added just for an ad.
- Editing the source game in `game/` — variants copy `game_html`.
- A non-replayable variant (config must be saveable and reproducible).

## The game read surface: `window.__MOB_VARIANT__`

`buildVariantHtml` injects `<script>window.__MOB_VARIANT__={…}</script>` before
`</head>`. The game (owned by a teammate) reads it on boot. Keys are all
optional and bounded — see `VariantConfigSchema` in `src/mutation.ts`:

| key | type / range | meaning |
| --- | --- | --- |
| `loadout` | single \| double \| triple | cannon config |
| `startLevel` | int 1..20 | level to start on |
| `forceBoss` | bool | force a boss encounter |
| `wavePressure` | 0.4..2.5 | enemy wave size/period multiplier |
| `giantProba` | 0..1 | giant spawn probability |
| `bossScale` | 1..4 | boss size multiplier |
| `bossHp` | 8..60 | boss hit points |
| `gatePreset` | default \| fail_bait \| chain_multiply \| advanced_mix | gate layout |
| `trapGateScale` | 1..2 | trap-gate size multiplier |
| `goodGateMultiplier` | x2 \| x3 | good-gate crowd multiplier |
| `obstacleSet` | none \| saw \| spikes \| mixed \| boost_lane | track hazards |
| `boostZones` | bool | enable speed boost zones (mult 1.75) |
| `coinMultiplier` | 1..5 | final coin reward multiplier |
| `confettiIntensity` | 1..4 | reward feedback intensity |
| `championChargeMult` | 1..4 | champion gauge fill speed |
| `gameSpeed` | 0.5..1.2 | global time scale |
| `mapStyle` | default \| neon_night \| sunset \| toxic | palette/fog overrides |
| `overlayText` | string[] | ordered on-screen overlays |
| `aspect` | "9:16" | always set — vertical recording |
| `autoplay` | bool | agent-driven autoplay for recording |
| `simSeconds` | int 5..120 | simulated run length for autoplay |

Unset keys mean "use the base game default". The config is validated and clamped
before injection, so the game can trust every value it reads.
