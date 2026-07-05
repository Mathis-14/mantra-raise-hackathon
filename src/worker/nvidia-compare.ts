import { readFile } from "node:fs/promises";

import { compareGameplayVersions } from "@/nodes/nvidia-analysis";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: npm run nvidia:compare -- <comparison-input.json>");
}

const input: unknown = JSON.parse(await readFile(inputPath, "utf8"));
const comparison = await compareGameplayVersions(input);
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
