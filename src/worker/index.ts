// Long-running worker — runs on a laptop during the demo (Playwright + the
// Computer Use loop cannot live in Vercel serverless routes). Talks only to
// Supabase, so the dashboard never knows where the work happens.
// Start with: npm run worker

import { runOrchestrator } from "@/orchestrator/loop";

runOrchestrator().catch((error: unknown) => {
  console.error("worker_crashed", error);
  process.exit(1);
});
