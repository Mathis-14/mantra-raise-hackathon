// The approval gate — the ONLY place a run leaves awaiting_approval. Guarded by
// the canonical transition map; the worker never advances this edge itself.

import { NextResponse } from "next/server";
import { z } from "zod";

import { canTransition, RUN_STATUSES } from "@/contracts/types";
import { emitEvent } from "@/lib/events";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const runStatusSchema = z.enum(RUN_STATUSES);

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = supabaseAdmin();

  const { data: run, error: readError } = await supabase
    .from("runs")
    .select("status")
    .eq("id", id)
    .single();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 404 });

  const parsedStatus = runStatusSchema.safeParse(run.status);
  if (!parsedStatus.success) {
    return NextResponse.json({ error: `run has invalid status: ${run.status}` }, { status: 500 });
  }

  const from = parsedStatus.data;
  if (!canTransition(from, "generating_variants")) {
    return NextResponse.json(
      { error: `run is ${from}, not awaiting_approval` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("runs")
    .update({ status: "generating_variants", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await emitEvent({
    run_id: id,
    node: "orchestrator",
    type: "status",
    message: "Report approved — generating variants",
    screenshot_url: null,
    data: null,
  });

  return NextResponse.json(data);
}
