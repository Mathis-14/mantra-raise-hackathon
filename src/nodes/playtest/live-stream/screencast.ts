import type { Page } from "playwright";

import { JPEG_QUALITY, VIEWPORT } from "../config";

import { publishLiveFrame, publishLiveStatus } from "./publish";

const SCREENCAST_FRAME_INTERVAL_MS = 180;
// CDP screencast only fires on repaints; static screens (menus, win overlays) would freeze
// the carousel phone, so an idle ticker keeps publishing real captures with fresh timestamps.
const IDLE_FRAME_FALLBACK_MS = 700;

export interface LiveScreencast {
  stop(): Promise<void>;
}

export async function startPlaytestScreencast(runId: string, page: Page): Promise<LiveScreencast> {
  const session = await page.context().newCDPSession(page);
  let active = true;
  let lastFrameAt = 0;
  let idleCaptureInFlight = false;

  const onFrame = (payload: { data: string; sessionId: number }) => {
    const now = Date.now();
    if (now - lastFrameAt >= SCREENCAST_FRAME_INTERVAL_MS) {
      lastFrameAt = now;
      publishLiveFrame({
        runId,
        turn: null,
        base64: payload.data,
        source: "screencast",
      });
    }

    if (active) {
      void session.send("Page.screencastFrameAck", { sessionId: payload.sessionId });
    }
  };

  const idleTicker = setInterval(() => {
    if (!active || idleCaptureInFlight) return;
    if (Date.now() - lastFrameAt < IDLE_FRAME_FALLBACK_MS) return;

    idleCaptureInFlight = true;
    session
      .send("Page.captureScreenshot", { format: "jpeg", quality: JPEG_QUALITY })
      .then((shot) => {
        if (!active) return;
        lastFrameAt = Date.now();
        publishLiveFrame({
          runId,
          turn: null,
          base64: shot.data,
          source: "capture",
        });
      })
      .catch(() => undefined)
      .finally(() => {
        idleCaptureInFlight = false;
      });
  }, IDLE_FRAME_FALLBACK_MS / 2);

  session.on("Page.screencastFrame", onFrame);
  await session.send("Page.startScreencast", {
    format: "jpeg",
    quality: JPEG_QUALITY,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 2,
  });
  publishLiveStatus(runId, "live_stream_started");

  return {
    async stop() {
      active = false;
      clearInterval(idleTicker);
      session.off("Page.screencastFrame", onFrame);
      await session.send("Page.stopScreencast").catch(() => undefined);
      await session.detach().catch(() => undefined);
      publishLiveStatus(runId, "live_stream_stopped");
    },
  };
}
