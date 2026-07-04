# ad-scenarios — Agent Guide

Turns a market trend into a **playable, recordable, comparable** ad variant of
the Mob Rush game. Same spirit as the root `AGENTS.md`: normative and living —
update it in the same change as the code. Sibling pattern: `../tag-generation`.

## Public surface

One entry point, in `index.ts`:

```ts
validateScenario(raw: unknown): AdScenarioSpec        // the boundary gate
composeScenario(input): Promise<AdScenarioSpec>       // Gemini + fallback, never throws
generateVariantFromScenario(spec, baseHtml): GeneratedVariant  // deterministic
buildVariantHtml(baseHtml, config): string            // pure injection
resolveVariantConfig(spec): VariantConfig             // spec → bounded config
qualitativeChecklist(spec): { ok, failed }            // the 7 quality questions
loadInspiration(dir?): InspirationIndex               // read-only fs index
TEMPLATES / listTemplates()                           // 8 validated seeds
```

Plus schemas/types/enums and `AdScenarioError`. Consumers depend on this surface
only — internals under `src/` are private.

Layout: `index.ts` (public API) · `src/` (`schema.ts`, `vocabulary.ts`,
`mutation.ts`, `inspiration.ts`, `compose.ts`, `templates.ts`, `generator.ts`) ·
`tests/` · `docs/`.

## Scope boundary

- **In:** trend → validated `AdScenarioSpec` → bounded `VariantConfig` →
  mutated game HTML + creative prompt + recording plan + playtest checklist.
- **Out:** Supabase/DB writes, dashboard/API wiring, video generation (Veo),
  and the game engine that reads `window.__MOB_VARIANT__` (a teammate owns
  `game/app.js`). This module never touches `game/` or `references/`.
- The `AdScenarioSpec` contract lives here (module-local), like tag-generation's
  types. Promoting a shape to `src/contracts/types.ts` is a team conversation.

## Rules that matter

- **LLM output is a draft** until `validateScenario` passes. No silent fallback
  to a partial spec — `compose` falls back to a *validated* template instead.
- **Every value the game reads is bounded.** `VariantConfigSchema` is `.strict()`
  and clamps ranges anchored to real engine constants (below).
- **`buildVariantHtml` is pure** — it copies the base HTML, never edits it, and
  refuses to double-inject.
- **Time-box Gemini** (`DEFAULT_TIMEOUT_MS`, `AbortSignal`); never log the key or
  the full prompt. `compose` never throws — it returns the fallback.

## Engine constants that anchor the ranges

loadouts single(.14)/double(.19,2)/triple(.25,3); waves size=2+1.3·lvl; giant
proba .35; boss every 3 levels hp24 scale3; gates x2/x3 + chain(lvl≥2)/advanced
(lvl≥4); obstacles saw/spikes(lvl≥2); boost mult 1.75; champion charge
passive7/kill8/giant20/boss35; coins=25+5·lvl; palette bg #2B1D6B track #EDE7FF
blue #38B6FF red #FF4D6D gold #FFD54A.

## Run / verify

```bash
npx tsx --test src/lib/ad-scenarios/tests/*.test.ts   # pure layer
npm run typecheck
```

## Decision log

- **A1** — 2026-07-04 — `AdScenarioSpec` schema copied VERBATIM from
  `AD_SCENARIO_SPEC.md`; enums shared with the game vocabulary. Why: it is the
  cross-node contract.
- **A2** — 2026-07-04 — `compose` never throws; on any failure it returns a
  deterministic template fallback picked by an FNV-1a hash of the trend. Why:
  one slow/failed Gemini call must not kill a run, and fallbacks must be
  reproducible (no unseeded randomness).
- **A3** — 2026-07-04 — `window.__MOB_VARIANT__` is the game's read surface;
  keys bounded + `.strict()`. Why: a typo must fail here, not silently in-game.
