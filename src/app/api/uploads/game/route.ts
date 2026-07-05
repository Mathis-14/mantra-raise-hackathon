import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const GAME_UPLOAD_BUCKET = "game-uploads";
let bucketReady: Promise<void> | null = null;

function safeFileName(name: string): string {
  const fallback = "prototype.html";
  const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.length > 0 ? clean : fallback;
}

async function ensureGameUploadBucket(): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) throw new Error(listError.message);
  if (buckets.some((bucket) => bucket.name === GAME_UPLOAD_BUCKET)) return;

  const { error: createError } = await supabase.storage.createBucket(GAME_UPLOAD_BUCKET, {
    public: true,
    allowedMimeTypes: ["text/html"],
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(createError.message);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const filename = safeFileName(file.name);
  if (!filename.toLowerCase().endsWith(".html")) {
    return NextResponse.json({ error: "only .html uploads are supported" }, { status: 400 });
  }

  const html = await file.text();
  if (html.trim().length === 0) {
    return NextResponse.json({ error: "uploaded HTML is empty" }, { status: 400 });
  }

  bucketReady ??= ensureGameUploadBucket();
  try {
    await bucketReady;
  } catch (error) {
    bucketReady = null;
    const message = error instanceof Error ? error.message : "failed to prepare upload bucket";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const storagePath = `${randomUUID()}/${filename}`;
  const htmlBytes = new TextEncoder().encode(html);
  const { error } = await supabaseAdmin()
    .storage
    .from(GAME_UPLOAD_BUCKET)
    .upload(storagePath, htmlBytes, {
      contentType: "text/html",
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const gameUrl = new URL(`/api/uploads/game/${storagePath}`, request.url);

  return NextResponse.json({
    game_url: gameUrl.toString(),
    storage_path: storagePath,
    filename,
  }, { status: 201 });
}
