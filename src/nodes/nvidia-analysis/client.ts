import { nvidiaEnv } from "@/lib/env";

import { nvidiaAnalysisDraftSchema, type GameplayVersionInput, type NvidiaAnalysisDraft } from "./schema";

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 2;

interface NvidiaChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface NvidiaClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface NvidiaClient {
  model: string;
  analyze(version: GameplayVersionInput): Promise<NvidiaAnalysisDraft>;
}

export function createNvidiaClient(options: NvidiaClientOptions = {}): NvidiaClient {
  const configured = options.apiKey && options.baseUrl && options.model
    ? { apiKey: options.apiKey, baseUrl: options.baseUrl, model: options.model }
    : readConfiguredNvidia();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return {
    model: configured.model,
    async analyze(version) {
      let lastError = "unknown NVIDIA response error";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const draft = await requestAnalysis({
            version,
            apiKey: configured.apiKey,
            baseUrl: configured.baseUrl,
            model: configured.model,
            fetchImpl,
            timeoutMs,
            correction: attempt > 1 ? lastError : null,
          });
          return draft;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      throw new Error(`nvidia_gameplay_analysis_failed: ${lastError}`);
    },
  };
}

function readConfiguredNvidia(): { apiKey: string; baseUrl: string; model: string } {
  const env = nvidiaEnv();
  return {
    apiKey: env.NVIDIA_API_KEY,
    baseUrl: env.NVIDIA_API_BASE_URL,
    model: env.NVIDIA_GAMEPLAY_MODEL,
  };
}

async function requestAnalysis(args: {
  version: GameplayVersionInput;
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  correction: string | null;
}): Promise<NvidiaAnalysisDraft> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchImpl(`${trimTrailingSlash(args.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 3_000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "video_url", video_url: { url: args.version.videoUrl } },
              { type: "text", text: buildPrompt(args.version, args.correction) },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`NVIDIA API returned ${response.status}: ${responseText.slice(0, 300)}`);
    }

    const payload = await response.json() as NvidiaChatResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("NVIDIA API returned no message content");
    const parsedJson = parseJsonObject(content);
    return nvidiaAnalysisDraftSchema.parse(parsedJson);
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(version: GameplayVersionInput, correction: string | null): string {
  return `You are evaluating gameplay version "${version.name}" for a mobile game studio.
Analyze the complete video and its embedded audio as a player would. Compare nothing outside this clip.
The caller has confirmed that this MP4 contains its gameplay audio track.

Score three dimensions from 0 to 100:
- color: player/enemy/background separation, UI contrast, effect readability
- audio: event feedback, synchronization, silence, repetition, intensity
- video: pacing, responsiveness, dead time, clarity of goals, reward peaks

Return one JSON object only, without markdown or hidden reasoning, with exactly this shape:
{
  "color": { "score": 0, "confidence": 0, "summary": "", "strengths": [], "issues": [] },
  "audio": { "score": 0, "confidence": 0, "summary": "", "strengths": [], "issues": [] },
  "video": { "score": 0, "confidence": 0, "summary": "", "strengths": [], "issues": [] },
  "verdict": "promising|iterate|kill",
  "summary": "",
  "evidence": [{ "timestamp_seconds": 0, "dimension": "color|audio|video", "observation": "", "player_impact": "" }],
  "variant_hypotheses": [{ "problem": "", "proposed_change": "", "expected_effect": "", "evidence_timestamp_seconds": 0 }]
}

Use timestamps from the clip. Do not invent exact physical measurements such as LUFS or Delta E.
${correction ? `The previous response was invalid. Correct this validation problem: ${correction}` : ""}`;
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(withoutFence);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
