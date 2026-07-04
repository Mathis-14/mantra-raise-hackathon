// Canonical liveness pattern: EVERY node reports what it is doing by inserting
// events rows — the dashboard's realtime feed renders them. No ad-hoc
// console.log-driven "liveness". Server/worker only.

import type { NewAgentEvent } from "@/contracts/types";
import { supabaseAdmin } from "@/lib/supabase";

export async function emitEvent(event: NewAgentEvent): Promise<void> {
  const { error } = await supabaseAdmin().from("events").insert(event);
  if (error) {
    // Liveness is best-effort — a failed event insert must never kill a node.
    console.error("emit_event_failed", { node: event.node, message: error.message });
  }
}
