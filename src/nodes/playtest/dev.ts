import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";

import { runPlaytest } from "./index";

const VITE_GAME_ALIASES = new Set(["vite", "npm", "game-server"]);
const VITE_GAME_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180] as const;

const argsSchema = z.object({
  game: z.string().min(1),
  budget: z.coerce.number().int().min(45).max(600).default(180),
  recordVideo: z.union([z.boolean(), z.enum(["true", "false"])]).default(true).transform((value) => value === true || value === "true"),
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gameUrl = await toGameUrl(args.game);
  const supabase = supabaseAdmin();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: `dev: playtest ${new Date().toISOString()}`,
      game_url: gameUrl,
      market_context: "Development playtest harness run.",
    })
    .select("id")
    .single();
  if (projectError) throw new Error(projectError.message);

  const { data: run, error: runError } = await supabase
    .from("runs")
    .insert({
      project_id: project.id,
      status: "playtesting",
      failed_step: null,
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  console.log(`dev_run_id=${run.id}`);
  console.log(`game_url=${gameUrl}`);
  console.log("Do not approve dev: runs in the dashboard.");

  const report = await runPlaytest({
    runId: run.id,
    gameUrl,
    timeBudgetS: args.budget,
    recordVideo: args.recordVideo,
  });
  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--game") {
      values.game = readNext(argv, index, token);
      index += 1;
    } else if (token === "--budget") {
      values.budget = readNext(argv, index, token);
      index += 1;
    } else if (token === "--no-record-video") {
      values.recordVideo = "false";
    } else if (token === "--record-video") {
      values.recordVideo = "true";
    }
  }
  return argsSchema.parse(values);
}

function readNext(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function toGameUrl(game: string): Promise<string> {
  const vitePort = parseVitePort(game);
  if (vitePort !== null) {
    return discoverViteGameUrl([vitePort]);
  }
  if (VITE_GAME_ALIASES.has(game)) {
    return discoverViteGameUrl(VITE_GAME_PORTS);
  }
  if (game.startsWith("http://") || game.startsWith("https://") || game.startsWith("file://")) {
    return game;
  }
  return pathToFileURL(path.resolve(game)).toString();
}

function parseVitePort(game: string): number | null {
  const match = /^vite:(\d+)$/.exec(game);
  if (!match?.[1]) return null;
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`invalid_vite_port: ${match[1]}`);
  }
  return port;
}

async function discoverViteGameUrl(ports: readonly number[]): Promise<string> {
  for (const port of ports) {
    const url = `http://127.0.0.1:${port}/`;
    if (await isViteGameRoot(url)) return url;
  }
  throw new Error(
    `vite_game_not_found: start npm run game, then retry --game vite:<port>. Checked ports ${ports.join(", ")}.`,
  );
}

async function isViteGameRoot(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("/src/main.js") && html.includes("id=\"startBtn\"");
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
