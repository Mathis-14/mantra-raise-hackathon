# tag-generation — Agent Guide

Domain-agnostic video tagging library. Takes a **local video file**, analyzes it
with Gemini video understanding, and returns a validated, time-coded dataset of
tagged segments. Same spirit as the root `AGENTS.md`: normative and living —
update it in the same change as the code.

## Public surface

One entry point, in `index.ts`:

```ts
generateTags(input: TagGenerationInput): Promise<TagDataset>
// input: { source: string /* local path */, appContext?, model?, timeoutMs? }

serializeTagDataset(dataset: TagDataset): string  // stable pretty JSON
```

Plus the exported schemas/types from `src/schema.ts` (`tagDatasetSchema`,
`taggedSegmentSchema`, tag enums, `TagGenerationError`). Consumers depend on
this surface only — internals under `src/` are private.

Layout: `index.ts` (public API) · `src/` (implementation: `schema.ts`,
`gemini.ts`) · `tests/` · `docs/`.

## Scope boundary

- **In:** local video file → Gemini analysis → `TagDataset` in memory + JSON
  serialization helper. That's all.
- **Out (do not add here):** ad generation, Supabase/DB writes, dashboard/API/
  orchestrator wiring, URL/YouTube ingestion (removed by design — see D3).
  Consumers do their own persistence and composition.
- Types here are module-local on purpose. If a shape needs to be shared across
  nodes, that's a `src/contracts/types.ts` conversation — announce to the team,
  don't fork or silently promote.

## Tag model

Per segment, tags are **additive** (apply every one that fits; empty is valid):

- **Fixed Zod enums** — reliable downstream filtering:
  - `emotions[]`: satisfying, surprise, relief, aspiration, curiosity, tension, reward, frustration
  - `visual[]`: fast-paced, slow, buildup, close-up, wide-shot, ui-heavy, clean-frame, text-space, high-contrast
  - `adRoles[]`: hook-candidate, good-for-opener, good-for-cta, good-for-loop, b-roll, skippable
- **Free-form** — `contentType` (short domain label) and `summary`.

Why this is domain-agnostic: the fixed families describe *ad-making* concerns
(viewer emotion, frame properties, editing role), which apply to any footage —
fintech, SaaS, e-commerce, games. Domain-specific vocabulary lives only in the
free-form `contentType`. **Never add app-specific values to the enums.**
`appContext` is an optional hint; the library must keep working without it.

## Gemini notes

- Default model: **`gemini-2.5-flash`** (`DEFAULT_MODEL`), overridable per call.
- Sampling is ~1 fps by default — **sub-second cuts and rapid motion can be
  missed**; don't promise frame-accurate boundaries downstream.
- Inline upload ≤ 15MB; larger files go through the Files API with polling
  until `ACTIVE`, all inside the caller's `timeoutMs` budget.
- Structured output via `responseJsonSchema` generated from `modelOutputSchema`
  (`z.toJSONSchema`). The model-facing schema is regex-free because structured
  output `pattern` support isn't guaranteed; `parseTimecode` enforces format.
- Model output is a draft until `modelOutputSchema.parse` passes; the final
  dataset is re-validated by `tagDatasetSchema` before returning.
- **Read the docs, don't trust memory — this API surface is new:**
  https://ai.google.dev/gemini-api/docs/video-understanding
  (`https://ai.google.dev/gemini-api/docs/video` is video *generation*.)
- All failures throw `TagGenerationError` with a `stage`
  (`resolve-input | upload | generate | validate`); raw SDK errors never escape.

## Run / verify locally

```bash
npx tsx --test src/lib/tag-generation/tests/*.test.ts   # unit tests (pure layer)
npm run typecheck
```

End-to-end (needs `GEMINI_API_KEY` in `.env`): write a throwaway tsx script
that calls `generateTags({ source: "<clip>.mp4" })` and prints
`serializeTagDataset(...)` — see `docs/usage.md`. Don't commit the script. A
sample clip can be recorded from `game/mob-control-clone.html` with Playwright
(`recordVideo` → `.webm`); never modify `game/` or `references/` themselves.

## Decision log

- **T1** — 2026-07-04 — Fixed enums for emotions/visual/adRoles + free-form
  `contentType`. Why: downstream filtering needs a closed vocabulary; domain
  flexibility lives in the free-form field.
- **T2** — 2026-07-04 — Model emits `MM:SS` strings; code converts to seconds.
  Why: Gemini docs recommend MM:SS for video positions; numeric seconds straight
  from the model proved less reliable than post-parsing.
- **T3** — 2026-07-04 — Local files only (URL/YouTube ingestion built, then
  removed on request). Why: pipeline inputs are local recordings; less surface,
  fewer failure modes.
- **T4** — 2026-07-04 — Tests use `node:test` + tsx, no test framework. Why:
  zero new dependencies (hackathon rule); the pure layer needs nothing more.
- **T5** — 2026-07-04 — Regex-free model-facing JSON schema, strict parse after.
  Why: Gemini structured-output support for `pattern` is undocumented; failing
  the whole call on schema rejection is worse than validating post-hoc.
- **T6** — 2026-07-04 — Grouped layout: `index.ts` at the root, implementation
  in `src/`, tests in `tests/`, docs in `docs/`. Why: team preference — the
  public surface is the only file at the top level.
