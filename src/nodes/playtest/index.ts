import type { PlaytestInput, PlaytestReport } from "@/contracts/types";
import { emitEvent } from "@/lib/events";

import { createActionExecutor } from "./actions";
import { capturePage, openBrowserSession } from "./browser";
import {
  CU_MODEL_PRIMARY,
  MAX_TURNS,
  MIN_CU_TURN_REMAINING_MS,
  MIN_TURNS_FOR_REPORT,
  NUDGE_AFTER_REPEATS,
  REPORT_GRACE_S,
} from "./config";
import { buildReport } from "./report";
import { imageContent, cuStep } from "./gemini";
import { ACTION_LOOP_NUDGE, PLAYER_PROMPT } from "./prompts";
import { sinkFrame } from "./screens";
import type {
  CuCallResult,
  FrameCapture,
  FunctionCallStep,
  FunctionResultStep,
  Interaction,
  TerminationReason,
  TranscriptEntry,
  Usage,
} from "./types";

export async function runPlaytest(input: PlaytestInput): Promise<PlaytestReport> {
  const startedAt = Date.now();
  const playBudgetMs = Math.max(10_000, (input.timeBudgetS - REPORT_GRACE_S) * 1_000);
  const playDeadline = startedAt + playBudgetMs;
  const transcript: TranscriptEntry[] = [];
  const frames: FrameCapture[] = [];
  let interaction: Interaction | null = null;
  let selfVerdict: string | null = null;
  let terminationReason: TerminationReason = "budget";
  let partial = false;
  let turn = 0;
  let nudgeSent = false;

  await emitEvent({
    run_id: input.runId,
    node: "playtest",
    type: "observation",
    message: "playtest_started",
    screenshot_url: null,
    data: { game_url: input.gameUrl, time_budget_s: input.timeBudgetS, model: CU_MODEL_PRIMARY },
  });

  const session = await openBrowserSession({
    runId: input.runId,
    gameUrl: input.gameUrl,
  });
  const executor = createActionExecutor(session.page);

  try {
    const firstFrame = await captureAndSink(input.runId, turn, session.page, frames);
    const firstStep = await cuStep({
      input: [
        { type: "text", text: PLAYER_PROMPT },
        imageContent(firstFrame),
      ],
      deadlineMs: playDeadline,
    });
    interaction = firstStep.interaction;
    await emitUsage(input.runId, turn, firstStep.latencyMs, firstStep.interaction.usage);

    while (Date.now() < playDeadline && turn < MAX_TURNS) {
      const calls = getFunctionCalls(interaction);
      if (calls.length === 0) {
        selfVerdict = extractModelText(interaction);
        terminationReason = "model_done";
        break;
      }

      const callResults: CuCallResult[] = [];
      for (const call of calls) {
        const result = await executor.execute(call);
        if (requiresSafetyConfirmation(call)) {
          await emitEvent({
            run_id: input.runId,
            node: "playtest",
            type: "observation",
            message: "safety_confirmation_acknowledged",
            screenshot_url: null,
            data: { turn, name: call.name },
          });
        }
        const intent = result.intent ?? readIntent(call);
        const message = intent ?? call.name;
        await emitEvent({
          run_id: input.runId,
          node: "playtest",
          type: "action",
          message,
          screenshot_url: null,
          data: { turn, name: call.name, args: call.arguments },
        });
        transcript.push({
          turn,
          action: call.name,
          intent,
          result: result.message,
        });
        callResults.push({ call, message: result.message, isError: result.isError });
      }

      turn += 1;
      const frame = await captureAndSink(input.runId, turn, session.page, frames);
      const shouldNudge = !nudgeSent && repeatedActionCount(transcript) >= NUDGE_AFTER_REPEATS;
      const functionResults = callResults.map((result, index) =>
        makeFunctionResult(
          result,
          frame,
          shouldNudge && index === callResults.length - 1 ? ACTION_LOOP_NUDGE : undefined,
        ),
      );

      if (shouldNudge) {
        nudgeSent = true;
      }

      if (Date.now() >= playDeadline) {
        terminationReason = "budget";
        break;
      }
      if (playDeadline - Date.now() < MIN_CU_TURN_REMAINING_MS) {
        terminationReason = "budget";
        break;
      }

      try {
        const nextStep = await cuStep({
          input: functionResults,
          previousInteractionId: interaction.id,
          deadlineMs: playDeadline,
        });
        interaction = nextStep.interaction;
        await emitUsage(input.runId, turn, nextStep.latencyMs, nextStep.interaction.usage);
      } catch (error) {
        if (Date.now() >= playDeadline) {
          terminationReason = "budget";
          break;
        }
        partial = true;
        terminationReason = "cu_error";
        await emitEvent({
          run_id: input.runId,
          node: "playtest",
          type: "error",
          message: "cu_step_failed",
          screenshot_url: null,
          data: { turn, error: error instanceof Error ? error.message : String(error) },
        });
        break;
      }
    }

    if (turn >= MAX_TURNS) terminationReason = "max_turns";
  } finally {
    await executor.release();
    await session.browser.close();
  }

  await emitEvent({
    run_id: input.runId,
    node: "playtest",
    type: "observation",
    message: `session_ended: ${terminationReason}`,
    screenshot_url: null,
    data: { turns: turn, partial },
  });

  if (terminationReason === "cu_error" && transcript.length < MIN_TURNS_FOR_REPORT) {
    throw new Error("playtest_cu_failed_before_minimum_turns");
  }

  const report = await buildReport({
    runId: input.runId,
    transcript,
    frames,
    terminationReason,
    selfVerdict,
    partial,
  });

  await emitEvent({
    run_id: input.runId,
    node: "playtest",
    type: "observation",
    message: report.headline,
    screenshot_url: null,
    data: { fun_score: report.fun_score, playable: report.playable },
  });

  return report;
}

