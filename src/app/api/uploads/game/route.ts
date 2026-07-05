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

// The team's multi-file game (index.html + /src/main.js + 40MB assets) can't travel in one
// uploaded file, but its dev server can serve it — detect that server and play it directly.
const LOCAL_GAME_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180] as const;
const LOCAL_GAME_PROBE_TIMEOUT_MS = 1_000;

async function findLocalGameServerUrl(localReference: string): Promise<string | null> {
  for (const port of LOCAL_GAME_PORTS) {
    const url = `http://127.0.0.1:${port}/`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(LOCAL_GAME_PROBE_TIMEOUT_MS) });
      if (!response.ok) continue;
      const html = await response.text();
      if (html.includes(localReference)) return url;
    } catch {
      continue;
    }
  }
  return null;
}

// Local script/style references (e.g. /src/main.js) 404 once the file is served from
// storage, so the agent would open an empty shell. Absolute http(s)/data URLs are fine.
function findLocalAssetReference(html: string): string | null {
  const referencePattern = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(referencePattern)) {
    const reference = match[1]?.trim();
    if (!reference) continue;
    if (/^(?:https?:|data:|\/\/)/i.test(reference)) continue;
    if (reference.startsWith("#")) continue;
    return reference;
  }
  return null;
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

  const localReference = findLocalAssetReference(html);
  if (localReference) {
    const localGameUrl = await findLocalGameServerUrl(localReference);
    if (localGameUrl) {
      return NextResponse.json({
        game_url: localGameUrl,
        storage_path: "",
        filename,
      }, { status: 201 });
    }

    return NextResponse.json({
      error: `uploaded HTML references local file '${localReference}' that doesn't travel with the upload, and no local game server was found — start the game dev server (npm run game) and retry, or upload a self-contained HTML`,
    }, { status: 400 });
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
