// Agent-facing toolkit: inspect blocks, compose a variant from a trend +
// inspiration, persist it as a rejouable JSON, and record a 9:16 gameplay clip
// with Playwright. All persistence is local; recording drives the already-
// running game server (never launches it). Failures surface as AdScenarioError.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { z } from "zod";
import {
  AdScenarioError,
  ASPECT,
  savedVariantSchema,
  type AdScenarioSpec,
  type SavedVariant,
  type VariantConfig,
} from "./schema";
import { blockCatalog, type BlockCatalog } from "./vocabulary";
import { composeScenario } from "./compose";
import { loadInspiration } from "./inspiration";
import { buildPlayUrl, encodeVariant, resolveVariantConfig, DEFAULT_GAME_PORT } from "./mutation";

export const DEFAULT_INSPIRATION_DIR = "references/ads-inspo";
export const DEFAULT_VARIANTS_DIR = "generated-variants";
export const DEFAULT_RECORD_SECONDS = 25;
// 9:16 at a size Playwright records reliably and the game renders crisply.
export const RECORD_VIEWPORT = { width: 405, height: 720 } as const;

/** Readable catalogue so an agent knows what it can compose. */
export function listBlocks(): BlockCatalog {
  return blockCatalog();
}

export interface ComposeVariantOptions {
  trend?: string;
  name?: string;
  inspirationDir?: string;
}

export interface ComposedVariant {
  scenario: AdScenarioSpec;
  config: VariantConfig;
  meta: {
    name: string;
    trend: string | null;
    source: "gemini" | "template";
    inspirationDir: string;
    assetCount: number;
    noteCount: number;
  };
}

/**
 * Reads inspiration, composes an AdScenarioSpec (Gemini if a key is present,
 * deterministic template otherwise), and resolves it to a game-legal config.
 */
export async function composeVariant(options: ComposeVariantOptions = {}): Promise<ComposedVariant> {
  const trend = options.trend?.trim() ? options.trend.trim() : null;
  const inspirationDir = options.inspirationDir ?? DEFAULT_INSPIRATION_DIR;
  const inspiration = await loadInspiration(inspirationDir);
  const { scenario, source } = await composeScenario({ trend, inspiration });
  const config = resolveVariantConfig(scenario);
  const name = options.name?.trim() ? options.name.trim() : defaultName(scenario, trend);
  return {
    scenario,
    config,
    meta: {
      name,
      trend,
      source,
      inspirationDir,
      assetCount: inspiration.assets.length,
      noteCount: inspiration.notes.length,
    },
  };
}

function defaultName(scenario: AdScenarioSpec, trend: string | null): string {
  const base = trend ?? scenario.mechanicFocus.replace(/_/g, " ");
  return base.slice(0, 60);
}

/**
 * Writes a rejouable variant to <dir>/<id>.json and returns the absolute path.
 * The saved record carries a precomputed playUrl and recording block, so the
 * JSON alone is enough to replay or record later.
 */
export async function saveVariant(
  v: ComposedVariant,
  dir: string = DEFAULT_VARIANTS_DIR,
): Promise<{ path: string; saved: SavedVariant }> {
  const id = randomUUID();
  const seconds = DEFAULT_RECORD_SECONDS;
  const recordUrl = buildPlayUrl(v.config, { port: DEFAULT_GAME_PORT, autostart: true });
  const candidate = {
    id,
    name: v.meta.name,
    created_at: new Date().toISOString(),
    trend: v.meta.trend,
    hypothesis: v.scenario.hypothesis,
    scenario: v.scenario,
    config: v.config,
    playUrl: buildPlayUrl(v.config, { port: DEFAULT_GAME_PORT }),
    recording: { url: recordUrl, seconds, aspect: ASPECT },
  };
  const parsed = savedVariantSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AdScenarioError("persist", z.prettifyError(parsed.error), { cause: parsed.error });
  }

  const outDir = resolve(dir);
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, `${id}.json`);
  await writeFile(path, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  return { path, saved: parsed.data };
}

/** Loads and validates a saved variant. Never falls back silently — bad file throws. */
export async function loadVariant(path: string): Promise<SavedVariant> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new AdScenarioError("persist", `cannot read variant file ${path}`, { cause: error });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new AdScenarioError("persist", `variant file is not valid JSON: ${path}`, {
      cause: error,
    });
  }
  const parsed = savedVariantSchema.safeParse(json);
  if (!parsed.success) {
    throw new AdScenarioError("persist", z.prettifyError(parsed.error), { cause: parsed.error });
  }
  return parsed.data;
}

// --- Recording --------------------------------------------------------------

export interface RecordOptions {
  seconds?: number;
  port?: number;
  /** Output .webm path; defaults to <id>.webm next to the JSON. */
  out?: string;
}

const SERVER_PROBE_TIMEOUT_MS = 3_000;
const LIVENESS_POLL_MS = 1_000;
// Global time-box headroom over the requested duration (launch + teardown).
const TEARDOWN_HEADROOM_MS = 30_000;

/**
 * Records a 9:16 gameplay clip of a saved variant with headless chromium.
 * Requires the game server to already be up on the port (never starts it) and
 * the config to set autoplay:true so the bot plays. Returns the .webm path.
 */
export async function recordVariant(
  variantPath: string,
  options: RecordOptions = {},
): Promise<string> {
  const variant = await loadVariant(variantPath);
  const seconds = options.seconds ?? variant.recording.seconds;
  const port = options.port ?? DEFAULT_GAME_PORT;
  const outPath = options.out ?? variantPath.replace(/\.json$/, ".webm");

  if (variant.config.autoplay !== true) {
    throw new AdScenarioError(
      "record",
      "config.autoplay must be true for a recording (the bot needs to play)",
    );
  }

  await ensureServerUp(port);
  const url = buildPlayUrl(variant.config, { port, autostart: true });
  const recordDir = join(dirname(resolve(outPath)), `.record-${variant.id}`);
  await mkdir(recordDir, { recursive: true });

  const deadline = Date.now() + seconds * 1000 + TEARDOWN_HEADROOM_MS; // global time-box
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { ...RECORD_VIEWPORT },
      recordVideo: { dir: recordDir, size: { ...RECORD_VIEWPORT } },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });

    const stopAt = Math.min(Date.now() + seconds * 1000, deadline);
    while (Date.now() < stopAt) {
      await page.waitForTimeout(LIVENESS_POLL_MS);
      const alive = await page.evaluate(() => document.visibilityState !== "hidden").catch(() => false);
      if (!alive) throw new AdScenarioError("record", "game page went unresponsive during recording");
    }

    const video = page.video();
    await context.close(); // flushes the video file
    if (!video) throw new AdScenarioError("record", "no video captured (recordVideo not active)");
    const tmp = await video.path();
    await rename(tmp, outPath);
    return outPath;
  } finally {
    await browser.close().catch(() => undefined);
    await cleanupDir(recordDir);
  }
}

async function ensureServerUp(port: number): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(SERVER_PROBE_TIMEOUT_MS),
    });
    if (!res.ok && res.status >= 500) throw new Error(`status ${res.status}`);
  } catch (error) {
    throw new AdScenarioError(
      "record",
      `game server not reachable on :${port} — lance \`npm run game\` d'abord`,
      { cause: error },
    );
  }
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    const leftovers = await readdir(dir);
    if (leftovers.length === 0) {
      const { rmdir } = await import("node:fs/promises");
      await rmdir(dir);
    }
  } catch {
    // best-effort cleanup; a leftover temp dir is not fatal
  }
}

export { encodeVariant };