async function captureAndSink(
  runId: string,
  turn: number,
  page: Parameters<typeof capturePage>[0],
  frames: FrameCapture[],
): Promise<Buffer> {
  const jpeg = await capturePage(page);
  frames.push({ turn, jpeg });
  sinkFrame({ runId, turn, jpeg });
  return jpeg;
}

function getFunctionCalls(interaction: Interaction | null): FunctionCallStep[] {
  return interaction?.steps?.filter(isFunctionCallStep) ?? [];
}

function isFunctionCallStep(step: unknown): step is FunctionCallStep {
  return (
    typeof step === "object" &&
    step !== null &&
    "type" in step &&
    step.type === "function_call" &&
    "name" in step &&
    typeof step.name === "string" &&
    "id" in step &&
    typeof step.id === "string" &&
    "arguments" in step &&
    typeof step.arguments === "object" &&
    step.arguments !== null
  );
}

function makeFunctionResult(
  result: CuCallResult,
  frame: Buffer,
  nudgeText: string | undefined,
): FunctionResultStep {
  return {
    type: "function_result",
    name: result.call.name,
    call_id: result.call.id,
    is_error: result.isError,
    result: [
      { type: "text", text: result.message },
      ...(nudgeText ? [{ type: "text" as const, text: nudgeText }] : []),
      imageContent(frame),
    ],
  };
}

function extractModelText(interaction: Interaction | null): string | null {
  for (const step of interaction?.steps ?? []) {
    if (step.type !== "model_output") continue;
    const text = step.content
      ?.filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

function readIntent(call: FunctionCallStep): string | null {
  const intent = call.arguments.intent;
  return typeof intent === "string" ? intent : null;
}

function requiresSafetyConfirmation(call: FunctionCallStep): boolean {
  const safetyDecision = call.arguments.safety_decision;
  return (
    typeof safetyDecision === "object" &&
    safetyDecision !== null &&
    "decision" in safetyDecision &&
    safetyDecision.decision === "require_confirmation"
  );
}

function repeatedActionCount(transcript: TranscriptEntry[]): number {
  const last = transcript.at(-1);
  if (!last) return 0;

  let count = 0;
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (transcript[index]?.action !== last.action) break;
    count += 1;
  }
  return count;
}

async function emitUsage(
  runId: string,
  turn: number,
  latencyMs: number,
  usage: Usage | undefined,
): Promise<void> {
  const costUsd = estimateCostUsd(usage);
  await emitEvent({
    run_id: runId,
    node: "playtest",
    type: "observation",
    message: "cu_usage",
    screenshot_url: null,
    data: {
      turn,
      latency_ms: latencyMs,
      estimated_cost_usd: costUsd,
      usage: usage ?? null,
    },
  });
}

function estimateCostUsd(usage: Usage | undefined): number | null {
  if (!usage) return null;
  const inputTokens = usage.total_input_tokens ?? 0;
  const cachedTokens = usage.total_cached_tokens ?? 0;
  const outputTokens = (usage.total_output_tokens ?? 0) + (usage.total_thought_tokens ?? 0);
  const billableInput = Math.max(0, inputTokens - cachedTokens);
  return (billableInput * 1.5 + cachedTokens * 0.15 + outputTokens * 9) / 1_000_000;
}
