// owner: Tom — pipeline controller.
//
// Contract: a single long-running loop (started by src/worker/index.ts) that
//   1. claims runs whose status has a worker-owned next step (created,
//      generating_variants, generating_creatives, deploying, measuring, deciding
//      — NOT awaiting_approval, which only the dashboard button advances),
//   2. executes the matching node from src/nodes/*,
//   3. persists the node's output, emits a "status" event, and advances the run
//      via canTransition() — never set a status the transition map forbids,
//   4. on node error: status → failed with failed_step set, emit an "error"
//      event, and keep looping — one broken run must not stop the worker.

import { canTransition, RUN_STATUSES, type PlaytestReport, type RunStatus } from "@/contracts/types";
import { emitEvent } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";
import { runPlaytest } from "@/nodes/playtest";
import { runVariantStep } from "@/orchestrator/variant-step";

const POLL_MS = 2_000;
const PLAYTEST_BUDGET_S = 120;

interface RunCandidate {
  id: string;
  projectId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseRunCandidate(value: unknown): RunCandidate | null {
  return parseRunCandidateForStatus(value, "created");
}

function parseRunCandidateForStatus(value: unknown, expectedStatus: RunStatus): RunCandidate | null {
  if (!isRecord(value)) return null;

  const id = readString(value, "id");
  const projectId = readString(value, "project_id");
  const status = readString(value, "status");
  if (!id || !projectId || status !== expectedStatus) return null;

  return { id, projectId };
}

function parseClaimedRun(value: unknown): RunCandidate | null {
  if (!isRecord(value)) return null;

  const id = readString(value, "id");
  const projectId = readString(value, "project_id");
  const status = readString(value, "status");
  if (!id || !projectId || status !== "playtesting") return null;

  return { id, projectId };
}

function parseGameUrl(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return readString(value, "game_url");
}

function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal_transition: ${from} -> ${to}`);
  }
}

async function claimNextCreatedRun(): Promise<RunCandidate | null> {
  const supabase = supabaseAdmin();
  const { data: candidates, error: readError } = await supabase
    .from("runs")
    .select("id, project_id, status")
    .eq("status", "created")
    .order("created_at", { ascending: false })
    .limit(1);

  if (readError) throw new Error(readError.message);

  const candidate = (Array.isArray(candidates) ? candidates : [])
    .map(parseRunCandidate)
    .find((run) => run !== null);

  if (!candidate) return null;

  assertTransition("created", "playtesting");
  const { data: claimed, error: claimError } = await supabase
    .from("runs")
    .update({
      status: "playtesting",
      failed_step: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("status", "created")
    .select("id, project_id, status")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  return parseClaimedRun(claimed);
}

async function readNextVariantRun(): Promise<RunCandidate | null> {
  const { data, error } = await supabaseAdmin()
    .from("runs")
    .select("id, project_id, status")
    .eq("status", "generating_variants")
    .order("updated_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);

  return (Array.isArray(data) ? data : [])
    .map((row) => parseRunCandidateForStatus(row, "generating_variants"))
    .find((run) => run !== null) ?? null;
}

async function readProjectGameUrl(projectId: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("game_url")
    .eq("id", projectId)
    .single();

  if (error) throw new Error(error.message);

  const gameUrl = parseGameUrl(data);
  if (!gameUrl) throw new Error(`project_missing_game_url: ${projectId}`);
  return gameUrl;
}

async function persistPlaytestReport(report: PlaytestReport): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("playtest_reports")
    .upsert({
      run_id: report.run_id,
      playable: report.playable,
      fun_score: report.fun_score,
      fun_rationale: report.fun_rationale,
      friction_points: report.friction_points,
      bugs: report.bugs,
      session_summary: report.session_summary,
      headline: report.headline,
    });

  if (error) throw new Error(error.message);
}

async function advanceRun(runId: string, from: RunStatus, to: RunStatus): Promise<void> {
  assertTransition(from, to);
  const { error } = await supabaseAdmin()
    .from("runs")
    .update({
      status: to,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("status", from);

  if (error) throw new Error(error.message);
}

async function failRun(runId: string, failedStep: RunStatus, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const validFailedStep: RunStatus = RUN_STATUSES.includes(failedStep) ? failedStep : "failed";

  await supabaseAdmin()
    .from("runs")
    .update({
      status: "failed",
      failed_step: validFailedStep,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  await emitEvent({
    run_id: runId,
    node: "orchestrator",
    type: "error",
    message,
    screenshot_url: null,
    data: { failed_step: validFailedStep },
  });
}

async function processVariantRun(run: RunCandidate): Promise<void> {
  try {
    const variantCount = await runVariantStep(run);
    await advanceRun(run.id, "generating_variants", "generating_creatives");
    await emitEvent({
      run_id: run.id,
      node: "variants",
      type: "status",
      message: "variants_persisted",
      screenshot_url: null,
      data: { count: variantCount },
    });
  } catch (error) {
    await failRun(run.id, "generating_variants", error);
  }
}

async function processPlaytest(run: RunCandidate): Promise<void> {
  const gameUrl = await readProjectGameUrl(run.projectId);

  await emitEvent({
    run_id: run.id,
    node: "orchestrator",
    type: "status",
    message: "playtesting_started",
    screenshot_url: null,
    data: { game_url: gameUrl, live_stream_url: `http://127.0.0.1:4317/runs/${run.id}/stream` },
  });

  try {
    const report = await runPlaytest({
      runId: run.id,
      gameUrl,
      timeBudgetS: PLAYTEST_BUDGET_S,
      recordVideo: false,
    });

    await persistPlaytestReport(report);
    await advanceRun(run.id, "playtesting", "awaiting_approval");
    await emitEvent({
      run_id: run.id,
      node: "orchestrator",
      type: "status",
      message: "playtest_complete_awaiting_approval",
      screenshot_url: null,
      data: { headline: report.headline, fun_score: report.fun_score },
    });
  } catch (error) {
    await failRun(run.id, "playtesting", error);
  }
}

export async function runOrchestrator(): Promise<void> {
  console.info("orchestrator_started", { poll_ms: POLL_MS, playtest_budget_s: PLAYTEST_BUDGET_S });

  while (true) {
    try {
      const run = await claimNextCreatedRun();
      if (run) {
        await processPlaytest(run);
        continue;
      }

      const variantRun = await readNextVariantRun();
      if (variantRun) {
        await processVariantRun(variantRun);
        continue;
      }
    } catch (error) {
      console.error("orchestrator_loop_error", error);
    }

    await sleep(POLL_MS);
  }
}
