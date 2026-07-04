# Usage

```ts
import {
  generateTags,
  serializeTagDataset,
  TagGenerationError,
} from "@/lib/tag-generation";

const dataset = await generateTags({
  source: "recordings/session.webm",        // local file path
  appContext: "hypercasual mobile game",    // optional hint — works without it
  // model: "gemini-2.5-flash",             // default
  // timeoutMs: 180_000,                    // hard budget, default 3 min
});

console.log(serializeTagDataset(dataset));  // stable pretty JSON
```

Requires `GEMINI_API_KEY` in `.env` (read via `geminiEnv()` — never
`process.env` directly). Server/worker only; never call this from the browser.

## Output shape

```jsonc
{
  "sourceRef": "recordings/session.webm",
  "appContext": "hypercasual mobile game",
  "durationSeconds": 42,
  "generatedAt": "2026-07-04T12:00:00.000Z",
  "segments": [
    {
      "start": 0,                // seconds
      "end": 6,
      "durationSeconds": 6,
      "contentType": "gameplay-gate-multiplier",   // free-form, domain language
      "summary": "A crowd of units passes a x3 gate and swells rapidly.",
      "emotions": ["satisfying", "surprise"],       // fixed enum
      "visual": ["fast-paced", "high-contrast"],    // fixed enum
      "adRoles": ["hook-candidate", "good-for-opener"], // fixed enum
      "confidence": 0.9
    }
  ]
}
```

Segments are sorted by `start` and each is validated by `tagDatasetSchema`
(including `end > start`) before you ever see them. The model is asked for
contiguous, non-overlapping coverage, but the library does not enforce it —
don't assume a gap-free timeline downstream. Tag lists are additive and may be
empty.

## Error handling

Everything throws `TagGenerationError` with a `stage` telling you where it died:

| stage           | meaning                                              |
| --------------- | ---------------------------------------------------- |
| `resolve-input` | file missing/unreadable or unsupported extension     |
| `upload`        | Files API upload/processing failed or timed out      |
| `generate`      | Gemini call failed, empty response, or hit timeout   |
| `validate`      | model output failed JSON parse or schema validation  |

The call never hangs past `timeoutMs`; time-box is enforced with `AbortSignal`.

## Verifying end-to-end

Throwaway script (do not commit):

```ts
// scratch/verify-tags.ts — run: node --env-file=.env --import tsx scratch/verify-tags.ts
import { generateTags, serializeTagDataset } from "@/lib/tag-generation";

const dataset = await generateTags({ source: process.argv[2] ?? "sample.webm" });
console.log(serializeTagDataset(dataset));
```

Sane output = segments cover the clip start-to-end, timecodes increase,
tags plausible for what's on screen. Supported extensions: mp4, mpeg, mpg,
mov, avi, flv, webm, wmv, 3gp, 3gpp.
