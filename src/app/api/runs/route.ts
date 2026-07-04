// Thin route: starting a run only inserts a `created` row — the worker claims
// it from there. The dashboard never executes pipeline work.

import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";

const startRunSchema = z.object({
  project_id: z.uuid(),
});

export async function POST(request: Request) {
  const parsed = startRunSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("runs")
    .insert({ project_id: parsed.data.project_id, status: "created" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
