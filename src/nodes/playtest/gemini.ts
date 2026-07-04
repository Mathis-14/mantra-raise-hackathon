import { GoogleGenAI, PartMediaResolutionLevel } from "@google/genai";
import type { GenerateContentResponse, Interactions, Part } from "@google/genai";

import { serverEnv } from "@/lib/env";

import {
  CU_MODEL_PRIMARY,
  CU_STEP_TIMEOUT_MS,
  REPORT_MODEL,
  REPORT_TIMEOUT_MS,
} from "./config";
import type { Interaction, InteractionInput } from "./types";

let client: GoogleGenAI | null = null;

export function geminiClient() {
  client ??= new GoogleGenAI({ apiKey: serverEnv().GEMINI_API_KEY });
  return client;
}

export function imageContent(jpeg: Buffer): Interactions.ImageContent {
  return {
    type: "image",
    data: jpeg.toString("base64"),
    mime_type: "image/jpeg",
    resolution: "medium",
  };
}

export function imagePart(jpeg: Buffer): Part {
  return {
    inlineData: {
      data: jpeg.toString("base64"),
      mimeType: "image/jpeg",
    },
    mediaResolution: {
      level: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    },
  };
}

export async function cuStep(args: {
  input: InteractionInput;
  previousInteractionId?: string;
  model?: string;
  timeoutMs?: number;
  deadlineMs?: number;
}): Promise<{ interaction: Interaction; latencyMs: number }> {
  const startedAt = Date.now();
  const model = args.model ?? CU_MODEL_PRIMARY;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const remainingMs = args.deadlineMs === undefined ? undefined : args.deadlineMs - Date.now();
    if (remainingMs !== undefined && remainingMs <= 1_000) {
      throw lastError instanceof Error ? lastError : new Error("cu_step_deadline_exceeded");
    }
    const timeoutMs = Math.min(args.timeoutMs ?? CU_STEP_TIMEOUT_MS, remainingMs ?? CU_STEP_TIMEOUT_MS);

    try {
      const interaction = await withTimeout(
        geminiClient().interactions.create(
          {
            model,
            input: args.input,
            previous_interaction_id: args.previousInteractionId,
            tools: [{ type: "computer_use", environment: "browser" }],
            generation_config: { thinking_level: "low" },
          },
          { timeout: timeoutMs },
        ),
        timeoutMs,
        "cu_step_timeout",
      );

      return { interaction, latencyMs: Date.now() - startedAt };
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      if (args.deadlineMs !== undefined && Date.now() >= args.deadlineMs) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function reportStep(args: {
  prompt: string;
  keyframes: Buffer[];
  responseSchema: unknown;
  timeoutMs?: number;
}): Promise<GenerateContentResponse> {
  const parts: Part[] = [
    { text: args.prompt },
    ...args.keyframes.map((frame) => imagePart(frame)),
  ];

  return withTimeout(
    geminiClient().models.generateContent({
      model: REPORT_MODEL,
      contents: parts,
      config: {
        responseMimeType: "application/json",
        responseSchema: args.responseSchema,
        temperature: 0.4,
      },
    }),
    args.timeoutMs ?? REPORT_TIMEOUT_MS,
    "report_step_timeout",
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(label)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
