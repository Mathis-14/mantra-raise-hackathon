import { NextResponse } from "next/server";

import { verifyGoogleAdsConnection } from "@/lib/google-ads";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await verifyGoogleAdsConnection());
  } catch (error: unknown) {
    console.error("acquisition_connection_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { connected: false, environment: "TEST", error: "Test acquisition connection unavailable" },
      { status: 503 },
    );
  }
}
