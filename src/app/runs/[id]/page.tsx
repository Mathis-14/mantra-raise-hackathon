// owner: Noé + Romain — live run view.
// Target: realtime event feed ("what the agent is doing right now", incl.
// playtest screenshots), playtest report card, approval-gate button
// (POST /api/runs/[id]/approve), per-variant creatives + metrics, keep/kill.

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-xl font-semibold">Run {id}</h1>
      <p className="mt-2 text-zinc-400">Live run view — event feed, report, metrics, decision.</p>
    </main>
  );
}
