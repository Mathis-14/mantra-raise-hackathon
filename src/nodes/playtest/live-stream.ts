import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { Page } from "playwright";

import { JPEG_QUALITY, VIEWPORT } from "./config";

const LIVE_STREAM_PORT = 4317;
const LIVE_STREAM_HOST = "127.0.0.1";
const HEARTBEAT_MS = 15_000;
const SCREENCAST_FRAME_INTERVAL_MS = 180;

type LiveEventName = "frame" | "action" | "status";

interface LiveClient {
  runId: string;
  response: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

interface LiveFramePayload {
  runId: string;
  turn: number | null;
  mimeType: "image/jpeg";
  data: string;
  width: number;
  height: number;
  source: "capture" | "screencast";
  ts: number;
}

interface LiveActionPayload {
  runId: string;
  turn: number;
  name: string;
  message: string;
  x: number | null;
  y: number | null;
  endX: number | null;
  endY: number | null;
  click: boolean;
  isError: boolean;
  skipped: boolean;
  ts: number;
}

interface LiveStatusPayload {
  runId: string;
  message: string;
  ts: number;
}

export interface LiveScreencast {
  stop(): Promise<void>;
}

let server: Server | null = null;
let serverStart: Promise<void> | null = null;
const clientsByRunId = new Map<string, Set<LiveClient>>();
const latestFrameByRunId = new Map<string, LiveFramePayload>();
const latestStatusByRunId = new Map<string, LiveStatusPayload>();

export async function startPlaytestLiveStreamServer(): Promise<void> {
  if (server) return;
  if (serverStart) return serverStart;

  serverStart = new Promise((resolve, reject) => {
    const nextServer = createServer(handleRequest);
    nextServer.once("error", reject);
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

export async function startPlaytestScreencast(runId: string, page: Page): Promise<LiveScreencast> {
  const session = await page.context().newCDPSession(page);
  let active = true;
  let lastFrameAt = 0;

  const onFrame = (payload: { data: string; sessionId: number }) => {
    const now = Date.now();
    if (now - lastFrameAt >= SCREENCAST_FRAME_INTERVAL_MS) {
      lastFrameAt = now;
      publishLiveFrame({
        runId,
        turn: null,
        base64: payload.data,
        source: "screencast",
      });
    }

    if (active) {
      void session.send("Page.screencastFrameAck", { sessionId: payload.sessionId });
    }
  };

  session.on("Page.screencastFrame", onFrame);
  await session.send("Page.startScreencast", {
    format: "jpeg",
    quality: JPEG_QUALITY,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 2,
  });
  publishLiveStatus(runId, "live_stream_started");

  return {
    async stop() {
      active = false;
      session.off("Page.screencastFrame", onFrame);
      await session.send("Page.stopScreencast").catch(() => undefined);
      await session.detach().catch(() => undefined);
      publishLiveStatus(runId, "live_stream_stopped");
    },
  };
}

export function publishLiveFrame(args: {
  runId: string;
  turn: number | null;
  jpeg?: Buffer;
  base64?: string;
  source: LiveFramePayload["source"];
}): void {
  const data = args.base64 ?? args.jpeg?.toString("base64");
  if (!data) return;

  const payload: LiveFramePayload = {
    runId: args.runId,
    turn: args.turn,
    mimeType: "image/jpeg",
    data,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    source: args.source,
    ts: Date.now(),
  };
  latestFrameByRunId.set(args.runId, payload);
  publishToRun(args.runId, "frame", payload);
}

export function publishLiveAction(args: {
  runId: string;
  turn: number;
  name: string;
  message: string;
  rawArgs: unknown;
  isError: boolean;
  skipped: boolean;
}): void {
  const point = readActionPoint(args.name, args.rawArgs);
  const payload: LiveActionPayload = {
    runId: args.runId,
    turn: args.turn,
    name: args.name,
    message: args.message,
    x: point.x,
    y: point.y,
    endX: point.endX,
    endY: point.endY,
    click: isClickLikeAction(args.name),
    isError: args.isError,
    skipped: args.skipped,
    ts: Date.now(),
  };
  publishToRun(args.runId, "action", payload);
}

export function publishLiveStatus(runId: string, message: string): void {
  const payload: LiveStatusPayload = {
    runId,
    message,
    ts: Date.now(),
  };
  latestStatusByRunId.set(runId, payload);
  publishToRun(runId, "status", payload);
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

  const latestStatus = latestStatusByRunId.get(runId);
  if (latestStatus) writeSse(response, "status", latestStatus);

  const latestFrame = latestFrameByRunId.get(runId);
  if (latestFrame) writeSse(response, "frame", latestFrame);

  response.on("close", () => {
    clearInterval(client.heartbeat);
    const currentClients = clientsByRunId.get(client.runId);
    currentClients?.delete(client);
    if (currentClients?.size === 0) clientsByRunId.delete(client.runId);
  });
}

function publishToRun(runId: string, eventName: LiveEventName, payload: unknown): void {
  const clients = clientsByRunId.get(runId);
  if (!clients) return;

  for (const client of clients) {
    writeSse(client.response, eventName, payload);
  }
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

function readActionPoint(name: string, value: unknown) {
  if (!isRecord(value)) {
    return { x: null, y: null, endX: null, endY: null };
  }

  if (name === "hold_and_steer") {
    const path = value.x_path;
    const lastX = Array.isArray(path) ? readNumber(path[path.length - 1]) : null;
    return {
      x: readNumber(Array.isArray(path) ? path[0] : null),
      y: readNumber(value.y),
      endX: lastX,
      endY: readNumber(value.y),
    };
  }

  return {
    x: readNumber(value.x ?? value.start_x),
    y: readNumber(value.y ?? value.start_y),
    endX: readNumber(value.destination_x ?? value.end_x),
    endY: readNumber(value.destination_y ?? value.end_y),
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClickLikeAction(name: string): boolean {
  return (
    name === "click" ||
    name === "click_at" ||
    name === "double_click" ||
    name === "triple_click" ||
    name === "middle_click" ||
    name === "right_click" ||
    name === "long_press" ||
    name === "type_text_at"
  );
}
