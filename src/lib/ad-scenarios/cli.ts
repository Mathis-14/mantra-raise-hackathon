// Executable CLI for the ad-scenarios toolkit (run via tsx).
// Commands: list | create [--trend "…"] [--name x] | record <file.json>
//           [--seconds 25] [--port 5173] | url <file.json>
// Usage: npm run variant -- create --trend "fail bait"

import {
  AdScenarioError,
  DEFAULT_GAME_PORT,
  buildPlayUrl,
  composeVariant,
  listBlocks,
  loadVariant,
  recordVariant,
  saveVariant,
} from "./index";

interface Flags {
  positional: string[];
  values: Map<string, string>;
}

function parseArgs(argv: string[]): Flags {
  const positional: string[] = [];
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        values.set(key, next);
        i += 1;
      } else {
        values.set(key, "true");
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, values };
}

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

async function cmdList(): Promise<void> {
  const blocks = listBlocks();
  process.stdout.write("Skins:     " + blocks.skins.join(", ") + "\n");
  process.stdout.write("Loadouts:  " + blocks.loadouts.join(", ") + "\n");
  process.stdout.write("Wall kinds:" + " " + blocks.wallKinds.join(", ") + "\n");
  process.stdout.write("Hazards:   " + blocks.hazardTypes.join(", ") + "\n\n");
  process.stdout.write("Mechanic focus (ad angles):\n");
  for (const m of blocks.mechanicFocus) {
    process.stdout.write(`  - ${m.focus}: ${m.rationale}\n`);
  }
  process.stdout.write("\nRanges:\n");
  const r = blocks.ranges;
  process.stdout.write(`  startLevel ${r.startLevel[0]}..${r.startLevel[1]}\n`);
  process.stdout.write(`  wall x ${r.wallX[0]}..${r.wallX[1]}, z ${r.wallZ[0]}..${r.wallZ[1]}, halfW ${r.wallHalfW[0]}..${r.wallHalfW[1]}, halfD ${r.wallHalfD[0]}..${r.wallHalfD[1]} (max ${r.maxWalls})\n`);
  process.stdout.write(`  hazards max ${r.maxHazards}, lanesX ${r.lanesX[0]}..${r.lanesX[1]}\n`);
  process.stdout.write(`  hordeMult ${r.hordeMult[0]}..${r.hordeMult[1]}, wavePressure ${r.wavePressure[0]}..${r.wavePressure[1]}, intensity ${r.intensity[0]}..${r.intensity[1]}\n`);
}

async function cmdCreate(flags: Flags): Promise<void> {
  const trend = flags.values.get("trend");
  const name = flags.values.get("name");
  const composed = await composeVariant({
    trend: trend === "true" ? undefined : trend,
    name: name === "true" ? undefined : name,
  });
  const { path, saved } = await saveVariant(composed);
  process.stdout.write(`created: ${saved.name}\n`);
  process.stdout.write(`focus:   ${composed.scenario.mechanicFocus} (source: ${composed.meta.source})\n`);
  process.stdout.write(`file:    ${path}\n`);
  process.stdout.write(`playUrl: ${saved.playUrl}\n`);
  process.stdout.write(`record:  npm run variant -- record ${path}\n`);
}

async function cmdRecord(flags: Flags): Promise<void> {
  const file = flags.positional[0];
  if (!file) fail("record needs a variant file: record <file.json>");
  const seconds = flags.values.has("seconds") ? Number(flags.values.get("seconds")) : undefined;
  const port = flags.values.has("port") ? Number(flags.values.get("port")) : undefined;
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) {
    fail("--seconds must be a positive number");
  }
  if (port !== undefined && !Number.isInteger(port)) fail("--port must be an integer");
  process.stdout.write(`recording ${file} for ${seconds ?? "default"}s...\n`);
  const out = await recordVariant(file, { seconds, port });
  process.stdout.write(`video:   ${out}\n`);
}

async function cmdUrl(flags: Flags): Promise<void> {
  const file = flags.positional[0];
  if (!file) fail("url needs a variant file: url <file.json>");
  const variant = await loadVariant(file);
  const port = flags.values.has("port") ? Number(flags.values.get("port")) : DEFAULT_GAME_PORT;
  process.stdout.write(buildPlayUrl(variant.config, { port, autostart: true }) + "\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = parseArgs(args.slice(1));
  switch (command) {
    case "list":
      await cmdList();
      break;
    case "create":
      await cmdCreate(flags);
      break;
    case "record":
      await cmdRecord(flags);
      break;
    case "url":
      await cmdUrl(flags);
      break;
    default:
      process.stderr.write(
        "usage: variant <list | create [--trend \"…\"] [--name x] | record <file.json> [--seconds N] [--port N] | url <file.json>>\n",
      );
      process.exit(command ? 1 : 0);
  }
}

main().catch((error: unknown) => {
  if (error instanceof AdScenarioError) fail(error.message);
  fail(error instanceof Error ? error.message : String(error));
});
