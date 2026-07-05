import { GoogleGenAI, PartMediaResolutionLevel, ServiceTier } from "@google/genai";
import type { GenerateContentResponse, Interactions, Part } from "@google/genai";

import { serverEnv } from "@/lib/env";

import {
  CU_MODEL_PRIMARY,
  CU_STEP_TIMEOUT_MS,
  HOLD_AND_STEER_DEFAULT_MS,
  HOLD_AND_STEER_DEFAULT_Y,
  PLAYTEST_GEMINI_SERVICE_TIER,
  REPORT_MODEL,
  REPORT_TIMEOUT_MS,
} from "./config";
import type { Interaction, InteractionInput } from "./types";

type GeminiServiceTier = "flex" | "standard" | "priority";

let client: GoogleGenAI | null = null;

const COMPUTER_USE_TOOL = { type: "computer_use", environment: "browser" } satisfies Interactions.Tool;

const HOLD_AND_STEER_TOOL = {
  type: "function",
  name: "hold_and_steer",
  description:
    "During active hold-to-fire lane gameplay, hold the pointer down and steer through horizontal targets in one continuous gesture. Do not use for menus or overlays.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      x_path: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: { type: "number", minimum: 0, maximum: 999 },
      },
      y: {
        type: "number",
        minimum: 550,
        maximum: 900,
        default: HOLD_AND_STEER_DEFAULT_Y,
      },
      duration_ms: {
        type: "integer",
        minimum: 500,
        maximum: 4_500,
        default: HOLD_AND_STEER_DEFAULT_MS,
      },
      release: { type: "boolean", default: false },
      intent: { type: "string" },
    },
    required: ["x_path"],
  },
} satisfies Interactions.Tool;

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
}): Promise<{
  interaction: Interaction;
  latencyMs: number;
  attemptCount: number;
  timeoutMs: number;
  remainingBudgetMsBefore: number | null;
  model: string;
  requestedServiceTier: GeminiServiceTier;
  actualServiceTier: string | null;
}> {
  const startedAt = Date.now();
  const model = args.model ?? CU_MODEL_PRIMARY;
  const remainingBudgetMsBefore = args.deadlineMs === undefined ? null : Math.max(0, args.deadlineMs - startedAt);
  let lastError: unknown;
  let lastAttempt = 0;
  let lastTimeoutMs = args.timeoutMs ?? CU_STEP_TIMEOUT_MS;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    lastAttempt = attempt;
    const remainingMs = args.deadlineMs === undefined ? undefined : args.deadlineMs - Date.now();
    if (remainingMs !== undefined && remainingMs <= 1_000) {
      throw new CuStepError(lastError, {
        latencyMs: Date.now() - startedAt,
        attemptCount: lastAttempt,
        timeoutMs: lastTimeoutMs,
        remainingBudgetMsBefore,
        timedOut: false,
        errorKind: "deadline",
      });
    }
    const timeoutMs = Math.min(args.timeoutMs ?? CU_STEP_TIMEOUT_MS, remainingMs ?? CU_STEP_TIMEOUT_MS);
    lastTimeoutMs = timeoutMs;

    try {
      const interaction = await withTimeout(
        geminiClient().interactions.create(
          {
            model,
            input: args.input,
            previous_interaction_id: args.previousInteractionId,
            service_tier: PLAYTEST_GEMINI_SERVICE_TIER,
            tools: [COMPUTER_USE_TOOL, HOLD_AND_STEER_TOOL],
            generation_config: { thinking_level: "low" },
          },
          { timeout: timeoutMs },
        ),
        timeoutMs,
        "cu_step_timeout",
      );

      return {
        interaction,
        latencyMs: Date.now() - startedAt,
        attemptCount: attempt,
        timeoutMs,
        remainingBudgetMsBefore,
        model,
        requestedServiceTier: PLAYTEST_GEMINI_SERVICE_TIER,
        actualServiceTier: interaction.service_tier ?? null,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      if (args.deadlineMs !== undefined && Date.now() >= args.deadlineMs) break;
      await delay(250);
    }
  }

  throw new CuStepError(lastError, {
    latencyMs: Date.now() - startedAt,
    attemptCount: lastAttempt,
    timeoutMs: lastTimeoutMs,
    remainingBudgetMsBefore,
    timedOut: isTimeoutError(lastError),
    errorKind: classifyError(lastError),
  });
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
        serviceTier: ServiceTier.PRIORITY,
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

export interface CuStepErrorDetails {
  latencyMs: number;
  attemptCount: number;
  timeoutMs: number;
  remainingBudgetMsBefore: number | null;
  timedOut: boolean;
  errorKind: string;
}

export class CuStepError extends Error {
  constructor(
    cause: unknown,
    readonly details: CuStepErrorDetails,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "CuStepError";
    this.cause = cause;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyError(error: unknown): string {
  if (isTimeoutError(error)) return "timeout";
  if (error instanceof Error && error.name) return error.name;
  return "unknown";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("cu_step_timeout");
}
