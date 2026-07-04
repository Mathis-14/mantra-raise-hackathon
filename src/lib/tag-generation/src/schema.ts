// The module's contract: Zod schemas, inferred types, timecode conversion and
// the raw-model-output → dataset transform. Everything here is pure — no I/O,
// no Gemini — so it is the unit-test surface.

import { z } from "zod";

// Fixed vocabularies. Families describe ad-making concerns (what a segment
// feels like, how it looks, where it fits in an ad), so they generalize across
// domains — never add app-specific values (e.g. "level-up", "checkout") here;
// that belongs in the free-form `contentType`.
export const EMOTION_TAGS = [
  "satisfying",
  "surprise",
  "relief",
  "aspiration",
  "curiosity",
  "tension",
  "reward",
  "frustration",
] as const;

export const VISUAL_TAGS = [
  "fast-paced",
  "slow",
  "buildup",
  "close-up",
  "wide-shot",
  "ui-heavy",
  "clean-frame",
  "text-space",
  "high-contrast",
] as const;

export const AD_ROLE_TAGS = [
  "hook-candidate",
  "good-for-opener",
  "good-for-cta",
  "good-for-loop",
  "b-roll",
  "skippable",
] as const;

export const emotionTagSchema = z.enum(EMOTION_TAGS);
export const visualTagSchema = z.enum(VISUAL_TAGS);
export const adRoleTagSchema = z.enum(AD_ROLE_TAGS);

export type EmotionTag = z.infer<typeof emotionTagSchema>;
export type VisualTag = z.infer<typeof visualTagSchema>;
export type AdRoleTag = z.infer<typeof adRoleTagSchema>;

export type TagGenerationStage =
  | "resolve-input"
  | "upload"
  | "generate"
  | "validate";

/** Every failure inside the module surfaces as this — callers never see raw SDK errors. */
export class TagGenerationError extends Error {
  constructor(
    readonly stage: TagGenerationStage,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`tag_generation_${stage.replace(/-/g, "_")}_failed: ${message}`, options);
    this.name = "TagGenerationError";
  }
}

// --- What the model returns (the boundary shape) ---------------------------
// Timecodes stay strings here because Gemini is most reliable quoting video
// positions as MM:SS; the transform below converts to seconds. The schema is
// deliberately regex-free: it doubles as the responseJsonSchema sent to
// Gemini, and structured-output support for `pattern` is not guaranteed.
// `parseTimecode` enforces the format at conversion time instead.

export const modelSegmentSchema = z.object({
  startTimecode: z
    .string()
    .describe("Segment start as MM:SS (or H:MM:SS for videos over an hour)"),
  endTimecode: z
    .string()
    .describe("Segment end as MM:SS (or H:MM:SS), strictly after the start"),
  contentType: z
    .string()
    .min(1)
    .describe(
      "Short free-form label for what this segment shows, in the app's own domain language",
    ),
  summary: z
    .string()
    .min(1)
    .describe("1-2 sentence description of what happens in the segment"),
  emotions: z.array(emotionTagSchema).describe("All emotions a viewer would feel"),
  visual: z.array(visualTagSchema).describe("All visual properties that apply"),
  adRoles: z.array(adRoleTagSchema).describe("All ad-editing roles this segment could play"),
  confidence: z.number().min(0).max(1).describe("Confidence in this segment's tags, 0-1"),
});

export const modelOutputSchema = z.object({
  videoDurationTimecode: z
    .string()
    .describe("Total video duration as MM:SS (or H:MM:SS)"),
  segments: z.array(modelSegmentSchema).min(1),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

// --- The public dataset (what generateTags returns) ------------------------

export const taggedSegmentSchema = z
  .object({
    start: z.number().min(0),
    end: z.number().positive(),
    durationSeconds: z.number().positive(),
    contentType: z.string().min(1),
    summary: z.string().min(1),
    emotions: z.array(emotionTagSchema),
    visual: z.array(visualTagSchema),
    adRoles: z.array(adRoleTagSchema),
    confidence: z.number().min(0).max(1),
  })
  .refine((s) => s.end > s.start, { message: "segment end must be after start" });

export const tagDatasetSchema = z.object({
  sourceRef: z.string().min(1),
  appContext: z.string().nullable(),
  durationSeconds: z.number().positive(),
  segments: z.array(taggedSegmentSchema).min(1),
  generatedAt: z.iso.datetime(),
});

export type TaggedSegment = z.infer<typeof taggedSegmentSchema>;
export type TagDataset = z.infer<typeof tagDatasetSchema>;

// --- Conversion ------------------------------------------------------------

const MM_SS = /^(\d{1,4}):([0-5]\d)$/;
const H_MM_SS = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;

/** "01:15" → 75, "1:02:03" → 3723. Throws TagGenerationError on anything else. */
export function parseTimecode(timecode: string): number {
  const hms = H_MM_SS.exec(timecode);
  if (hms) {
    const [, h, m, s] = hms;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  const ms = MM_SS.exec(timecode);
  if (ms) {
    const [, m, s] = ms;
    return Number(m) * 60 + Number(s);
  }
  throw new TagGenerationError(
    "validate",
    `invalid timecode "${timecode}" — expected MM:SS or H:MM:SS`,
  );
}

export interface DatasetMeta {
  sourceRef: string;
  appContext: string | null;
  generatedAt: string;
}

/**
 * Converts validated model output into the public dataset: timecodes →
 * seconds, segments sorted by start, durations computed. Re-validates the
 * result so a bad transform can never leak out.
 */
export function toTagDataset(raw: ModelOutput, meta: DatasetMeta): TagDataset {
  const segments = raw.segments
    .map((segment) => {
      const start = parseTimecode(segment.startTimecode);
      const end = parseTimecode(segment.endTimecode);
      return {
        start,
        end,
        durationSeconds: end - start,
        contentType: segment.contentType,
        summary: segment.summary,
        emotions: segment.emotions,
        visual: segment.visual,
        adRoles: segment.adRoles,
        confidence: segment.confidence,
      };
    })
    .sort((a, b) => a.start - b.start);

  const lastEnd = segments.reduce((max, s) => Math.max(max, s.end), 0);
  // The model's reported total can lag the last segment (rounding); trust the max.
  const durationSeconds = Math.max(parseTimecode(raw.videoDurationTimecode), lastEnd);

  const parsed = tagDatasetSchema.safeParse({
    sourceRef: meta.sourceRef,
    appContext: meta.appContext,
    durationSeconds,
    segments,
    generatedAt: meta.generatedAt,
  });
  if (!parsed.success) {
    throw new TagGenerationError("validate", z.prettifyError(parsed.error), {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
