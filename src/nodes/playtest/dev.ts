import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";

import { runPlaytest } from "./index";

const argsSchema = z.object({
  game: z.string().min(1),
  budget: z.coerce.number().int().min(45).max(600).default(180),
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gameUrl = toGameUrl(args.game);
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
  console.log("Do not approve dev: runs in the dashboard.");

  const report = await runPlaytest({
    runId: run.id,
    gameUrl,
    timeBudgetS: args.budget,
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
    }
  }
  return argsSchema.parse(values);
}

function readNext(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function toGameUrl(game: string): string {
  if (game.startsWith("http://") || game.startsWith("https://") || game.startsWith("file://")) {
    return game;
  }
  return pathToFileURL(path.resolve(game)).toString();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
