// The agent path: turn a market trend into a validated AdScenarioSpec via
// Gemini structured output, time-boxed, with a deterministic template fallback.
// Mirrors tag-generation/src/gemini.ts: DEFAULT_MODEL, DEFAULT_TIMEOUT_MS,
// AbortSignal, key via @/lib/env. LLM output is a DRAFT until validateScenario.
// Never logs the key or the full prompt.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  AdScenarioError,
  AdScenarioSpecSchema,
  validateScenario,
  type AdScenarioSpec,
} from "./schema";
import type { InspirationIndex } from "./inspiration";
import { TEMPLATES } from "./templates";
import { MECHANIC_FOCUSES } from "./schema";
import { VOCABULARY } from "./vocabulary";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface ComposeInput {
  trend: string;
  marketContext?: string | null;
  report?: unknown;
  inspiration?: InspirationIndex;
  now: string;
}

// Lazily read the Gemini key via the canonical env module if available; a
// missing key raises a 'compose' error that callers treat as fallback signal.
async function geminiKey(): Promise<string> {
  try {
    const { geminiEnv } = await import("@/lib/env");
    return geminiEnv().GEMINI_API_KEY;
  } catch (error) {
    throw new AdScenarioError("compose", "missing GEMINI key", { cause: error });
  }
}

function deadlineSignal(deadline: number): AbortSignal {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new AdScenarioError("compose", "time budget exhausted before the call started");
  }
  return AbortSignal.timeout(remaining);
}

function buildPrompt(input: ComposeInput): string {
  const inspoNote = input.inspiration?.note ?? "no inspiration provided";
  const vocab = Object.entries(VOCABULARY)
    .map(([family, blocks]) => `${family}: ${blocks.map((b) => b.key).join(", ")}`)
    .join("\n");

  return `You are an ad-creative strategist for the hypercasual game Mob Rush
(cannon -> gates -> crowd growth -> enemies -> base destruction -> reward).

Turn the market trend below into ONE AdScenarioSpec that tests a SINGLE
hypothesis with a VISIBLE gameplay mutation. Keep the core loop playable and
recordable in 9:16. Do not invent deep meta systems.

Trend: ${input.trend}
Market context: ${input.marketContext ?? "none"}
Inspiration: ${inspoNote}

Choose exactly one mechanic_focus from: ${MECHANIC_FOCUSES.join(", ")}.
Compose the gameplay mutation from these bounded blocks:
${vocab}

Return an object matching the provided schema. Overlay text must be short.
Set metadata.created_by to "agent".`;
}

/**
 * Composes a validated AdScenarioSpec via Gemini structured output, time-boxed.
 * On ANY failure (missing key, network, quota, timeout, invalid draft) it does
 * NOT throw — it returns composeScenarioFallback(input) instead.
 */
export async function composeScenario(input: ComposeInput): Promise<AdScenarioSpec> {
  try {
    const apiKey = await geminiKey();
    const ai = new GoogleGenAI({ apiKey });
    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ text: buildPrompt(input) }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(AdScenarioSpecSchema),
        abortSignal: deadlineSignal(deadline),
      },
    });

    const text = response.text;
    if (!text) throw new AdScenarioError("compose", "model returned an empty response");

    const draft: unknown = JSON.parse(text);
    // Draft → validated. Stamp created_at from the caller's clock.
    const spec = validateScenario(draft);
    return { ...spec, metadata: { ...spec.metadata, created_by: "agent", created_at: input.now } };
  } catch {
    // Never crash the pipeline on a compose failure — fall back deterministically.
    return composeScenarioFallback(input);
  }
}

// FNV-1a hash → deterministic template pick from the trend (no unseeded random).
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic fallback: pick a template by hashing the trend, then lightly
 * mutate it (title/trend/overlay reflect the incoming trend). Always returns a
 * validated spec — throws only if the seed library itself is corrupt.
 */
export function composeScenarioFallback(input: ComposeInput): AdScenarioSpec {
  const keys = Object.keys(TEMPLATES);
  if (keys.length === 0) {
    throw new AdScenarioError("compose", "no fallback templates available");
  }
  const key = keys[hashString(input.trend) % keys.length]!;
  const base = TEMPLATES[key]!;

  const trimmedTrend = input.trend.trim().slice(0, 120) || base.trend.name;
  const mutated: AdScenarioSpec = {
    ...base,
    id: `${base.id}_${hashString(input.trend).toString(36)}`,
    trend: {
      ...base.trend,
      name: trimmedTrend,
      source: input.marketContext ? "market context" : base.trend.source,
      why_it_matters: base.trend.why_it_matters,
    },
    metadata: { ...base.metadata, created_by: "agent", created_at: input.now },
  };
  // Re-validate the mutated fallback so it can never leak out malformed.
  return validateScenario(mutated);
}
