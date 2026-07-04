# Tag model

Each segment carries three fixed-enum tag families plus two free-form fields.
Tags are **additive**: apply every tag that fits; an empty list is a valid
answer, not a failure.

## Why hybrid (fixed enums + free-form)

Downstream consumers (creative cutting, filtering, analytics) need a **closed
vocabulary** they can query reliably — `WHERE 'hook-candidate' IN adRoles` only
works if the model can't invent synonyms. But footage domains vary wildly
(fintech, SaaS, e-commerce, games), so the *content* of a segment stays
free-form. The split: **fixed families describe ad-making concerns** (which
generalize), **free-form fields describe the domain** (which doesn't).

## Families

### `emotions[]` — what a first-time viewer feels
`satisfying · surprise · relief · aspiration · curiosity · tension · reward · frustration`

Chosen for ad relevance: hooks trade on surprise/curiosity, payoffs on
satisfying/reward/relief, CTAs on aspiration. `frustration` marks segments to
avoid (or use deliberately in problem-agitation openers).

### `visual[]` — how the frame looks and moves
`fast-paced · slow · buildup · close-up · wide-shot · ui-heavy · clean-frame · text-space · high-contrast`

Editing-mechanics tags: `text-space`/`clean-frame` tell you where overlays and
CTAs fit; pacing tags drive cut rhythm; `ui-heavy` warns a segment won't read
at feed resolution.

### `adRoles[]` — where the segment fits in an ad
`hook-candidate · good-for-opener · good-for-cta · good-for-loop · b-roll · skippable`

The directly actionable family: a cutting tool can assemble
hook → body → CTA from these alone. `good-for-loop` = end state visually
matches start state. `skippable` is a positive signal too — it tells you what
to cut.

### Free-form
- `contentType` — short label in the app's own domain language
  ("gameplay-level-clear", "checkout-flow", "dashboard-overview").
- `summary` — 1–2 sentences of what happens.

## Rules

- **Never add domain-specific values to the enums** — that breaks
  domain-agnosticism. Domain expression belongs in `contentType`.
- Changing an enum is a breaking change for every stored dataset and
  downstream filter — treat it like a contract change (announce, migrate).
- `confidence` (0–1) is per-segment, covering the tags as a whole.
