// Gemini video-understanding call: local-file resolution, prompt construction,
// structured JSON output, boundary parsing.
// Docs (read them, don't trust memory — this API is new):
// https://ai.google.dev/gemini-api/docs/video-understanding

import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { FileState, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  AD_ROLE_TAGS,
  EMOTION_TAGS,
  VISUAL_TAGS,
  TagGenerationError,
  modelOutputSchema,
  type ModelOutput,
} from "./schema";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_TIMEOUT_MS = 180_000;

// Total request cap for inline media is 20MB; leave headroom for the prompt.
const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;
const FILE_POLL_INTERVAL_MS = 5_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpg",
  ".mov": "video/mov",
  ".avi": "video/avi",
  ".flv": "video/x-flv",
  ".webm": "video/webm",
  ".wmv": "video/wmv",
  ".3gp": "video/3gpp",
  ".3gpp": "video/3gpp",
};

export interface AnalyzeVideoOptions {
  /** Local video file path. */
  source: string;
  appContext: string | null;
  model: string;
  timeoutMs: number;
}

export async function analyzeVideo(options: AnalyzeVideoOptions): Promise<ModelOutput> {
  const ai = new GoogleGenAI({ apiKey: serverEnv().GEMINI_API_KEY });
  const deadline = Date.now() + options.timeoutMs;

  const videoPart = await resolveVideoPart(ai, options.source, deadline);
  const response = await callModel(ai, options, videoPart, deadline);
  return parseModelResponse(response);
}

// --- Input resolution -------------------------------------------------------

async function resolveVideoPart(
  ai: GoogleGenAI,
  path: string,
  deadline: number,
): Promise<Part> {
  const mimeType = mimeFromPath(path);
  const size = await fileSize(path);
  if (size <= INLINE_LIMIT_BYTES) {
    const bytes = await readFile(path);
    return { inlineData: { data: bytes.toString("base64"), mimeType } };
  }
  return uploadPart(ai, path, mimeType, deadline);
}

function mimeFromPath(path: string): string {
  const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()];
  if (!mime) {
    throw new TagGenerationError(
      "resolve-input",
      `unsupported video extension "${extname(path)}" for ${path} — supported: ${Object.keys(MIME_BY_EXTENSION).join(", ")}`,
    );
  }
  return mime;
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    throw new TagGenerationError("resolve-input", `cannot read video file at ${path}`, {
      cause: error,
    });
  }
}

async function uploadPart(
  ai: GoogleGenAI,
  path: string,
  mimeType: string,
  deadline: number,
): Promise<Part> {
  try {
    const uploaded = await ai.files.upload({ file: path, config: { mimeType } });
    let current = uploaded;
    while (current.state === FileState.PROCESSING) {
      if (Date.now() + FILE_POLL_INTERVAL_MS > deadline) {
        throw new TagGenerationError("upload", "file processing exceeded the time budget");
      }
      await sleep(FILE_POLL_INTERVAL_MS);
      if (!uploaded.name) break;
      current = await ai.files.get({ name: uploaded.name });
    }
    if (current.state !== FileState.ACTIVE || !current.uri) {
      throw new TagGenerationError(
        "upload",
        `uploaded file ended in state ${current.state ?? "unknown"}`,
      );
    }
    return { fileData: { fileUri: current.uri, mimeType } };
  } catch (error) {
    if (error instanceof TagGenerationError) throw error;
    throw new TagGenerationError("upload", "Files API upload failed", { cause: error });
  }
}

// --- Model call --------------------------------------------------------------

async function callModel(
  ai: GoogleGenAI,
  options: AnalyzeVideoOptions,
  videoPart: Part,
  deadline: number,
): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: options.model,
      // Text goes after the video — the docs say ordering matters.
      contents: [videoPart, { text: buildPrompt(options.appContext) }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(modelOutputSchema),
        abortSignal: deadlineSignal(deadline),
      },
    });
    const text = response.text;
    if (!text) {
      throw new TagGenerationError("generate", "model returned an empty response");
    }
    return text;
  } catch (error) {
    if (error instanceof TagGenerationError) throw error;
    throw new TagGenerationError(
      "generate",
      `Gemini call failed (model ${options.model})`,
      { cause: error },
    );
  }
}

function parseModelResponse(text: string): ModelOutput {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new TagGenerationError("validate", "model response is not valid JSON", {
      cause: error,
    });
  }
  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    throw new TagGenerationError("validate", z.prettifyError(parsed.error), {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function buildPrompt(appContext: string | null): string {
  const contextLine = appContext
    ? `App context (hint only — describe what you actually see): ${appContext}`
    : "No app context was provided — infer the domain from the footage itself.";

  return `You are a video analyst preparing raw footage for ad-creative editing.
${contextLine}

Segment the ENTIRE video from 00:00 to the end into contiguous, non-overlapping segments. Cut wherever the content, pacing, or mood changes (segments are typically 2–15 seconds; never invent a cut where nothing changes).

For every segment report:
- startTimecode / endTimecode as MM:SS (H:MM:SS only if the video exceeds an hour). The end of one segment is the start of the next.
- contentType: a short free-form label in the app's own domain language (e.g. "gameplay-level-clear", "checkout-flow", "dashboard-overview").
- summary: 1–2 sentences on what happens.
- emotions: every emotion a first-time viewer would feel, from: ${EMOTION_TAGS.join(", ")}.
- visual: every visual property that applies, from: ${VISUAL_TAGS.join(", ")}.
- adRoles: every role this clip could play in an ad, from: ${AD_ROLE_TAGS.join(", ")}. "hook-candidate" = could stop a scroll in the first second; "good-for-loop" = end state matches start state; "text-space" segments pair with "good-for-cta".
- confidence: 0–1 for how sure you are about the tags.

Tags are additive — apply every one that fits, and leave a list empty when none fit. Also report videoDurationTimecode, the total length as MM:SS.`;
}

// --- Helpers -----------------------------------------------------------------

function deadlineSignal(deadline: number): AbortSignal {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new TagGenerationError("generate", "time budget exhausted before the call started");
  }
  return AbortSignal.timeout(remaining);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
