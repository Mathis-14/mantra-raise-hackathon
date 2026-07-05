# ad-scenarios — usage

Toolkit to turn a market **trend** + **inspiration** into a rejouable Mob Rush
variant and a vertical 9:16 gameplay recording. Works offline (deterministic
templates) and gets richer briefs when `GEMINI_API_KEY` is set.

## Agent workflow

```bash
# 1. Inspect what you can compose (skins, loadouts, hazards, ranges, ad angles)
npm run variant -- list

# 2. Drop references into references/ads-inspo/ (gifs/images/videos + .md/.txt notes).
#    (read-only: the toolkit never writes there)

# 3. Compose + save a rejouable variant from a trend
npm run variant -- create --trend "ice maze fail bait" --name "ice-maze-1"
#    → writes generated-variants/<id>.json, prints the playUrl

# 4. Test the URL in a browser (game server must be up: `npm run game`)
npm run variant -- url generated-variants/<id>.json     # prints the playable URL

# 5. Record a 9:16 clip (bot plays via autoplay:true)
npm run variant -- record generated-variants/<id>.json --seconds 25
#    → writes generated-variants/<id>.webm next to the JSON
```

The game server is **never** started by the toolkit. Run `npm run game`
(vite on :5173) in another terminal first; `record` fails with a clear message
if :5173 is unreachable.

## Programmatic API

```ts
import {
  listBlocks,
  composeVariant,
  saveVariant,
  loadVariant,
  recordVariant,
  resolveVariantConfig,
  buildPlayUrl,
} from "@/lib/ad-scenarios";

const composed = await composeVariant({ trend: "fail bait", name: "trap-1" });
const { path } = await saveVariant(composed);            // generated-variants/<id>.json
const url = buildPlayUrl(composed.config, { port: 5173 }); // playable URL
const webm = await recordVariant(path, { seconds: 25 });  // <id>.webm
```

- `composeVariant` reads `references/ads-inspo`, composes an `AdScenarioSpec`
  (Gemini if a key is present, deterministic template otherwise), and resolves
  it to a game-legal `VariantConfig`. The result carries `meta.source`
  (`"gemini" | "template"`).
- `loadVariant` validates with Zod and **never falls back silently** — a
  malformed file throws `AdScenarioError`.
- `recordVariant` requires `config.autoplay === true` (set automatically by
  `resolveVariantConfig`) so the in-game bot actually plays.

## VariantConfig schema (what the game reads)

Injected as `window.__MOB_VARIANT__` or decoded from `?variant=<base64(JSON)>`.
Every field is optional; bounds mirror the game's own sanitizers exactly.
`.strict()` — unknown keys are rejected at the boundary.

| field          | type / range                                                                 |
| -------------- | ---------------------------------------------------------------------------- |
| `startLevel`   | int 1..50                                                                    |
| `loadout`      | `single` \| `double` \| `triple`                                             |
| `skin`         | `canyon` \| `dusk` \| `snow` (drives environment/cliffs/props/walls)         |
| `layout`       | `{ walls?, hazards?, lanesX?, hordeMult? }` (see below)                       |
| `overlayText`  | `string[]` — hook banner shown in game                                       |
| `autoplay`     | `boolean` — bot: continuous fire + oscillating aim (needed for recording)    |
| `wavePressure` | 0.4..2.5 — wave multiplier read by `enemy/waves.js`                          |
| `aspect`       | literal `"9:16"`                                                             |

`layout`:

| field       | type / range                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `walls`     | ≤10 × `{ x:-4..4, z:-18..14, halfW:0.4..2.6, halfD?:0.4..5, kind?:'crates'\|'mound', axis?:'x'\|'z' }` |
| `hazards`   | ≤6 × `{ type:'saw'\|'spikes'\|'spikesLarge', x:-4..4, z:-18..14 }` — never at a passage centre  |
| `lanesX`    | `number[2..4]` — enemy spawn corridor centres                                                   |
| `hordeMult` | 0.5..4                                                                                          |

The game guarantees anti-softlock (walls are bounded/shrunk). `simSeconds` is a
screenshot pre-compute concern and is intentionally **not** part of recordings.

## mechanic_focus → config mapping

`resolveVariantConfig` maps the spec's `mechanicFocus` to a hand-tuned recipe
(start level, layout, base horde/pressure), then scales pressure/horde by
`intensity` (0.5 neutral). The spec's `skin`/`loadout` win over the focus
defaults.

| focus              | start | layout                                        | wavePressure (base) | intent                          |
| ------------------ | ----- | --------------------------------------------- | ------------------- | ------------------------------- |
| `fail_bait`        | 2     | narrow trap walls + flank saws                | 1.2                 | bait a wrong turn               |
| `crowd_explosion`  | 2     | near-empty field, low horde (0.6)             | 0.8                 | crowd swells visibly            |
| `boss_crush`       | 3     | mounds + one spike, denser waves              | 1.6                 | crush-the-boss payoff           |
| `danger_comeback`  | 2     | scattered walls + hazards, high pressure      | 1.8                 | near-loss then comeback         |
| `speed_boost`      | 1     | one small wall, no hazards, light waves       | 0.7                 | fast, frictionless run          |
| `maze_navigation`  | 2     | longitudinal (axis z) walls + lanes           | 1.0                 | thread the maze                 |
| `close_call`       | 2     | flank hazards, moderate pressure              | 1.4                 | repeated close-call dodges      |

## Errors

Everything throws `AdScenarioError` with a `stage`
(`compose | resolve | persist | record`); raw SDK/Playwright errors never
escape. Recording is globally time-boxed at `seconds + 30s`.
