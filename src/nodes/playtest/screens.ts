import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { emitEvent } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";

import { ARTIFACT_ROOT, PLAYTEST_MEDIA_BUCKET, STORAGE_UPLOAD_TIMEOUT_MS } from "./config";

export async function writeFrame(args: {
  runId: string;
  turn: number;
  jpeg: Buffer;
}): Promise<string> {
  const dir = path.join(ARTIFACT_ROOT, args.runId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `turn-${String(args.turn).padStart(3, "0")}.jpg`);
  await writeFile(filePath, args.jpeg);
  return filePath;
}

export function sinkFrame(args: { runId: string; turn: number; jpeg: Buffer }): void {
  void writeFrame(args).catch((error: unknown) => {
    console.error("playtest_frame_write_failed", {
      run_id: args.runId,
      turn: args.turn,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  void uploadFrame(args).catch((error: unknown) => {
    console.error("playtest_frame_upload_failed", {
      run_id: args.runId,
      turn: args.turn,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

async function uploadFrame(args: { runId: string; turn: number; jpeg: Buffer }): Promise<void> {
  const storagePath = `${args.runId}/${String(args.turn).padStart(3, "0")}.jpg`;
  await withTimeout(
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

    const { data } = supabaseAdmin()
      .storage
      .from(PLAYTEST_MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    await emitEvent({
      run_id: args.runId,
      node: "playtest",
      type: "screenshot",
      message: `Frame ${args.turn}`,
      screenshot_url: data.publicUrl,
      data: { turn: args.turn },
    });
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
