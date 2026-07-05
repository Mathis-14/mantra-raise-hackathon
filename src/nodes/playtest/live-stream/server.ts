import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { LiveEventName, LiveFramePayload, LiveStatusPayload } from "./types";

const LIVE_STREAM_PORT = 4317;
const LIVE_STREAM_HOST = "127.0.0.1";
const HEARTBEAT_MS = 15_000;

interface LiveClient {
  runId: string;
  response: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

let server: Server | null = null;
let serverStart: Promise<void> | null = null;
const clientsByRunId = new Map<string, Set<LiveClient>>();
// Keyed per (runId, situation) so a late-connecting client replays all five cards.
const latestFrameByRunSituation = new Map<string, LiveFramePayload>();
const latestStatusByRunSituation = new Map<string, LiveStatusPayload>();

function runSituationKey(runId: string, situation: number): string {
  return `${runId}:${situation}`;
}

export async function startPlaytestLiveStreamServer(): Promise<void> {
  if (server) return;
  if (serverStart) return serverStart;

  serverStart = new Promise((resolve, reject) => {
    const nextServer = createServer(handleRequest);
    // The bind doubles as a single-worker mutex: duplicate workers race run claims
    // and replay stale in-memory code, so fail loud instead of running silently.
    nextServer.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            "live_stream_port_in_use: another worker is already running — kill it before starting a new one",
          ),
        );
        return;
      }
      reject(error);
    });
    nextServer.listen(LIVE_STREAM_PORT, LIVE_STREAM_HOST, () => {
      server = nextServer;
      console.info("playtest_live_stream_started", {
        url: `http://${LIVE_STREAM_HOST}:${LIVE_STREAM_PORT}`,
      });
      resolve();
    });
  });

  return serverStart;
}

export function publishFrameToRun(runId: string, payload: LiveFramePayload): void {
  latestFrameByRunSituation.set(runSituationKey(runId, payload.situation), payload);
  publishToRun(runId, "frame", payload);
}

export function publishStatusToRun(runId: string, payload: LiveStatusPayload): void {
  latestStatusByRunSituation.set(runSituationKey(runId, payload.situation), payload);
  publishToRun(runId, "status", payload);
}

export function publishToRun(runId: string, eventName: LiveEventName, payload: unknown): void {
  const clients = clientsByRunId.get(runId);
  if (!clients) return;

  for (const client of clients) {
    writeSse(client.response, eventName, payload);
  }
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) {
    response.writeHead(403);
    response.end("origin_not_allowed");
    return;
  }

  if (request.method === "OPTIONS") {
    writeCorsHeaders(response, origin);
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${LIVE_STREAM_HOST}:${LIVE_STREAM_PORT}`);
  if (request.method === "GET" && url.pathname === "/health") {
    writeCorsHeaders(response, origin);
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const runId = readRunId(url.pathname);
  if (request.method !== "GET" || !runId) {
    writeCorsHeaders(response, origin);
    response.writeHead(404);
    response.end("not_found");
    return;
  }

  connectClient(runId, response, origin);
}

function connectClient(runId: string, response: ServerResponse, origin: string | undefined): void {
  writeCorsHeaders(response, origin);
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write("retry: 1000\n\n");

  const client: LiveClient = {
    runId,
    response,
    heartbeat: setInterval(() => {
      response.write(`: ping ${Date.now()}\n\n`);
    }, HEARTBEAT_MS),
  };

  const clients = clientsByRunId.get(runId) ?? new Set<LiveClient>();
  clients.add(client);
  clientsByRunId.set(runId, clients);

  for (const [key, status] of latestStatusByRunSituation) {
    if (key.startsWith(`${runId}:`)) writeSse(response, "status", status);
  }
  for (const [key, frame] of latestFrameByRunSituation) {
    if (key.startsWith(`${runId}:`)) writeSse(response, "frame", frame);
  }

  response.on("close", () => {
    clearInterval(client.heartbeat);
    const currentClients = clientsByRunId.get(client.runId);
    currentClients?.delete(client);
    if (currentClients?.size === 0) clientsByRunId.delete(client.runId);
  });
}

function writeSse(response: ServerResponse, eventName: LiveEventName, payload: unknown): void {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeCorsHeaders(response: ServerResponse, origin: string | undefined): void {
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-origin", origin ?? "*");
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "Content-Type");
  response.setHeader("access-control-allow-private-network", "true");
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
      return url.protocol === "http:" || url.protocol === "https:";
    }

    return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function readRunId(pathname: string): string | null {
  const match = /^\/runs\/([^/]+)\/stream$/.exec(pathname);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1]);
}
