# Playtest Node — Research Record (July 2026)

Why the architecture is what it is. Six web-research agents across two rounds (frameworks/sandboxes/
streaming, then cost/alternatives), all claims source-checked July 4, 2026. Kept so nobody re-litigates
these on hackathon day — and as pitch material.

## Round 1 — "Isn't there a better framework?" → No.

**Sandbox platforms (E2B, Browserbase, Steel, Kernel, Hyperbrowser, Daytona, Modal):**
per-action latency lives in the model call (~1–3s), not the browser — a hosted sandbox adds WAN
round-trips, cannot load `file://` games (tunneling = a new on-stage failure mode), and renders
WebGL on GPU-less VMs (software rasterizer). They bill browser-hours ON TOP of tokens. Local
Playwright is Google's own documented reference setup for Gemini CU. Scrapybara shut down Oct 2025.
The one real use case — massive parallel playtests at fleet scale — is a pitch line, not a
hackathon need.

**Agent frameworks (Stagehand, browser-use, Magnitude, Playwright MCP, Chrome DevTools MCP,
Skyvern):** "UI components as tools" is structurally impossible on a WebGL canvas — every
component-discovery mechanism reads DOM/a11y semantics the canvas doesn't emit (tracked:
playwright-mcp #1148, chrome-devtools-mcp #403). Vision fallbacks run the same
screenshot→model→coordinate loop plus an extra protocol hop. Stagehand's CUA mode is a black box
(no per-step hooks ⇒ no live events feed — our core requirement). Magnitude: no Gemini support,
project pivoted. browser-use: Python, DOM-first. Verdict: hand-roll ~150 lines we fully own,
porting loop mechanics from `google-gemini/computer-use-preview` and `browserbase/gemini-browser`.

**"Agent browses the game's code": rejected on principle.** The fun verdict is credible *because*
the agent has zero privileged access — reading source is instrumentation, the exact thing the pitch
disavows.

**Gemini Live API (streaming): not viable for control.** Video input capped at 1 FPS; audio+video
sessions ≈ 2 min; function calling blocking/sequential on the current live model; zero precedent of
game *control* (Google's own Live gaming demos watch and commentate only).

**Real-time-game literature:** VideoGameBench — best frontier model completed 0.48% of real-time
games vs 1.6% when the game pauses during thinking; 3–5s stale actions are the killer. Every
working system pauses, batches, or uses macro-actions (Gemini/Claude Plays Pokémon: `press_buttons`
batching, macro tools, ~3 actions/min on a game that waits). DeepMind's SIMA 2 plays real 3D games
by NOT mapping pixels→actions per turn (two-tier: reflex + Gemini strategist).

## Round 2 — "Is it too expensive?" → No; it's the cheapest AI node in Mantra.

**Pricing (verified, official pricing page):** `gemini-3.5-flash` $1.50/M input, $9.00/M output
(thinking bills as output), cached input $0.15/M (90% off, implicit caching automatic on
Interactions threads, 4,096-token minimum). CU has no surcharge. Screenshots on Gemini 3.x bill a
FLAT per-image budget set by the `resolution` field: low=280 / medium=560 / high(default)=1120 /
ultra_high=2240 tokens — client-side pixel downscaling and JPEG-vs-PNG change nothing.

**Measured scenarios (30-turn session):** naive defaults ≈ $1.05 · threaded + implicit caching ≈
$0.22 · efficiency mode (medium res + low thinking + caching) ≈ $0.13–0.25. A 40-session dev day:
$5–9. **Perspective: one 8s Veo creative = $0.40–3.20 (Veo 3.1 tiers), ×4–5 per pipeline run ⇒
creatives outcost the playtest 12–60×.**

**Efficiency levers adopted:** `thinking_level: 'low'` (from default `medium` — cost AND latency),
`resolution: 'medium'` on screenshot parts (A/B `low` once; official guidance points UP for CU
grounding, and one forum report shows degradation at low res — big game buttons mitigate), keep
`previous_interaction_id` + byte-identical prefix (caching), log `interaction.usage` per turn.
Rejected: client-managed history pruning (Google's reference keeps last 3 screenshots — real
effort, small marginal win vs caching at our session length), `service_tier: 'flex'` (50% off,
best-effort latency — only for overnight batch runs), screenshot-skipping/diffs (unsupported,
blind actions).

**Cheaper architectures assessed:**
- **Self-hosted on the MacBook (UI-TARS, Qwen3-VL, Holo3.1):** $0/run but 8–15s per action on
  Apple Silicon (slower than Gemini), quantized coordinate output documented-broken (UI-TARS GGUF/
  MLX; llama.cpp Qwen3-VL coords), no game track record for the open weights. Rejected for the day.
- **Agent-writes-a-bot (Voyager-style):** no prior art for browser/canvas games; a generated script
  optimizes winning without *experiencing* the game — undermines the product claim. Rejected.
- **Random inputs + passive frame judge (<$0.03/run):** two 2025–26 studies show passive VLM
  fun-judging at/below majority baseline with a "spectacle = engagement" bias. Weakest credibility.
  Rejected.
- **Two-tier hybrid (reflex + strategist, <$0.05/run):** the industry-converged real-time pattern
  (SIMA 2, Cradle, DPT-Agent; a practitioner bot reports ~120× cost reduction vs per-action VLM
  calls). **Kept as the M5-gated contingency** — see contingency-two-tier-hybrid.md.

**Rate limits:** key is Tier 3 — non-issue. (Free tier would have been ~10 RPM with unconfirmed CU
access.)

## Pitch ammo

- "Every AI that plays games today hunts bugs; none answers *'is this fun?'*" — competitive scan:
  ManaMind ($1.5M pre-seed, QA-framed, no API), GameDriver (managed QA), modl.ai (retreated to
  modl:test), Regression Games (dead).
- No published Gemini-CU-on-canvas/WebGL precedent — this demo is a first.
- VideoGameBench <1% real-time completion ⇒ "real-time play is a frontier problem; hold-latch and
  batching are the engineering that makes it work."
- Honest cost line for the dashboard: real $/playtest from `usage` metadata (~$0.20).
- If the hybrid contingency fires: "same architecture as DeepMind's SIMA 2" — a feature, not a
  compromise.

## Key sources

Pricing/docs: ai.google.dev/gemini-api/docs/{pricing, computer-use, interactions, media-resolution,
caching, live-api/capabilities} · google-gemini/computer-use-preview · Gemini 3.5 Flash CU
announcement (blog.google, 2026-06-24) · VideoGameBench (vgbench.com, arXiv 2505.18134) · SIMA 2
(deepmind.google blog) · Gemini Plays Pokémon case study (dbreunig.com) · Browserbase eval blog ·
Firebase Live API limits · ManaMind (Forbes 2025-11-17).
