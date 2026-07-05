// Standalone gameplay recorder for marketing footage — no Gemini, no Supabase,
// and no dependency on the playtest node: it launches its own Chromium so the
// agent pipeline and marketing captures can never break each other. Start/stop
// is programmatic: the caller (worker, orchestrator, or a script) owns the
// lifecycle. Two capture paths:
//   "high" (default)  Chromium tab capture (tabCapture.ts): 60fps VP9 at a
//                     bitrate we control — the marketing-footage path.
//   "standard"        Playwright's built-in recorder (~25fps VP8, fixed
//                     bitrate): engine-agnostic fallback.

import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContextOptions, type Page } from "playwright";

import { startTabCapture, TAB_CAPTURE_BROWSER_ARGS } from "./tabCapture";

const MARKETING_ARTIFACT_ROOT = "marketing-artifacts";
// Phone-ish portrait stage, same shape the playtest uses — kept as local
// constants on purpose so this module stays decoupled from the agent.
const VIEWPORT = { width: 1280, height: 1100 } as const;
const HEADED_WINDOW_CHROME_HEIGHT_PX = 120;
const PAGE_GOTO_TIMEOUT_MS = 15_000;
// Marketing footage renders at 2× DPI (2560×2200 output). This is also the
// game's own ceiling: it clamps devicePixelRatio to 2 in its renderer setup.
const MARKETING_VIDEO_SCALE = 2;

export type RecordingQuality = "high" | "standard";

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
  quality?: RecordingQuality;
}): Promise<GameplayRecording> {
  const quality = args.quality ?? "high";
  const headless = args.headless ?? false;
  const artifactDir = path.join(MARKETING_ARTIFACT_ROOT, args.label);
  await mkdir(artifactDir, { recursive: true });
  const finalPath = path.join(artifactDir, `gameplay-${args.label}.webm`);

  const browser = await chromium.launch({
    headless,
    // Headless defaults to Playwright's headless shell, which has no display-
    // capture stack (getDisplayMedia throws NotSupportedError). "chromium"
    // forces the full build, which supports tab capture even headless.
    channel: "chromium",
    args: [
      `--window-size=${VIEWPORT.width},${VIEWPORT.height + HEADED_WINDOW_CHROME_HEIGHT_PX}`,
      "--window-position=0,0",
      ...(quality === "high"
        ? [`--force-device-scale-factor=${MARKETING_VIDEO_SCALE}`, ...TAB_CAPTURE_BROWSER_ARGS]
        : []),
    ],
  });

  try {
    // Tab capture films the *visible* tab, so high quality must not emulate a
    // viewport taller than the window can show (the overflow — and the bottom
    // HUD with it — would be cut from the footage). The responsive game fills
    // the real window; DPI comes from --force-device-scale-factor. Don't
    // resize the window mid-recording.
    const contextOptions: BrowserContextOptions =
      quality === "high"
        ? { viewport: null }
        : {
            viewport: VIEWPORT,
            deviceScaleFactor: MARKETING_VIDEO_SCALE,
            recordVideo: {
              dir: artifactDir,
              size: {
                width: VIEWPORT.width * MARKETING_VIDEO_SCALE,
                height: VIEWPORT.height * MARKETING_VIDEO_SCALE,
              },
            },
          };
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    await page.goto(args.gameUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_GOTO_TIMEOUT_MS,
    });

    if (quality === "standard") {
      return {
        page,
        artifactDir,
        async stop(): Promise<string> {
          const video = page.video();
          // Playwright only flushes recordings on an awaited context.close();
          // browser.close() alone can leave a 0-byte file.
          await context.close();
          await browser.close();
          if (!video) throw new Error("gameplay_recording_missing_video");
          await rename(await video.path(), finalPath);
          return finalPath;
        },
      };
    }

    const capture = await startTabCapture({
      context,
      targetPage: page,
      outputPath: finalPath,
      captureWidth: VIEWPORT.width * MARKETING_VIDEO_SCALE,
      captureHeight: VIEWPORT.height * MARKETING_VIDEO_SCALE,
    });

    return {
      page,
      artifactDir,
      async stop(): Promise<string> {
        await capture.stop();
        await context.close();
        await browser.close();
        return finalPath;
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
