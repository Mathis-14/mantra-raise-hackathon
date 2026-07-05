import { NextResponse } from "next/server";

import { uploadAndLinkDemoImageAsset } from "@/lib/google-ads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    return NextResponse.json(await uploadAndLinkDemoImageAsset(body));
  } catch (error: unknown) {
    console.error("acquisition_asset_upload_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Google Ads test image upload failed" },
      { status: 503 },
    );
  }
}
