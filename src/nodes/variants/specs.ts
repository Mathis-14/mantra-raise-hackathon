import { randomInt, randomUUID } from "node:crypto";

import { GoogleGenAI, ServiceTier } from "@google/genai";

import type { PlaytestReport } from "@/contracts/types";
import { geminiEnv } from "@/lib/env";

import {
  DEFAULT_MARKET_CONTEXT,
  HTML_SUMMARY_LIMIT,
  MODEL_VARIANT_PLAN_JSON_SCHEMA,
  VARIANT_MODEL,
  VARIANT_TIMEOUT_MS,
  modelVariantPlanSchema,
  normalizeVariantCount,
  type VariantPatchSpec,
} from "./schema";

interface VariantSpecContext {
  gameHtml: string;
  report: PlaytestReport;
  marketContext: string | null;
}

const FALLBACK_QUALIFIERS = ["Pulse", "Rush", "Spike", "Clash", "Surge", "Flash"] as const;

const FALLBACK_PALETTES = [
  { accentColor: "#ff3366", secondaryColor: "#22d3ee" },
  { accentColor: "#f59e0b", secondaryColor: "#10b981" },
  { accentColor: "#7c3aed", secondaryColor: "#facc15" },
  { accentColor: "#06b6d4", secondaryColor: "#ef4444" },
  { accentColor: "#84cc16", secondaryColor: "#ec4899" },
] as const;

const FALLBACK_ANGLES = [
  {
    label: "Boss Pressure",
    mood: "boss",
    pressure: "chaotic",
    headline: "Boss incoming",
    subheadline: "Steer hard through the biggest gate",
  },
  {
    label: "Reward Storm",
    mood: "reward",
    pressure: "balanced",
    headline: "Coins everywhere",
    subheadline: "One clean gate can flood the lane",
  },
  {
    label: "Near Miss",
    mood: "failure",
    pressure: "chaotic",
    headline: "Do not hit red",
    subheadline: "A tiny mistake wipes the run",
  },
  {
    label: "Speed Gate",
    mood: "speed",
    pressure: "balanced",
    headline: "Faster than it looks",
    subheadline: "Chain the multipliers before they pass",
  },
  {
    label: "Choice Trap",
    mood: "choice",
    pressure: "calm",
    headline: "Pick the right gate",
    subheadline: "The obvious lane is not always best",
  },
] as const;

export async function generateModelVariantSpecs(
  input: VariantSpecContext,
  count: number,
): Promise<VariantPatchSpec[]> {
  const ai = new GoogleGenAI({ apiKey: geminiEnv().GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: VARIANT_MODEL,
    contents: [{ text: buildVariantPrompt(input, count) }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: MODEL_VARIANT_PLAN_JSON_SCHEMA,
      temperature: 1.15,
      topP: 0.92,
      serviceTier: ServiceTier.PRIORITY,
      abortSignal: AbortSignal.timeout(VARIANT_TIMEOUT_MS),
    },
  });

  if (!response.text) throw new Error("variant_model_empty_response");

  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch (error) {
    throw new Error("variant_model_invalid_json", { cause: error });
  }

  return modelVariantPlanSchema.parse(json).variants;
}

export function buildFallbackVariantSpecs(input: {
  count: number;
  report: PlaytestReport;
  marketContext: string | null;
}): VariantPatchSpec[] {
  const count = normalizeVariantCount(input.count);
  const paletteOffset = randomInt(FALLBACK_PALETTES.length);
  const angleOffset = randomInt(FALLBACK_ANGLES.length);

  return Array.from({ length: count }, (_, index) => {
    const angle = readAtWrapped(FALLBACK_ANGLES, index + angleOffset);
    const palette = readAtWrapped(FALLBACK_PALETTES, index + paletteOffset);
    const qualifier = pick(FALLBACK_QUALIFIERS);
    const contextHint = firstMeaningfulLine(input.report.friction_points) ?? input.report.headline;

    return {
      name: `${qualifier} ${angle.label}`,
      hypothesis: `Tests whether ${angle.label.toLowerCase()} reframes the playable loop around ${contextHint.toLowerCase()}.`,
      headline: angle.headline,
      subheadline: angle.subheadline,
      accentColor: palette.accentColor,
      secondaryColor: palette.secondaryColor,
      mood: angle.mood,
      pressure: angle.pressure,
      overlayPosition: index % 2 === 0 ? "top" : "bottom",
    };
  });
}

function buildVariantPrompt(input: VariantSpecContext, count: number): string {
  return `You are designing playable HTML game variants for a hypercasual creative test.

Return exactly ${count} variants as JSON matching the provided schema. Each variant must be visibly different from the others and must test one concrete creative hypothesis.

Do not rewrite source code. You are only choosing a bounded patch spec: short overlay copy, colors, mood, pressure, and overlay position. Keep copy short enough for a phone screen.

Run entropy: ${randomUUID()}
Generated at: ${new Date().toISOString()}

Playtest headline: ${input.report.headline}
Fun score: ${input.report.fun_score}/10
Playtest summary: ${input.report.session_summary}
Friction points: ${input.report.friction_points.join("; ") || "none reported"}
Bugs: ${input.report.bugs.join("; ") || "none reported"}
Market context: ${input.marketContext ?? DEFAULT_MARKET_CONTEXT}

HTML summary:
${summarizeHtml(input.gameHtml)}`;
}

function summarizeHtml(html: string): string {
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim() ?? "Untitled prototype";
  const bodyText = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HTML_SUMMARY_LIMIT);
  const scriptRefs = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi))
    .flatMap((match) => (match[1] ? [match[1]] : []))
    .slice(0, 6);

  return [
    `title: ${title}`,
    `visible_text: ${bodyText || "none"}`,
    `script_refs: ${scriptRefs.join(", ") || "inline or none"}`,
  ].join("\n");
}

function pick<T>(items: readonly T[]): T {
  const item = items[randomInt(items.length)];
  if (item === undefined) throw new Error("empty_pick_list");
  return item;
}

function readAtWrapped<T>(items: readonly T[], offset: number): T {
  const item = items[offset % items.length];
  if (item === undefined) throw new Error("empty_wrapped_list");
  return item;
}

function firstMeaningfulLine(items: readonly string[]): string | null {
  for (const item of items) {
    const clean = item.trim();
    if (clean.length > 0) return clean;
  }
  return null;
}
