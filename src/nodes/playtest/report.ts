import { Type } from "@google/genai";
import { z } from "zod";

import type { PlaytestReport } from "@/contracts/types";

import { buildReportPrompt } from "./prompts";
import { reportStep } from "./gemini";
import type { FrameCapture, TerminationReason, TranscriptEntry } from "./types";

const reportDraftSchema = z.object({
  playable: z.boolean(),
  fun_score: z.number().min(0).max(10),
  fun_rationale: z.string().min(1),
  friction_points: z.array(z.string()),
  bugs: z.array(z.string()),
  session_summary: z.string().min(1),
  headline: z.string().min(1),
}).strict();

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    playable: { type: Type.BOOLEAN },
    fun_score: { type: Type.NUMBER, minimum: 0, maximum: 10 },
    fun_rationale: { type: Type.STRING },
    friction_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    bugs: { type: Type.ARRAY, items: { type: Type.STRING } },
    session_summary: { type: Type.STRING },
    headline: { type: Type.STRING },
  },
  required: [
    "playable",
    "fun_score",
    "fun_rationale",
    "friction_points",
    "bugs",
    "session_summary",
    "headline",
  ],
  additionalProperties: false,
};

export async function buildReport(args: {
  runId: string;
  transcript: TranscriptEntry[];
  frames: FrameCapture[];
  terminationReason: TerminationReason;
  selfVerdict: string | null;
  partial: boolean;
}): Promise<PlaytestReport> {
  const keyframes = selectKeyframes(args.frames).map((frame) => frame.jpeg);
  let parseError: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const prompt = buildReportPrompt({
      transcript: args.transcript,
      terminationReason: args.terminationReason,
      selfVerdict: args.selfVerdict,
      partial: args.partial,
      parseError,
    });

    const response = await reportStep({ prompt, keyframes, responseSchema });
    const text = response.text;
    if (!text) {
      parseError = "model returned empty report text";
      continue;
    }

    const json = parseJson(text);
    const parsed = reportDraftSchema.safeParse(json);
    if (parsed.success) {
      return {
        run_id: args.runId,
        ...parsed.data,
      };
    }

    parseError = parsed.error.message;
  }

  throw new Error(`playtest_report_parse_failed: ${parseError ?? "unknown error"}`);
}

export function parseFastPathReport(runId: string, text: string | null): PlaytestReport | null {
  if (!text) return null;
  const parsedJson = parseJson(text);
  const parsedReport = reportDraftSchema.safeParse(parsedJson);
  if (!parsedReport.success) return null;
  return {
    run_id: runId,
    ...parsedReport.data,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function selectKeyframes(frames: FrameCapture[]): FrameCapture[] {
  if (frames.length <= 4) return frames;
  const indexes = new Set<number>([
    0,
    Math.floor(frames.length / 3),
    Math.floor((frames.length * 2) / 3),
    frames.length - 1,
  ]);
  return [...indexes].sort((left, right) => left - right).map((index) => frames[index]).filter(isFrame);
}

function isFrame(frame: FrameCapture | undefined): frame is FrameCapture {
  return frame !== undefined;
}
