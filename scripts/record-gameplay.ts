// Manual harness for src/lib/recording/gameplayRecorder.ts — records a fixed-length
// gameplay session for marketing footage. Start/stop is programmatic; agents
// call startGameplayRecording()/stop() directly instead of using this CLI.
//
// Usage:
//   node --import tsx scripts/record-gameplay.ts --game game/mob-control-clone.html --duration 30
//   node --import tsx scripts/record-gameplay.ts --game http://127.0.0.1:5173/ --duration 60
//
// A headed browser opens; play the game by hand until the duration elapses.
// The final .webm path is printed as video_saved=<path>.

import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { startGameplayRecording } from "../src/lib/recording/gameplayRecorder";

const argsSchema = z.object({
  game: z.string().min(1),
  duration: z.coerce.number().int().min(5).max(3_600).default(30),
  label: z
    .string()
    .regex(/^[a-z0-9-]+$/i, "label must be alphanumeric/dashes")
    .optional(),
  quality: z.enum(["high", "standard"]).default("high"),
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const gameUrl = toGameUrl(args.game);
  const label = args.label ?? new Date().toISOString().replace(/[:.]/g, "-");

  const recording = await startGameplayRecording({ gameUrl, label, quality: args.quality });
  console.log(
    `recording_started game_url=${gameUrl} duration_s=${args.duration} quality=${args.quality}`,
  );

  await new Promise((resolve) => setTimeout(resolve, args.duration * 1_000));

  const videoPath = await recording.stop();
  console.log(`video_saved=${videoPath}`);
  console.log(
    `Speed it up for the ad cut: ffmpeg -i "${videoPath}" -filter:v "setpts=PTS/4" -an gameplay-4x.mp4`,
  );
}

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--game") {
      values.game = readNext(argv, index, token);
      index += 1;
    } else if (token === "--duration") {
      values.duration = readNext(argv, index, token);
      index += 1;
    } else if (token === "--label") {
      values.label = readNext(argv, index, token);
      index += 1;
    } else if (token === "--quality") {
      values.quality = readNext(argv, index, token);
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
  if (/^(https?|file):\/\//.test(game)) return game;
  return pathToFileURL(path.resolve(game)).toString();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
