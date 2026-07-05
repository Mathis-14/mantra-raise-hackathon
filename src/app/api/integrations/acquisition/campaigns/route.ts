import { NextResponse } from "next/server";
import { z } from "zod";

import { createPausedTestCampaign, GoogleAdsApiError } from "@/lib/google-ads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    return NextResponse.json(await createPausedTestCampaign(body));
  } catch (error: unknown) {
    const invalidRequest = error instanceof z.ZodError;
    const policyError = error instanceof GoogleAdsApiError && error.policyCode !== null;
    console.error("acquisition_campaign_create_failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    if (policyError) {
      return NextResponse.json({
        error: "Google Ads requires an EU political-advertising declaration",
        code: error.policyCode,
        source: "Google Ads API v24",
        requestId: error.requestId,
        timestamp: new Date().toISOString(),
        campaignCreated: false,
        adsServed: false,
        spend: false,
      }, { status: 503 });
    }
    return NextResponse.json(
      { error: invalidRequest ? "Invalid campaign request" : "Test campaign creation failed" },
      { status: invalidRequest ? 400 : 503 },
    );
  }
}
