export type LiveEventName = "frame" | "action" | "status";

export interface LiveFramePayload {
  runId: string;
  situation: number;
  turn: number | null;
  mimeType: "image/jpeg";
  data: string;
  width: number;
  height: number;
  source: "capture" | "screencast";
  ts: number;
}

export interface LiveActionPayload {
  runId: string;
  situation: number;
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

export interface LiveStatusPayload {
  runId: string;
  situation: number;
  message: string;
  ts: number;
}
