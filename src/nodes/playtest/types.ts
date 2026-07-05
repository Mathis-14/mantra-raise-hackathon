import type { Interactions } from "@google/genai";

export type FunctionCallStep = Interactions.FunctionCallStep;
export type FunctionResultStep = Interactions.FunctionResultStep;
export type Interaction = Interactions.Interaction;
export type InteractionInput = Interactions.CreateModelInteractionParamsNonStreaming["input"];
export type Usage = Interactions.Usage;

export type TerminationReason =
  | "budget"
  | "max_turns"
  | "model_done"
  | "cu_error"
  | "post_win_sweep_done"
  | "game_cap";

export interface TranscriptEntry {
  turn: number;
  action: string;
  intent: string | null;
  result: string;
}

export interface FrameCapture {
  turn: number;
  jpeg: Buffer;
}

export interface CuCallResult {
  call: FunctionCallStep;
  message: string;
  isError: boolean;
}
