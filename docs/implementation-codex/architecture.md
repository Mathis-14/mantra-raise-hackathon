# Playtest Node — Architecture

All code lives in `src/nodes/playtest/`. Only `index.ts`'s `runPlaytest` is consumed by others —
internals are private. Each file stays under ~200 lines (AGENTS.md monolith tripwire: ~300).

## Verified API ground truth (do not re-derive from memory — checked July 2026)

Docs: https://ai.google.dev/gemini-api/docs/computer-use · https://ai.google.dev/api/interactions-api
SDK: installed `@google/genai` v1.52.0 supports everything below. Reference implementations to crib
loop mechanics from: `google-gemini/computer-use-preview` (official, Python) and
`browserbase/gemini-browser` (TS, archived → `browserbase/gtm-demos`).

- Create a turn: `ai.interactions.create({ model, input, tools, previous_interaction_id?, generation_config? })`.
  Session state is server-side via `previous_interaction_id` (requires default `store: true`).
- Tool declaration: `tools: [{ type: 'computer_use', environment: 'browser' }]`
  (optional `excludedPredefinedFunctions: string[]`).
- Response: `interaction.steps[]`; function calls are steps with
  `{ type: 'function_call', name, id, arguments }` where `arguments` includes an `intent` string
  (use it as the live event caption). No function-call steps ⇒ the model is done; its text is the
  self-verdict.
- Reply next turn with one result **per executed call**, `call_id` matching:

```jsonc
{
  "type": "function_result",
  "name": "click",
  "call_id": "<function_call.id>",
  "result": [
    { "type": "text", "text": "{\"url\": \"...\"}" },
    { "type": "image", "data": "<base64>", "mime_type": "image/jpeg", "resolution": "medium" }
  ]
}
```

- **Coordinates are normalized 0–999** in both directions. Denormalize:
  `px = Math.floor((v / 1000) * viewportDim)`. Recommended viewport **1440×900**.
- Action set (3.5-flash, browser env): `click`, `double_click`, `triple_click`, `right_click`,
  `mouse_down`, `mouse_up`, `move`, `type`, `drag_and_drop`, `wait`, `press_key`, `key_down`,
  `key_up`, `hotkey`, `scroll`, `navigate`, `go_back`, `go_forward`, `take_screenshot`.
  Legacy aliases (2.5 CU model): `click_at`, `hover_at`, `type_text_at`, `scroll_document`,
  `scroll_at`, `key_combination`, `wait_5_seconds`, `drag_and_drop` (different arg names:
  `x/y/destination_x/destination_y`). The executor accepts both vocabularies.
- `safety_decision: { decision: 'require_confirmation' }` on a call ⇒ acknowledge by adding
  `"safety_acknowledgement": true` to the text part of the function_result (it plays our own local
  game — auto-acknowledge, log an `observation` event).
- Efficiency config: `generation_config: { thinking_level: 'low' }` (default `medium`; thinking
  bills as output and adds latency). Screenshot parts take `resolution: 'low' | 'medium' | 'high'`
  (280/560/1120 tokens per image on Gemini 3.x — flat, pixel downscaling saves nothing).
- Observability: every response has `interaction.usage`
  (`total_input_tokens`, `total_cached_tokens`, `total_output_tokens`, `total_thought_tokens`, …).
  Cost formula (3.5-flash, standard tier):
  `(in − cached)·1.50/1e6 + cached·0.15/1e6 + out·9.00/1e6`.

## File layout

```
index.ts    — runPlaytest(): setup → CU loop → report; the only exported surface
config.ts   — constants (below) + model IDs
gemini.ts   — GoogleGenAI client from serverEnv().GEMINI_API_KEY; cuStep() wrapping
              interactions.create (threading, 60s time-box, 1 retry); report-model call helper
actions.ts  — Zod discriminated union over supported actions (names + coordinate bounds 0-999) —
              CU output is LLM output: parse BEFORE it touches Playwright; unknown action ⇒ logged
              skip + text function_result. Denormalization, slow-drag, hold-latch state machine,
              legacy aliases, auto safety-acknowledge
browser.ts  — chromium launch (headed default, headless flag), 1440×900 viewport,
              recordVideo → playtest-artifacts/{runId}/, capture() → JPEG buffer, goto (15s timeout)
screens.ts  — frame sink: write to playtest-artifacts/{runId}/turn-NNN.jpg + DETACHED upload to
              Supabase Storage bucket `playtest-media` at {runId}/{turn}.jpg (5s box; on success
              emit the screenshot event from the promise; on failure log only). Never awaited by
              the loop
report.ts   — transcript + keyframes (first/last + 2 middle) → structured-output call →
              Zod parse (mirrors PlaytestReport minus run_id; fun_score 0-10) → 2 attempts → throw
prompts.ts  — player persona (French UI, "JOUER" to start, hold-to-fire mechanic, win/lose
              overlays, "explore, judge fun, may restart once, then wrap up"), nudge prompt,
              report prompt
dev.ts      — dev harness CLI (see below)
```

Constants (`config.ts`): `CU_MODEL_PRIMARY='gemini-3.5-flash'`,
`CU_MODEL_FALLBACK='gemini-2.5-computer-use-preview-10-2025'`, `REPORT_MODEL='gemini-2.5-flash'`,
`VIEWPORT={width:1440,height:900}`, `MAX_TURNS=40`, `REPORT_GRACE_S=30`,
`CU_STEP_TIMEOUT_MS=60_000`, `SLOW_DRAG_MS=1500`, `NUDGE_AFTER_REPEATS=5`,
`MIN_TURNS_FOR_REPORT=3`, `JPEG_QUALITY=70`.

