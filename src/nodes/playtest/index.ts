import type { PlaytestInput, PlaytestReport } from "@/contracts/types";
import { emitEvent } from "@/lib/events";

import { createActionExecutor, type ActionResult } from "./actions";
import { capturePage, openBrowserSession } from "./browser";
import {
  CU_MODEL_PRIMARY,
  MAX_CALLS_PER_TURN,
  MAX_TURNS,
  MIN_CU_TURN_REMAINING_MS,
  MIN_TURNS_FOR_REPORT,
  NUDGE_AFTER_REPEATS,
  POST_WIN_MAX_MS,
  POST_WIN_MAX_TURNS,
  REPORT_GRACE_S,
} from "./config";
import { buildReport, parseFastPathReport } from "./report";
import { CuStepError, imageContent, cuStep } from "./gemini";
import { ACTION_LOOP_NUDGE, PLAYER_PROMPT, POST_WIN_SWEEP_PROMPT } from "./prompts";
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

interface TimingStats {
  setupMs: number;
  cleanupMs: number;
  reportMs: number;
  cuLatenciesMs: number[];
  actionLatenciesMs: number[];
  captureLatenciesMs: number[];
  screenshotUploadSuccesses: number;
  screenshotUploadFailures: number;
}

interface PostWinState {
  startedAt: number | null;
  startTurn: number | null;
  nudgeSent: boolean;
  nextLevelChecked: boolean;
  replayChecked: boolean;
}

export async function runPlaytest(input: PlaytestInput): Promise<PlaytestReport> {
  const startedAt = Date.now();
  const playBudgetMs = Math.max(10_000, (input.timeBudgetS - REPORT_GRACE_S) * 1_000);
  const playDeadline = startedAt + playBudgetMs;
  const timings: TimingStats = {
    setupMs: 0,
    cleanupMs: 0,
    reportMs: 0,
    cuLatenciesMs: [],
    actionLatenciesMs: [],
    captureLatenciesMs: [],
    screenshotUploadSuccesses: 0,
    screenshotUploadFailures: 0,
  };
  const postWin: PostWinState = {
    startedAt: null,
    startTurn: null,
    nudgeSent: false,
    nextLevelChecked: false,
    replayChecked: false,
  };
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

  const setupStartedAt = Date.now();
  const session = await openBrowserSession({
    runId: input.runId,
    gameUrl: input.gameUrl,
    recordVideo: input.recordVideo,
  });
  timings.setupMs = Date.now() - setupStartedAt;
  const executor = createActionExecutor(session.page);

  try {
    const firstFrame = await captureAndSink(input.runId, turn, session.page, frames, timings);
    const firstStep = await cuStep({
      input: [
        { type: "text", text: PLAYER_PROMPT },
        imageContent(firstFrame),
      ],
      deadlineMs: playDeadline,
    });
    interaction = firstStep.interaction;
    timings.cuLatenciesMs.push(firstStep.latencyMs);
    await emitUsage(input.runId, turn, firstStep);

    while (Date.now() < playDeadline && turn < MAX_TURNS) {
      const calls = getFunctionCalls(interaction);
      if (calls.length === 0) {
        selfVerdict = extractModelText(interaction);
        if (shouldNudgePostWin(postWin, selfVerdict)) {
          await startPostWinSweep(input.runId, postWin, turn, "model_stopped_after_win");
          const frame = await captureAndSink(input.runId, turn, session.page, frames, timings);
          const nextStep = await cuStep({
            input: [
              { type: "text", text: POST_WIN_SWEEP_PROMPT },
              imageContent(frame),
            ],
            previousInteractionId: interaction?.id,
            deadlineMs: playDeadline,
          });
          interaction = nextStep.interaction;
          timings.cuLatenciesMs.push(nextStep.latencyMs);
          await emitUsage(input.runId, turn, nextStep);
          postWin.nudgeSent = true;
          continue;
        }
        terminationReason = "model_done";
        break;
      }

      const callResults: CuCallResult[] = [];
      let skipRestOfBatch = false;
      for (let index = 0; index < calls.length; index += 1) {
        const call = calls[index];
        if (!call) continue;

        const actionStartedAt = Date.now();
        const shouldSkip =
          index >= MAX_CALLS_PER_TURN ||
          skipRestOfBatch ||
          Date.now() >= playDeadline ||
          playDeadline - Date.now() < 1_000;
        const result = shouldSkip
          ? makeSkippedActionResult(call, index >= MAX_CALLS_PER_TURN ? "batch_cap" : "batch_stopped")
          : await executor.execute(call);
        const actionLatencyMs = Date.now() - actionStartedAt;
        timings.actionLatenciesMs.push(actionLatencyMs);
        if (result.isError) skipRestOfBatch = true;

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
          data: {
            turn,
            name: call.name,
            args: call.arguments,
            action_latency_ms: actionLatencyMs,
            is_error: result.isError,
            calls_in_turn: calls.length,
            batch_index: index,
            skipped: shouldSkip,
          },
        });
        transcript.push({
          turn,
          action: call.name,
          intent,
          result: result.message,
        });
        callResults.push({ call, message: result.message, isError: result.isError });
        await maybeUpdatePostWin(input.runId, postWin, turn, message);
      }

      turn += 1;
      const frame = await captureAndSink(input.runId, turn, session.page, frames, timings);
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
      if (postWinSweepExpired(postWin, turn)) {
        terminationReason = "post_win_sweep_done";
        selfVerdict = "Post-win continuation sweep reached its bounded turn/time cap.";
        await emitPostWinObservation(input.runId, "post_win_sweep_done", turn, {
          elapsed_ms: postWin.startedAt === null ? null : Date.now() - postWin.startedAt,
        });
        break;
      }

      try {
        const nextStep = await cuStep({
          input: functionResults,
          previousInteractionId: interaction.id,
          deadlineMs: playDeadline,
        });
        interaction = nextStep.interaction;
        timings.cuLatenciesMs.push(nextStep.latencyMs);
        await emitUsage(input.runId, turn, nextStep);
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
          data: {
            turn,
            error: error instanceof Error ? error.message : String(error),
            ...(error instanceof CuStepError ? error.details : {}),
          },
        });
        break;
      }
    }

    if (turn >= MAX_TURNS) terminationReason = "max_turns";
  } finally {
    const cleanupStartedAt = Date.now();
    await executor.release();
    await session.browser.close();
    timings.cleanupMs = Date.now() - cleanupStartedAt;
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

  const reportStartedAt = Date.now();
  const fastReport = parseFastPathReport(input.runId, selfVerdict);
  const report = fastReport ?? await buildReport({
    runId: input.runId,
    transcript,
    frames,
    terminationReason,
    selfVerdict,
    partial,
  });
  timings.reportMs = Date.now() - reportStartedAt;

  await emitEvent({
    run_id: input.runId,
    node: "playtest",
    type: "observation",
    message: report.headline,
    screenshot_url: null,
    data: { fun_score: report.fun_score, playable: report.playable },
  });

  await emitTimingSummary({
    runId: input.runId,
    startedAt,
    playBudgetMs,
    turn,
    terminationReason,
    partial,
    timings,
    usedFastReport: fastReport !== null,
  });

  return report;
}

