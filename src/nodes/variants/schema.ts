import { z } from "zod";

export const VARIANT_MODEL = "gemini-2.5-flash";
export const VARIANT_TIMEOUT_MS = 45_000;
export const MAX_VARIANT_COUNT = 5;
export const MIN_VARIANT_COUNT = 1;
export const HTML_SUMMARY_LIMIT = 1_200;
export const DEFAULT_MARKET_CONTEXT = "No explicit market context was provided.";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const VARIANT_MOODS = ["boss", "reward", "failure", "speed", "choice", "clarity"] as const;
export const VARIANT_PRESSURES = ["calm", "balanced", "chaotic"] as const;
export const OVERLAY_POSITIONS = ["top", "bottom"] as const;

export const variantPatchSpecSchema = z.object({
  name: z.string().min(3).max(48),
  hypothesis: z.string().min(12).max(240),
  headline: z.string().min(3).max(48),
  subheadline: z.string().min(3).max(96),
  accentColor: z.string().regex(HEX_COLOR_PATTERN),
  secondaryColor: z.string().regex(HEX_COLOR_PATTERN),
  mood: z.enum(VARIANT_MOODS),
  pressure: z.enum(VARIANT_PRESSURES),
  overlayPosition: z.enum(OVERLAY_POSITIONS),
});

export const modelVariantPlanSchema = z.object({
  variants: z.array(variantPatchSpecSchema).min(1).max(MAX_VARIANT_COUNT),
});

export type VariantPatchSpec = z.infer<typeof variantPatchSpecSchema>;

export const MODEL_VARIANT_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    variants: {
      type: "array",
      minItems: MIN_VARIANT_COUNT,
      maxItems: MAX_VARIANT_COUNT,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          hypothesis: { type: "string" },
          headline: { type: "string" },
          subheadline: { type: "string" },
          accentColor: { type: "string" },
          secondaryColor: { type: "string" },
          mood: { type: "string", enum: [...VARIANT_MOODS] },
          pressure: { type: "string", enum: [...VARIANT_PRESSURES] },
          overlayPosition: { type: "string", enum: [...OVERLAY_POSITIONS] },
        },
        required: [
          "name",
          "hypothesis",
          "headline",
          "subheadline",
          "accentColor",
          "secondaryColor",
          "mood",
          "pressure",
          "overlayPosition",
        ],
      },
    },
  },
  required: ["variants"],
} satisfies Record<string, unknown>;

export function normalizeVariantCount(count: number): number {
  if (!Number.isFinite(count)) return MAX_VARIANT_COUNT;
  return Math.min(MAX_VARIANT_COUNT, Math.max(MIN_VARIANT_COUNT, Math.trunc(count)));
}
