// Thin route: validate → one Supabase call → return. Business logic belongs in
// nodes/orchestrator, never here.

import { NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";

// Never prerendered at build time — Supabase env only exists at runtime.
export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  name: z.string().min(1),
  game_url: z.string().min(1),
  market_context: z.string().nullish(),
});

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const parsed = createProjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .insert({ ...parsed.data, market_context: parsed.data.market_context ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
