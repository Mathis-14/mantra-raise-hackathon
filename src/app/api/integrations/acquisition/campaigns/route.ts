import { NextResponse } from "next/server";
import { z } from "zod";

import { createPausedTestCampaign } from "@/lib/google-ads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    return NextResponse.json(await createPausedTestCampaign(body));
  } catch (error: unknown) {
    const invalidRequest = error instanceof z.ZodError;
    console.error("acquisition_campaign_create_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: invalidRequest ? "Invalid campaign request" : "Test campaign creation failed" },
      { status: invalidRequest ? 400 : 503 },
    );
  }
}
