// The approval gate — the ONLY place a run leaves awaiting_approval. Guarded by
// the canonical transition map; the worker never advances this edge itself.

import { NextResponse } from "next/server";

import { canTransition, type RunStatus } from "@/contracts/types";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = supabaseAdmin();

  const { data: run, error: readError } = await supabase
    .from("runs")
    .select("status")
    .eq("id", id)
    .single();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 404 });

  const from = run.status as RunStatus;
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
  return NextResponse.json(data);
}
