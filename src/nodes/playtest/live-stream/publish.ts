import { VIEWPORT } from "../config";

import { publishFrameToRun, publishStatusToRun, publishToRun } from "./server";
import type { LiveActionPayload, LiveFramePayload, LiveStatusPayload } from "./types";

export function publishLiveFrame(args: {
  runId: string;
  situation?: number;
  turn: number | null;
  jpeg?: Buffer;
  base64?: string;
  source: LiveFramePayload["source"];
}): void {
  const data = args.base64 ?? args.jpeg?.toString("base64");
  if (!data) return;

  const payload: LiveFramePayload = {
    runId: args.runId,
    situation: args.situation ?? 1,
    turn: args.turn,
    mimeType: "image/jpeg",
    data,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    source: args.source,
    ts: Date.now(),
  };
  publishFrameToRun(args.runId, payload);
}

export function publishLiveAction(args: {
  runId: string;
  situation?: number;
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
    situation: args.situation ?? 1,
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

export function publishLiveStatus(runId: string, message: string, situation = 1): void {
  const payload: LiveStatusPayload = {
    runId,
    situation,
    message,
    ts: Date.now(),
  };
  publishStatusToRun(runId, payload);
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