## The CU loop (index.ts)

```
playDeadline = start + (timeBudgetS − REPORT_GRACE_S)·1000        // ms everywhere
emitEvent(action, "playtest_started")
page = open(gameUrl)                          // failure ⇒ throw (orchestrator: failed/playtesting)
shot = capture(); sink(turn 0)
interaction = cuStep(task prompt + shot)
while now < playDeadline && turns < MAX_TURNS:
    calls = interaction.steps.filter(function_call)
    if none → model done; keep final text as self-verdict; break
    for each call (usually exactly 1):        // N calls ⇒ N function_results, call_ids matching
        parse args through the action schema  // Zod; unknown ⇒ skip + text result
        emitEvent(action, message = args.intent ?? name, data = {name, args})
        execute via actions.ts; transcript.push(turn, name, intent)
    shot = capture(); sink()                  // detached — never blocks the loop
    if same action ≥ NUDGE_AFTER_REPEATS → inject one nudge text (once per session)
    if now ≥ playDeadline → break             // re-check BEFORE spending up to 2×60s below
    interaction = cuStep(function_results, previous_interaction_id)
        // transient error ⇒ 1 retry (deadline permitting); 2nd failure ⇒ break, partial=true
    log usage from interaction.usage into event data (cost observability)
emitEvent(observation, "session_ended: " + reason)    // budget|max_turns|model_done|cu_error
finally: close browser (recordVideo flushes)
report = buildReport(transcript, keyframes)   // own time-box: 60s ×2 attempts; worst case the node
                                              // runs ~2min past timeBudgetS — documented for Tom
emitEvent(observation, report.headline)
return report
```

Termination is deliberately minimal (the game is animated — screenshot-diff "stuck" detection would
misfire): hard play deadline + turn cap + model self-termination + one nudge on action-loops.
Win/lose overlays are plainly visible to the model; the prompt allows one restart after game over.

## Hold-and-drag execution (the game's core input)

The game (`game/mob-control-clone.html`) fires only while the pointer is held; drag steers. CU is
turn-based with 1–3s model latency. Strategy, reliability-first:

1. **Slow-drag (baseline, M1)**: `drag_and_drop` executes as `mouse.down` → stepped `mouse.move`
   over `SLOW_DRAG_MS` → `mouse.up`. Every action buys real fire time. Works on any model.
2. **Hold-latch (experiment #1, M4)**: on model `mouse_down`, press and do NOT release — the
   pointer stays held between turns, so the game keeps firing while the model thinks; the model
   steers with `move`, releases with `mouse_up`. CRITICAL: `actions.ts` owns explicit latch state
   and releases/reacquires around every non-`move`/`mouse_up` action — the game's global
   `pointerup` listener would otherwise silently desync it.
3. **Action batching (experiment #2, M4)**: system-prompt line — "when the next actions are
   unambiguous (menus, dialogs), emit multiple actions in one turn". Parallel calls are native;
   answer each with its own function_result.
4. **`steer_to(x, duration_ms)` macro (experiment #3, M4)**: custom function alongside CU actions.
   Most surface, tried last.

M4 adopts whatever proves rock-solid; the rest stays behind flags.

## Failure containment

- Time-boxes: `interactions.create` 60s, `page.goto` 15s, Playwright `actionTimeout` 5s, storage
  upload 5s (detached), report call 60s ×2.
- CU flake mid-session: ≥ `MIN_TURNS_FOR_REPORT` turns played ⇒ produce an honest report from the
  partial transcript (interruption recorded in session_summary/bugs); fewer ⇒ throw → orchestrator
  sets `failed` + `failed_step='playtesting'` and keeps looping.
- Report fails both attempts ⇒ throw. **Never fabricate a fun_score.**
- `emitEvent` is best-effort by design — liveness may degrade, never kills a session.

## Dev harness (`dev.ts`)

`npx tsx --env-file=.env src/nodes/playtest/dev.ts --game local-games/<file>.html --budget 180`

- Creates a throwaway project (name prefixed `dev:`) + run via `supabaseAdmin()`.
- **Inserts the run directly at status `playtesting`** (an insert, not a transition) so Tom's
  orchestrator — which claims `created` runs — never double-executes it. Coordinate one line with
  Tom: his loop skips `dev:` projects. Never press Approve on a dev run in the dashboard.
- Calls `runPlaytest`, prints the report, exits. Dashboard shows dev runs live for free.

## Supabase Storage (M2 — shared-file change, announce)

Append to `supabase/schema.sql`:

```sql
insert into storage.buckets (id, name, public)
values ('playtest-media', 'playtest-media', true)
on conflict (id) do nothing;
```

Public bucket ⇒ anon read via public URL; writes via service role only (worker). Upload path
`{runId}/{turn}.jpg`; the event's `screenshot_url` is the public URL string — events never carry
image bytes (Supabase realtime payload limits).

## Report generation (`report.ts`)

Input: session transcript (turn, action, intent, observations, termination reason) + 4 keyframes.
Model: `REPORT_MODEL` with JSON response schema. Zod schema mirrors `PlaytestReport` minus `run_id`
(injected by us): `playable: boolean`, `fun_score: number 0–10`, `fun_rationale`,
`friction_points: string[]`, `bugs: string[]`, `session_summary`, `headline`. Parse failure feeds
the error into attempt 2; second failure throws.
