// owner: Tom — pipeline controller.
//
// Contract: a single long-running loop (started by src/worker/index.ts) that
//   1. claims runs whose status has a worker-owned next step (created,
//      generating_variants, generating_creatives, deploying, measuring, deciding
//      — NOT awaiting_approval, which only the dashboard button advances),
//   2. executes the matching node from src/nodes/*,
//   3. persists the node's output, emits a "status" event, and advances the run
//      via canTransition() — never set a status the transition map forbids,
//   4. on node error: status → failed with failed_step set, emit an "error"
//      event, and keep looping — one broken run must not stop the worker.

export async function runOrchestrator(): Promise<void> {
  throw new Error("not implemented — owner: Tom");
}