async function captureAndSink(
  runId: string,
  turn: number,
  page: Parameters<typeof capturePage>[0],
  frames: FrameCapture[],
  timings: TimingStats,
): Promise<Buffer> {
  const captureStartedAt = Date.now();
  const jpeg = await capturePage(page);
  const captureMs = Date.now() - captureStartedAt;
  timings.captureLatenciesMs.push(captureMs);
  frames.push({ turn, jpeg });
  sinkFrame({
    runId,
    turn,
    jpeg,
    captureMs,
    onUploadComplete: (success) => {
      if (success) timings.screenshotUploadSuccesses += 1;
      else timings.screenshotUploadFailures += 1;
    },
  });
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

function makeSkippedActionResult(call: FunctionCallStep, reason: string): ActionResult {
  return {
    message: JSON.stringify({ skipped: true, reason, action: call.name }),
    isError: false,
    intent: readIntent(call),
  };
}

async function startPostWinSweep(
  runId: string,
  postWin: PostWinState,
  turn: number,
  trigger: string,
): Promise<void> {
  if (postWin.startedAt === null) {
    postWin.startedAt = Date.now();
    postWin.startTurn = turn;
    await emitPostWinObservation(runId, "post_win_sweep_started", turn, { trigger });
  }
}

async function maybeUpdatePostWin(
  runId: string,
  postWin: PostWinState,
  turn: number,
  text: string,
): Promise<void> {
  const normalized = normalizeText(text);
  if (looksLikeWin(normalized)) {
    await startPostWinSweep(runId, postWin, turn, "action_intent");
  }
  if (postWin.startedAt === null) return;

  if (!postWin.nextLevelChecked && looksLikeNextLevel(normalized)) {
    postWin.nextLevelChecked = true;
    await emitPostWinObservation(runId, "post_win_next_level_checked", turn, { text });
  }
  if (!postWin.replayChecked && looksLikeReplay(normalized)) {
    postWin.replayChecked = true;
    await emitPostWinObservation(runId, "post_win_replay_checked", turn, { text });
  }
}

function shouldNudgePostWin(postWin: PostWinState, text: string | null): boolean {
  return postWin.startedAt === null && !postWin.nudgeSent && text !== null && looksLikeWin(normalizeText(text));
}

function postWinSweepExpired(postWin: PostWinState, turn: number): boolean {
  if (postWin.startedAt === null || postWin.startTurn === null) return false;
  return turn - postWin.startTurn >= POST_WIN_MAX_TURNS || Date.now() - postWin.startedAt >= POST_WIN_MAX_MS;
}

async function emitPostWinObservation(
  runId: string,
  message: string,
  turn: number,
  data: Record<string, unknown>,
): Promise<void> {
  await emitEvent({
    run_id: runId,
    node: "playtest",
    type: "observation",
    message,
    screenshot_url: null,
    data: { turn, ...data },
  });
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looksLikeWin(text: string): boolean {
  return text.includes("victoire") || text.includes("victory") || text.includes("win") || text.includes("niveau suivant");
}

function looksLikeNextLevel(text: string): boolean {
  return text.includes("suivant") || text.includes("next level") || text.includes("level 2");
}

function looksLikeReplay(text: string): boolean {
  return text.includes("rejouer") || text.includes("reessayer") || text.includes("replay") || text.includes("restart");
}

async function emitTimingSummary(args: {
  runId: string;
  startedAt: number;
  playBudgetMs: number;
  turn: number;
  terminationReason: TerminationReason;
  partial: boolean;
  timings: TimingStats;
  usedFastReport: boolean;
}): Promise<void> {
  const totalMs = Date.now() - args.startedAt;
  const cuTotalMs = sum(args.timings.cuLatenciesMs);
  const actionTotalMs = sum(args.timings.actionLatenciesMs);
  const captureTotalMs = sum(args.timings.captureLatenciesMs);
  await emitEvent({
    run_id: args.runId,
    node: "playtest",
    type: "observation",
    message: "playtest_timing_summary",
    screenshot_url: null,
    data: {
      total_ms: totalMs,
      setup_ms: args.timings.setupMs,
      play_loop_ms: Math.max(0, totalMs - args.timings.setupMs - args.timings.cleanupMs - args.timings.reportMs),
      report_ms: args.timings.reportMs,
      cleanup_ms: args.timings.cleanupMs,
      turns: args.turn,
      termination_reason: args.terminationReason,
      partial: args.partial,
      budget_ms: args.playBudgetMs,
      budget_remaining_ms: Math.max(0, args.playBudgetMs - totalMs),
      cu_total_ms: cuTotalMs,
      cu_p50_ms: percentile(args.timings.cuLatenciesMs, 0.5),
      cu_p95_ms: percentile(args.timings.cuLatenciesMs, 0.95),
      action_total_ms: actionTotalMs,
      capture_total_ms: captureTotalMs,
      screenshot_upload_successes: args.timings.screenshotUploadSuccesses,
      screenshot_upload_failures: args.timings.screenshotUploadFailures,
      used_fast_report: args.usedFastReport,
    },
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(values: number[], rank: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * rank) - 1));
  return sorted[index] ?? null;
}

async function emitUsage(
  runId: string,
  turn: number,
  step: Awaited<ReturnType<typeof cuStep>>,
): Promise<void> {
  const costUsd = estimateCostUsd(step.interaction.usage);
  await emitEvent({
    run_id: runId,
    node: "playtest",
    type: "observation",
    message: "cu_usage",
    screenshot_url: null,
    data: {
      turn,
      latency_ms: step.latencyMs,
      model: step.model,
      attempt_count: step.attemptCount,
      timeout_ms: step.timeoutMs,
      remaining_budget_ms_before: step.remainingBudgetMsBefore,
      previous_interaction_id_present: turn > 0,
      success: true,
      requested_service_tier: step.requestedServiceTier,
      actual_service_tier: step.actualServiceTier,
      service_tier_downgraded: step.actualServiceTier !== null && step.actualServiceTier !== step.requestedServiceTier,
      estimated_cost_usd: costUsd,
      usage: step.interaction.usage ?? null,
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
