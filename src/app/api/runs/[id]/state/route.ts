import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractIds(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string") return [];
    return [row.id];
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = supabaseAdmin();

  const [
    runResult,
    eventsResult,
    reportResult,
    variantsResult,
    creativesResult,
    decisionResult,
  ] = await Promise.all([
    supabase.from("runs").select("*").eq("id", id).single(),
    supabase.from("events").select("*").eq("run_id", id).order("created_at", { ascending: true }),
    supabase.from("playtest_reports").select("*").eq("run_id", id).maybeSingle(),
    supabase.from("variants").select("*").eq("run_id", id).order("created_at", { ascending: true }),
    supabase.from("creatives").select("*").eq("run_id", id).order("created_at", { ascending: true }),
    supabase.from("decisions").select("*").eq("run_id", id).maybeSingle(),
  ]);

  if (runResult.error) {
    return NextResponse.json({ error: runResult.error.message }, { status: 404 });
  }

  const readError = [
    eventsResult.error,
    reportResult.error,
    variantsResult.error,
    creativesResult.error,
    decisionResult.error,
  ].find(Boolean);

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const projectId = isRecord(runResult.data) && typeof runResult.data.project_id === "string"
    ? runResult.data.project_id
    : null;

  const projectResult = projectId
    ? await supabase.from("projects").select("*").eq("id", projectId).single()
    : { data: null, error: null };

  if (projectResult.error) {
    return NextResponse.json({ error: projectResult.error.message }, { status: 500 });
  }

  const creativeIds = extractIds(creativesResult.data);
  const metricsResult = creativeIds.length > 0
    ? await supabase
      .from("metrics")
      .select("*")
      .in("creative_id", creativeIds)
      .order("ts", { ascending: true })
    : { data: [], error: null };

  if (metricsResult.error) {
    return NextResponse.json({ error: metricsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    run: runResult.data,
    project: projectResult.data,
    events: eventsResult.data ?? [],
    playtest_report: reportResult.data ?? null,
    variants: variantsResult.data ?? [],
    creatives: creativesResult.data ?? [],
    metrics: metricsResult.data ?? [],
    decision: decisionResult.data ?? null,
  });
}
