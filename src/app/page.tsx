// owner: Noé + Romain — dashboard home.
// Target: project list + "upload game" + start-run button. Server state comes
// from Supabase via supabaseBrowser() realtime subscriptions (runs + events).

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Mantra</h1>
      <p className="mt-2 text-zinc-400">
        Plays your prototype like a real player. Tells you if it&apos;s fun before you spend a
        euro.
      </p>
    </main>
  );
}
