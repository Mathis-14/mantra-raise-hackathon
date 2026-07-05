# ad-scenarios — Agent Guide

Toolkit that turns a trend + inspiration into a rejouable **Mob Rush** variant
and records a vertical 9:16 gameplay clip. Same spirit as the root `AGENTS.md`:
normative and living — update it in the same change as the code.

## Public surface

One entry point, in `index.ts`. Key exports:

```ts
listBlocks(): BlockCatalog                              // what an agent can compose
composeVariant(opts): Promise<ComposedVariant>          // trend + inspiration → { scenario, config, meta }
saveVariant(v, dir?): Promise<{ path, saved }>          // rejouable JSON in generated-variants/
loadVariant(path): Promise<SavedVariant>                // Zod-validated, never a silent fallback
recordVariant(path, opts?): Promise<string>             // Playwright 9:16 .webm

resolveVariantConfig(spec): VariantConfig               // AdScenarioSpec → game-legal config
buildPlayUrl(config, opts?): string                     // http://host:port/?variant=<b64>
buildVariantHtml(gameHtml, config): string              // inject into a COPY of the game HTML
composeScenario(opts): Promise<ComposeResult>           // Gemini or template
```

Plus the schemas/types from `src/schema.ts`. Consumers depend on this surface
only — internals under `src/` are private.

Layout: `index.ts` (public API) · `src/` (`schema.ts`, `vocabulary.ts`,
`mutation.ts`, `inspiration.ts`, `compose.ts`, `templates.ts`, `toolkit.ts`) ·
`cli.ts` (executable) · `tests/` · `docs/`.

## Scope boundary

- **In:** compose an `AdScenarioSpec` from a trend + `references/ads-inspo`;
  resolve it to a `VariantConfig` the game consumes; persist rejouable variants;
  record 9:16 clips against an already-running game server.
- **Out:** starting the game/dev servers, Supabase/DB writes, dashboard/API
  wiring, Veo creative generation. Consumers do their own persistence to the DB.

## Game contract (source of truth: `game`/`src/*.js`, PROTECTED — never edit)

The game reads `window.__MOB_VARIANT__` or `?variant=<base64(JSON)>` at boot and
sanitizes everything. `variantConfigSchema` bounds MUST stay identical to:
`src/levels/layouts.js` (`setLayoutOverride`), `src/core/app.js`
(`readVariantConfig`), `src/enemy/waves.js` (`wavePressure`). If the game's
clamps change, update the schema in the same breath.

- Recording needs `config.autoplay === true` (the in-game bot) — `record` errors
  otherwise. `resolveVariantConfig` always sets it.
- `simSeconds` is a screenshot pre-compute knob, **not** part of recordings.

## Compose / record notes

- `composeScenario` uses Gemini (`gemini-2.5-flash`, structured output via
  `z.toJSONSchema`) when `GEMINI_API_KEY` is set, else a deterministic template.
  A failing/absent Gemini call degrades to a template — composition never blocks
  the toolkit. Model output is a draft until `adScenarioSpecSchema` passes.
- `recordVariant` uses headless chromium, viewport 405×720 (9:16), context
  `recordVideo`, polls page liveness, then renames the `.webm` next to the JSON.
  It **never** starts the game server; clear error if :5173 is unreachable
  (`npm run game` first). Globally time-boxed at `seconds + 30s`.
- All failures throw `AdScenarioError` with a `stage`
  (`compose | resolve | persist | record`); raw SDK/Playwright errors never
  escape. No secret is ever logged.

## Run / verify locally

```bash
npx tsx --test src/lib/ad-scenarios/tests/*.test.ts   # pure layer (no network/Playwright)
npm run typecheck
npm run variant -- list
npm run variant -- create --trend "fail bait"         # needs no key (template fallback)
npm run game                                          # separate terminal, :5173
npm run variant -- record generated-variants/<id>.json --seconds 8
```

## Decision log

- **A1** — 2026-07-05 — `VariantConfig` mirrors the shipped game contract
  (skin/layout/wavePressure/…); obsolete keys (gatePreset, boostZones, …) do not
  exist. Why: the game is the source of truth and sanitizes on its clamps.
- **A2** — 2026-07-05 — `AdScenarioSpec` (domain-agnostic creative brief) is the
  LLM/template surface; `resolveVariantConfig` is the only translator to a
  game-legal config, re-validated with Zod. Why: keep the model away from raw
  game internals; one audited mapping.
- **A3** — 2026-07-05 — Template fallback when no `GEMINI_API_KEY`; Gemini
  failure degrades to a template. Why: the toolkit must work offline and on a
  flaky network (hackathon rule).
- **A4** — 2026-07-05 — Recording drives an externally-run server, never starts
  it; output under gitignored `generated-variants/`. Why: no server lifecycle to
  own; recordings are demo proof, not repo artifacts.
