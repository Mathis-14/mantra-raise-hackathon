// Composes an AdScenarioSpec from a trend + inspiration. Uses Gemini when
// GEMINI_API_KEY is present (structured output, parsed at the boundary), and a
// deterministic template fallback otherwise — so the toolkit always works
// offline. All failures surface as AdScenarioError; raw SDK errors never escape.
// Docs (read them, this API is new): https://ai.google.dev/gemini-api/docs/structured-output

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  MECHANIC_FOCUS,
  SKINS,
  LOADOUTS,
  AdScenarioError,
  adScenarioSpecSchema,
  type AdScenarioSpec,
} from "./schema";
import { summarizeInspiration, type Inspiration } from "./inspiration";
import { templateForTrend } from "./templates";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface ComposeOptions {
  trend: string | null;
  inspiration: Inspiration;
  model?: string;
  timeoutMs?: number;
  /** Force the deterministic path even if a key is present (tests). */
  forceTemplate?: boolean;
}

export interface ComposeResult {
  scenario: AdScenarioSpec;
  source: "gemini" | "template";
}

/**
 * Returns a validated AdScenarioSpec plus which path produced it. Falls back to
 * a template when no key is set, when forced, or when the Gemini call fails —
 * composition must never block the toolkit on a network dependency.
 */
export async function composeScenario(options: ComposeOptions): Promise<ComposeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (options.forceTemplate || !apiKey) {
    return { scenario: templateForTrend(options.trend), source: "template" };
  }

  try {
    const scenario = await composeWithGemini(apiKey, options);
    return { scenario, source: "gemini" };
  } catch {
    // Time-boxed dependency failing is expected; degrade to a template rather
    // than failing the whole create flow.
    return { scenario: templateForTrend(options.trend), source: "template" };
  }
}

async function composeWithGemini(
  apiKey: string,
  options: ComposeOptions,
): Promise<AdScenarioSpec> {
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ text: buildPrompt(options.trend, options.inspiration) }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(adScenarioSpecSchema),
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
  } catch (error) {
    throw new AdScenarioError("compose", `Gemini call failed (model ${model})`, {
      cause: error,
    });
  }

  const text = response.text;
  if (!text) throw new AdScenarioError("compose", "model returned an empty response");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AdScenarioError("compose", "model response is not valid JSON", { cause: error });
  }

  const parsed = adScenarioSpecSchema.safeParse(json);
  if (!parsed.success) {
    throw new AdScenarioError("compose", z.prettifyError(parsed.error), { cause: parsed.error });
  }
  return parsed.data;
}

function buildPrompt(trend: string | null, inspiration: Inspiration): string {
  const trendLine = trend
    ? `Target trend / angle: ${trend}`
    : "No specific trend given — pick the strongest angle from the inspiration.";
  return `You are a hypercasual UA creative strategist for "Mob Rush", a Mob-Control-style crowd runner: a cannon fires a stream of units through multiplier gates toward an enemy base.

${trendLine}

Inspiration folder digest:
${summarizeInspiration(inspiration)}

Design ONE ad-variant brief as JSON matching the provided schema. Rules:
- mechanicFocus: exactly one of ${MECHANIC_FOCUS.join(", ")} — the single gameplay angle the ad leans on.
- skin: one of ${SKINS.join(", ")} (visual theme that best sells the hook).
- loadout: one of ${LOADOUTS.join(", ")} (cannon fire style matching the pace).
- intensity: 0 (calm/clean) to 1 (max chaos) — scales wave pressure and clutter.
- hook: one scroll-stopping line for the first second.
- overlayText: up to 4 very short on-screen banner lines.
- hypothesis: one sentence on why this converts.
Keep every string short and punchy. Return only the JSON object.`;
}
