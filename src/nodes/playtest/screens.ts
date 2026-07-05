import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { emitEvent } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";

import { ARTIFACT_ROOT, PLAYTEST_MEDIA_BUCKET, STORAGE_UPLOAD_TIMEOUT_MS } from "./config";

export async function writeFrame(args: {
  runId: string;
  situation?: number;
  turn: number;
  jpeg: Buffer;
}): Promise<string> {
  const dir = path.join(ARTIFACT_ROOT, args.runId, situationSegment(args.situation));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `turn-${String(args.turn).padStart(3, "0")}.jpg`);
  await writeFile(filePath, args.jpeg);
  return filePath;
}

function situationSegment(situation: number | undefined): string {
  return `s${situation ?? 1}`;
}

export function sinkFrame(args: {
  runId: string;
  situation?: number;
  turn: number;
  jpeg: Buffer;
  captureMs: number;
  onUploadComplete?: (success: boolean, uploadMs: number) => void;
}): void {
  void writeFrame(args).catch((error: unknown) => {
    console.error("playtest_frame_write_failed", {
      run_id: args.runId,
      turn: args.turn,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  void uploadFrame(args)
    .then((uploadMs) => args.onUploadComplete?.(true, uploadMs))
    .catch((error: unknown) => {
      args.onUploadComplete?.(false, 0);
      console.error("playtest_frame_upload_failed", {
        run_id: args.runId,
        turn: args.turn,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

async function uploadFrame(args: {
  runId: string;
  situation?: number;
  turn: number;
  jpeg: Buffer;
  captureMs: number;
}): Promise<number> {
  const startedAt = Date.now();
  const storagePath = `${args.runId}/${situationSegment(args.situation)}/${String(args.turn).padStart(3, "0")}.jpg`;
  return withTimeout(
    supabaseAdmin()
      .storage
      .from(PLAYTEST_MEDIA_BUCKET)
      .upload(storagePath, args.jpeg, {
        contentType: "image/jpeg",
        upsert: true,
      }),
    STORAGE_UPLOAD_TIMEOUT_MS,
    "playtest_storage_upload_timeout",
  ).then(async ({ error }) => {
    if (error) throw new Error(error.message);
    const uploadMs = Date.now() - startedAt;

    const { data } = supabaseAdmin()
      .storage
      .from(PLAYTEST_MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    await emitEvent({
      run_id: args.runId,
      node: "playtest",
      type: "screenshot",
      message: `Frame ${args.turn} (situation ${args.situation ?? 1})`,
      screenshot_url: data.publicUrl,
      data: {
        turn: args.turn,
        situation: args.situation ?? 1,
        capture_ms: args.captureMs,
        upload_ms: uploadMs,
        jpeg_bytes: args.jpeg.byteLength,
      },
    });
    return uploadMs;
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(label)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
