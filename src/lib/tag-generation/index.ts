// Public API of the tag-generation library. One entry point; everything else
// is re-exported contract. See ./AGENTS.md for scope and rules.

import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, analyzeVideo } from "./src/gemini";
import { toTagDataset, type TagDataset } from "./src/schema";

export {
  AD_ROLE_TAGS,
  EMOTION_TAGS,
  VISUAL_TAGS,
  TagGenerationError,
  adRoleTagSchema,
  emotionTagSchema,
  visualTagSchema,
  taggedSegmentSchema,
  tagDatasetSchema,
} from "./src/schema";
export type {
  AdRoleTag,
  EmotionTag,
  VisualTag,
  TagDataset,
  TaggedSegment,
  TagGenerationStage,
} from "./src/schema";
export { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from "./src/gemini";

export interface TagGenerationInput {
  /** Local video file path (URLs are out of scope by design). */
  source: string;
  /** Optional domain hint passed to the model verbatim (e.g. "hypercasual mobile game"). */
  appContext?: string;
  /** Gemini model id; defaults to DEFAULT_MODEL. */
  model?: string;
  /** Hard budget for the whole operation (upload + inference). */
  timeoutMs?: number;
}

/**
 * Analyzes a video with Gemini and returns a validated, time-coded dataset of
 * tagged segments. Throws TagGenerationError (never raw SDK errors) on
 * failure; never hangs past `timeoutMs`.
 */
export async function generateTags(input: TagGenerationInput): Promise<TagDataset> {
  const raw = await analyzeVideo({
    source: input.source,
    appContext: input.appContext ?? null,
    model: input.model ?? DEFAULT_MODEL,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  return toTagDataset(raw, {
    sourceRef: input.source,
    appContext: input.appContext ?? null,
    generatedAt: new Date().toISOString(),
  });
}

/** Stable JSON form of a dataset — round-trips through tagDatasetSchema. */
export function serializeTagDataset(dataset: TagDataset): string {
  return JSON.stringify(dataset, null, 2);
}
