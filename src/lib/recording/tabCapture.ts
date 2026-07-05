// Chromium tab capture via getDisplayMedia + MediaRecorder — the high-quality
// recording path. Playwright's built-in recorder tops out at ~25fps VP8 with a
// fixed bitrate; tab capture films the composited tab (WebGL canvas + DOM HUD)
// at 60fps VP9 with a bitrate we control. Chromium-only: the browser must be
// launched with TAB_CAPTURE_BROWSER_ARGS so the game tab is auto-selected
// without the share-picker dialog.

import { createWriteStream, type WriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { BrowserContext, Page } from "playwright";

// The auto-select flag matches on tab title. The target page temporarily takes
// this title while capture starts, then gets its original title back.
const CAPTURE_TAB_TITLE = "mantra-tab-capture-target";

export const TAB_CAPTURE_BROWSER_ARGS = [
  `--auto-select-tab-capture-source-by-title=${CAPTURE_TAB_TITLE}`,
];

const CAPTURE_FPS = 60;
const CAPTURE_BITS_PER_SECOND = 25_000_000;
// MediaRecorder emits a chunk per timeslice; chunks stream to disk as base64.
const CAPTURE_TIMESLICE_MS = 1_000;
// If the auto-select flag is missing/misspelled, getDisplayMedia hangs on the
// share picker forever — fail fast instead.
const CAPTURE_START_TIMEOUT_MS = 10_000;

// Members are optional because they only exist after exposeFunction/armCapture
// run — and a `Window &` intersection with required members would not overlap
// enough for a direct cast.
type CaptureWindow = Window & {
  mantraAppendChunk?: (base64Chunk: string) => Promise<void>;
  __mantraCaptureReady?: Promise<void>;
  __mantraStopCapture?: () => Promise<void>;
};

export interface TabCapture {
  /** Stops the recorder, flushes remaining chunks, closes the output file. */
  stop(): Promise<void>;
}

/**
 * Records `targetPage` into a .webm at `outputPath` from a hidden recorder tab
 * in the same context. The target tab keeps rendering at full rate while
 * captured, even when a human plays in it.
 */
export async function startTabCapture(args: {
  context: BrowserContext;
  targetPage: Page;
  outputPath: string;
  captureWidth: number;
  captureHeight: number;
}): Promise<TabCapture> {
  const sink = createWriteStream(args.outputPath);
  const recorderPage = await args.context.newPage();
  try {
    // about:blank is not a secure context, so it has no navigator.mediaDevices;
    // a file:// page is a trustworthy origin on every OS, no server needed.
    const recorderPagePath = path.join(path.dirname(args.outputPath), "tab-capture-recorder.html");
    await writeFile(recorderPagePath, "<!doctype html><title>mantra-recorder</title>");
    await recorderPage.goto(pathToFileURL(recorderPagePath).toString());
    const originalTitle = await args.targetPage.title();
    await args.targetPage.evaluate((title) => {
      document.title = title;
    }, CAPTURE_TAB_TITLE);

    await recorderPage.exposeFunction("mantraAppendChunk", async (base64Chunk: string) => {
      await writeChunk(sink, Buffer.from(base64Chunk, "base64"));
    });

    // tsx (esbuild keepNames) decorates serialized function source with
    // __name() helper calls the page doesn't have — provide a no-op shim.
    await recorderPage.evaluate("globalThis.__name = (target) => target");
    await recorderPage.evaluate(armCapture, {
      fps: CAPTURE_FPS,
      bitsPerSecond: CAPTURE_BITS_PER_SECOND,
      timesliceMs: CAPTURE_TIMESLICE_MS,
      startTimeoutMs: CAPTURE_START_TIMEOUT_MS,
      width: args.captureWidth,
      height: args.captureHeight,
    });
    // getDisplayMedia requires a user gesture; a Playwright click is trusted.
    await recorderPage.click("#mantra-capture-start");
    await recorderPage.evaluate(() => (window as CaptureWindow).__mantraCaptureReady);

    await args.targetPage.evaluate((title) => {
      document.title = title;
    }, originalTitle);
    await args.targetPage.bringToFront();
  } catch (error) {
    sink.destroy();
    await recorderPage.close();
    throw error;
  }

  return {
    async stop(): Promise<void> {
      await recorderPage.evaluate(() => (window as CaptureWindow).__mantraStopCapture?.());
      await recorderPage.close();
      await new Promise<void>((resolve, reject) => {
        sink.once("error", reject);
        sink.end(resolve);
      });
    },
  };
}

function writeChunk(sink: WriteStream, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sink.write(chunk, (error) => (error ? reject(error) : resolve()));
  });
}

// Runs inside the recorder tab. Must stay self-contained: Playwright serializes
// the function source, so it cannot reference module-scope values.
async function armCapture(config: {
  fps: number;
  bitsPerSecond: number;
  timesliceMs: number;
  startTimeoutMs: number;
  width: number;
  height: number;
}): Promise<void> {
  type PageCaptureWindow = Window & {
    mantraAppendChunk?: (base64Chunk: string) => Promise<void>;
    __mantraCaptureReady?: Promise<void>;
    __mantraStopCapture?: () => Promise<void>;
  };
  const captureWindow = window as PageCaptureWindow;

  const startButton = document.createElement("button");
  startButton.id = "mantra-capture-start";
  startButton.style.cssText = "position:fixed;inset:0;opacity:0";
  document.body.appendChild(startButton);

  const startCapture = async (): Promise<void> => {
    const appendChunk = captureWindow.mantraAppendChunk;
    if (!appendChunk) throw new Error("tab_capture_append_binding_missing");
    const stream = await Promise.race([
      navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          frameRate: { ideal: config.fps },
          width: { ideal: config.width },
          height: { ideal: config.height },
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("tab_capture_source_not_auto_selected")),
          config.startTimeoutMs,
        );
      }),
    ]);

    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: config.bitsPerSecond,
    });
    // Chunks must reach Node in order; chain sends instead of firing in parallel.
    let sendQueue: Promise<void> = Promise.resolve();
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      sendQueue = sendQueue.then(async () => {
        const bytes = new Uint8Array(await event.data.arrayBuffer());
        const blockSize = 0x8000;
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += blockSize) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
        }
        await appendChunk(btoa(binary));
      });
    };

    captureWindow.__mantraStopCapture = () =>
      new Promise<void>((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            // The final dataavailable fires before "stop"; wait for its send.
            void sendQueue.then(resolve);
          },
          { once: true },
        );
        recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      });

    recorder.start(config.timesliceMs);
  };

  captureWindow.__mantraCaptureReady = new Promise<void>((resolve, reject) => {
    startButton.addEventListener(
      "click",
      () => {
        startCapture().then(resolve, reject);
      },
      { once: true },
    );
  });
  // Failures surface when the caller awaits __mantraCaptureReady; this no-op
  // handler just prevents an unhandled-rejection blip in between.
  void captureWindow.__mantraCaptureReady.catch(() => undefined);
}
