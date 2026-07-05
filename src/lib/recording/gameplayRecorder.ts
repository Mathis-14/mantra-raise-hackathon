// Standalone gameplay recorder for marketing footage — no Gemini, no Supabase.
// Reuses the playtest node's Playwright video pipeline (openBrowserSession) so
// recordings match agent-run captures exactly. Start/stop is programmatic:
// the caller (worker, orchestrator, or a script) owns the lifecycle.

import { rename } from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";

import { openBrowserSession } from "@/nodes/playtest/browser";

export interface GameplayRecording {
  /** Live page — drive it or let a human play; everything is filmed. */
  page: Page;
  /** Directory the video (and any other artifacts) land in. */
  artifactDir: string;
  /** Ends the recording, closes the browser, returns the final .webm path. */
  stop(): Promise<string>;
}

export async function startGameplayRecording(args: {
  gameUrl: string;
  label: string;
  headless?: boolean;
}): Promise<GameplayRecording> {
  const session = await openBrowserSession({
    runId: `marketing-${args.label}`,
    gameUrl: args.gameUrl,
    headless: args.headless,
    recordVideo: true,
  });

  return {
    page: session.page,
    artifactDir: session.artifactDir,
    async stop(): Promise<string> {
      const video = session.page.video();
      // Playwright only flushes recordings on an awaited context.close();
      // browser.close() alone can leave a 0-byte file.
      await session.page.context().close();
      await session.browser.close();
      if (!video) throw new Error("gameplay_recording_missing_video");

      const rawPath = await video.path();
      const finalPath = path.join(session.artifactDir, `gameplay-${args.label}.webm`);
      await rename(rawPath, finalPath);
      return finalPath;
    },
  };
}
