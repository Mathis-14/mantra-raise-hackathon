import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";

import {
  ARTIFACT_ROOT,
  HEADED_WINDOW_CHROME_HEIGHT_PX,
  JPEG_QUALITY,
  PAGE_GOTO_TIMEOUT_MS,
  PLAYWRIGHT_ACTION_TIMEOUT_MS,
  VIEWPORT,
} from "./config";

export interface BrowserSession {
  browser: Browser;
  page: Page;
  artifactDir: string;
}

export async function openBrowserSession(args: {
  runId: string;
  gameUrl: string;
  headless?: boolean;
  recordVideo?: boolean;
}): Promise<BrowserSession> {
  const artifactDir = path.join(ARTIFACT_ROOT, args.runId);
  await mkdir(artifactDir, { recursive: true });

  const headless = args.headless ?? false;
  const browser = await chromium.launch({
    headless,
    args: headless
      ? []
      : [
          `--window-size=${VIEWPORT.width},${VIEWPORT.height + HEADED_WINDOW_CHROME_HEIGHT_PX}`,
          "--window-position=0,0",
        ],
  });
  const contextOptions: BrowserContextOptions = {
    viewport: VIEWPORT,
  };
  if (args.recordVideo ?? true) {
    contextOptions.recordVideo = { dir: artifactDir, size: VIEWPORT };
  }
  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(PLAYWRIGHT_ACTION_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(PAGE_GOTO_TIMEOUT_MS);

  const page = await context.newPage();
  await page.goto(args.gameUrl, { waitUntil: "domcontentloaded", timeout: PAGE_GOTO_TIMEOUT_MS });
  return { browser, page, artifactDir };
}

export async function capturePage(page: Page): Promise<Buffer> {
  return page.screenshot({
    type: "jpeg",
    quality: JPEG_QUALITY,
    fullPage: false,
  });
}
