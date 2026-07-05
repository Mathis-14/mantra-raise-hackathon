import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const GAME_UPLOAD_BUCKET = "game-uploads";

function storagePathFromSegments(segments: string[]): string | null {
  if (segments.length < 2) return null;
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }

  const storagePath = segments.join("/");
  return storagePath.toLowerCase().endsWith(".html") ? storagePath : null;
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const storagePath = storagePathFromSegments(path);

  if (!storagePath) {
    return NextResponse.json({ error: "invalid game path" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .storage
    .from(GAME_UPLOAD_BUCKET)
    .download(storagePath);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return new NextResponse(await data.text(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
