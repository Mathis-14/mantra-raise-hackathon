import type { PlaytestInput, PlaytestReport } from "@/contracts/types";
import { emitEvent } from "@/lib/events";

import {
  CU_MODEL_PRIMARY,
  MIN_TURNS_FOR_REPORT,
  REPORT_GRACE_S,
  SESSION_START_STAGGER_MS,
  SITUATION_COUNT,
} from "./config";
import { buildReport } from "./report";
import { runPlaytestSession, type SessionResult } from "./session";
import type { TerminationReason, TranscriptEntry } from "./types";

export async function runPlaytest(input: PlaytestInput): Promise<PlaytestReport> {
  const startedAt = Date.now();
  const playBudgetMs = Math.max(10_000, (input.timeBudgetS - REPORT_GRACE_S) * 1_000);
  const playDeadline = startedAt + playBudgetMs;

  await emitEvent({
    run_id: input.runId,
    node: "playtest",
    type: "observation",
    message: "playtest_started",
    screenshot_url: null,
    data: {
      game_url: input.gameUrl,
      time_budget_s: input.timeBudgetS,
      model: CU_MODEL_PRIMARY,
      situations: SITUATION_COUNT,
    },
  });

  // One CU session per situation card, each playing the game started at ?level=N.
  // Sessions run in parallel against a shared wall-clock deadline; the stagger
  // spreads the initial Gemini burst.
  const settled = await Promise.allSettled(
    Array.from({ length: SITUATION_COUNT }, (_, index) => {
      const situation = index + 1;
      return delay(index * SESSION_START_STAGGER_MS).then(() =>
        runPlaytestSession({
          runId: input.runId,
          situation,
          gameUrl: withLevelParam(input.gameUrl, situation),
          playDeadline,
          recordVideo: input.recordVideo,
        }),
      );
    }),
  );

  const results: SessionResult[] = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
      continue;
    }
    await emitEvent({
      run_id: input.runId,
      node: "playtest",
      type: "error",
      message: "playtest_session_failed",
      screenshot_url: null,
      data: {
        situation: index + 1,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      },
    });
  }

  if (results.length === 0) {
    throw new Error("playtest_all_sessions_failed");
  }

  const mergedTranscript = mergeTranscripts(results);
  const partial = results.some((result) => result.partial) || results.length < SITUATION_COUNT;
  const terminationReason = dominantTermination(results);

  await emitEvent({
    run_id: input.runId,
    node: "playtest",
    type: "observation",
    message: `session_ended: ${terminationReason}`,
    screenshot_url: null,
    data: {
      turns: totalTurns(results),
      partial,
      sessions_completed: results.length,
      sessions_planned: SITUATION_COUNT,
    },
  });

  if (mergedTranscript.length < MIN_TURNS_FOR_REPORT) {
    throw new Error("playtest_cu_failed_before_minimum_turns");
  }

  const reportStartedAt = Date.now();
  const report = await buildReport({
    runId: input.runId,
    transcript: mergedTranscript,
    frames: results.flatMap((result) => result.frames),
    terminationReason,
    selfVerdict: mergedSelfVerdict(results),
    partial,
  });
  const reportMs = Date.now() - reportStartedAt;

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
    reportMs,
    terminationReason,
    partial,
    results,
  });

  return report;
}

function withLevelParam(gameUrl: string, level: number): string {
  const url = new URL(gameUrl);
  url.searchParams.set("level", String(level));
  return url.toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Label each session's entries so the report model can reason per level.
function mergeTranscripts(results: SessionResult[]): TranscriptEntry[] {
  return results.flatMap((result) =>
    result.transcript.map((entry) => ({
      ...entry,
      action: `[level ${result.situation}] ${entry.action}`,
    })),
  );
}

function mergedSelfVerdict(results: SessionResult[]): string | null {
  const verdicts = results
    .filter((result) => result.selfVerdict)
    .map((result) => `Level ${result.situation}: ${result.selfVerdict}`);
  return verdicts.length > 0 ? verdicts.join("\n") : null;
}

function totalTurns(results: SessionResult[]): number {
  return results.reduce((total, result) => total + result.turns, 0);
}

function dominantTermination(results: SessionResult[]): TerminationReason {
  if (results.some((result) => result.terminationReason === "cu_error")) return "cu_error";
  const doneEarly = (reason: TerminationReason) => reason === "model_done" || reason === "game_cap";
  if (results.every((result) => doneEarly(result.terminationReason))) return "model_done";
  return "budget";
}

async function emitTimingSummary(args: {
  runId: string;
  startedAt: number;
  playBudgetMs: number;
  reportMs: number;
  terminationReason: TerminationReason;
  partial: boolean;
  results: SessionResult[];
}): Promise<void> {
  const totalMs = Date.now() - args.startedAt;
  const cuLatencies = args.results.flatMap((result) => result.timings.cuLatenciesMs);
  const actionTotalMs = sum(args.results.flatMap((result) => result.timings.actionLatenciesMs));
  const captureTotalMs = sum(args.results.flatMap((result) => result.timings.captureLatenciesMs));

  await emitEvent({
    run_id: args.runId,
    node: "playtest",
    type: "observation",
    message: "playtest_timing_summary",
    screenshot_url: null,
    data: {
      total_ms: totalMs,
      report_ms: args.reportMs,
      turns: totalTurns(args.results),
      termination_reason: args.terminationReason,
      partial: args.partial,
      budget_ms: args.playBudgetMs,
      budget_remaining_ms: Math.max(0, args.playBudgetMs - totalMs),
      sessions: args.results.map((result) => ({
        situation: result.situation,
        turns: result.turns,
        termination_reason: result.terminationReason,
        setup_ms: result.timings.setupMs,
        cleanup_ms: result.timings.cleanupMs,
        cu_total_ms: sum(result.timings.cuLatenciesMs),
      })),
      cu_total_ms: sum(cuLatencies),
      cu_p50_ms: percentile(cuLatencies, 0.5),
      cu_p95_ms: percentile(cuLatencies, 0.95),
      action_total_ms: actionTotalMs,
      capture_total_ms: captureTotalMs,
      screenshot_upload_successes: sum(args.results.map((result) => result.timings.screenshotUploadSuccesses)),
      screenshot_upload_failures: sum(args.results.map((result) => result.timings.screenshotUploadFailures)),
      used_fast_report: false,
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
