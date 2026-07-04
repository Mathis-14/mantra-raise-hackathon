import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  ARTIFACT_ROOT,
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
}): Promise<BrowserSession> {
  const artifactDir = path.join(ARTIFACT_ROOT, args.runId);
  await mkdir(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: args.headless ?? false });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: artifactDir, size: VIEWPORT },
  });
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
