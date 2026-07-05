import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { PlaytestReport, Variant } from "@/contracts/types";
import { emitEvent } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";
import { generateVariants, prepareVariantSourceHtml } from "@/nodes/variants";

const VARIANT_COUNT = 5;
const GAME_HTML_FETCH_TIMEOUT_MS = 15_000;

export interface VariantRun {
  id: string;
  projectId: string;
}

interface ProjectSource {
  gameUrl: string;
  marketContext: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function parseProjectSource(value: unknown): ProjectSource | null {
  if (!isRecord(value)) return null;
  const gameUrl = readString(value, "game_url");
  const marketContext = readString(value, "market_context");
  if (!gameUrl) return null;
  return { gameUrl, marketContext };
}

function parsePlaytestReport(value: unknown): PlaytestReport | null {
  if (!isRecord(value)) return null;

  const runId = readString(value, "run_id");
  const playable = readBoolean(value, "playable");
  const funScore = readNumber(value, "fun_score");
  const funRationale = readString(value, "fun_rationale");
  const sessionSummary = readString(value, "session_summary");
  const headline = readString(value, "headline");

  if (
    !runId
    || playable === null
    || funScore === null
    || !funRationale
    || !sessionSummary
    || !headline
  ) {
    return null;
  }

  return {
    run_id: runId,
    playable,
    fun_score: funScore,
    fun_rationale: funRationale,
    friction_points: readStringArray(value, "friction_points"),
    bugs: readStringArray(value, "bugs"),
    session_summary: sessionSummary,
    headline,
  };
}

export async function runVariantStep(run: VariantRun): Promise<number> {
  const project = await readProjectSource(run.projectId);

  await emitEvent({
    run_id: run.id,
    node: "variants",
    type: "status",
    message: "variant_generation_started",
    screenshot_url: null,
    data: { count: VARIANT_COUNT, game_url: project.gameUrl },
  });

  const [report, sourceHtml] = await Promise.all([
    readPlaytestReport(run.id),
    readSourceGameHtml(project.gameUrl),
  ]);
  const gameHtml = prepareVariantSourceHtml(sourceHtml, project.gameUrl);
  const variants = await generateVariants({
    runId: run.id,
    gameHtml,
    report,
    marketContext: project.marketContext,
    count: VARIANT_COUNT,
  });

  await persistVariants(variants);

  for (const variant of variants) {
    await emitEvent({
      run_id: run.id,
      node: "variants",
      type: "action",
      message: `variant_generated:${variant.name}`,
      screenshot_url: null,
      data: { variant_id: variant.id, hypothesis: variant.hypothesis },
    });
  }

  return variants.length;
}

async function readProjectSource(projectId: string): Promise<ProjectSource> {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("game_url, market_context")
    .eq("id", projectId)
    .single();

  if (error) throw new Error(error.message);

  const project = parseProjectSource(data);
  if (!project) throw new Error(`project_missing_source: ${projectId}`);
  return project;
}

async function readPlaytestReport(runId: string): Promise<PlaytestReport> {
  const { data, error } = await supabaseAdmin()
    .from("playtest_reports")
    .select("*")
    .eq("run_id", runId)
    .single();

  if (error) throw new Error(error.message);

  const report = parsePlaytestReport(data);
  if (!report) throw new Error(`playtest_report_malformed: ${runId}`);
  return report;
}

async function readSourceGameHtml(gameUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(gameUrl);
  } catch (error) {
    throw new Error(`invalid_game_url: ${gameUrl}`, { cause: error });
  }

  if (url.protocol === "file:") {
    return readFile(fileURLToPath(url), "utf8");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported_game_url_protocol: ${url.protocol}`);
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(GAME_HTML_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`game_html_fetch_failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (html.trim().length === 0) throw new Error("game_html_empty");
  return html;
}

async function persistVariants(variants: readonly Variant[]): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("variants")
    .insert(variants.map((variant) => ({
      id: variant.id,
      run_id: variant.run_id,
      name: variant.name,
      hypothesis: variant.hypothesis,
      game_html: variant.game_html,
      created_at: variant.created_at,
    })));

  if (error) throw new Error(error.message);
}
