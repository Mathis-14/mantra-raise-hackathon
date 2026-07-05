// Local demo stack runner — reads scripts/stack.yaml, frees each service's port,
// then launches and health-checks every service in order (worker last).
//
//   npm run stack           clear ports + launch everything
//   npm run stack -- --down clear ports only (stop the stack)
//
// The YAML is parsed with a minimal reader for exactly the schema documented in
// stack.yaml — no dependency needed for a fixed config we own.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const serviceSchema = z.object({
  name: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65_535),
  command: z.string().min(1),
  log: z.string().min(1),
  health: z.string().url(),
  startup_timeout_s: z.coerce.number().int().min(1).max(300),
});

type Service = z.infer<typeof serviceSchema>;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STACK_FILE = path.join(REPO_ROOT, "scripts", "stack.yaml");
const PORT_FREE_TIMEOUT_MS = 6_000;
const HEALTH_POLL_MS = 750;

async function main(): Promise<void> {
  const downOnly = process.argv.includes("--down");
  const services = parseStackYaml(readFileSync(STACK_FILE, "utf8"));

  for (const service of services) {
    await freePort(service);
  }
  if (downOnly) {
    console.info("stack_down: all service ports cleared");
    return;
  }

  for (const service of services) {
    launch(service);
    const healthy = await waitHealthy(service);
    if (!healthy) {
      console.error(`stack_failed: ${service.name} did not answer ${service.health} within ${service.startup_timeout_s}s — check ${service.log}`);
      process.exit(1);
    }
    console.info(`stack_up: ${service.name} on :${service.port} (log: ${service.log})`);
  }

  console.info("stack_ready: upload a game at http://127.0.0.1:5175/");
}

function parseStackYaml(source: string): Service[] {
  const rawServices: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    if (line.trim() === "services:") continue;

    const itemMatch = /^\s*-\s+(\w+):\s*(.+)$/.exec(line);
    if (itemMatch?.[1] && itemMatch[2] !== undefined) {
      current = { [itemMatch[1]]: itemMatch[2].trim() };
      rawServices.push(current);
      continue;
    }

    const fieldMatch = /^\s+(\w+):\s*(.+)$/.exec(line);
    if (fieldMatch?.[1] && fieldMatch[2] !== undefined && current) {
      current[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }

  const services = rawServices.map((raw) => serviceSchema.parse(raw));
  if (services.length === 0) throw new Error("stack.yaml defines no services");
  return services;
}

async function freePort(service: Service): Promise<void> {
  const pids = listenerPids(service.port);
  if (pids.length === 0) return;

  console.info(`stack_clear: killing ${pids.join(", ")} holding :${service.port} (${service.name})`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }

  const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (listenerPids(service.port).length === 0) return;
    await sleep(300);
  }
  for (const pid of listenerPids(service.port)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  await sleep(300);
  if (listenerPids(service.port).length > 0) {
    throw new Error(`port_still_in_use: ${service.port} (${service.name})`);
  }
}

function listenerPids(port: number): number[] {
  try {
    const out = execFileSync("lsof", ["-tnP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return out
      .split("\n")
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return []; // lsof exits non-zero when nothing listens
  }
}

function launch(service: Service): void {
  const child = spawn("sh", ["-c", `${service.command} >> ${service.log} 2>&1`], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function waitHealthy(service: Service): Promise<boolean> {
  const deadline = Date.now() + service.startup_timeout_s * 1_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(service.health, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return true;
    } catch {
      // not up yet
    }
    await sleep(HEALTH_POLL_MS);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error("stack_crashed", error instanceof Error ? error.message : error);
  process.exit(1);
});
