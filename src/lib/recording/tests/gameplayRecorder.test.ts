// Integration test: real headless Chromium, real video flush. The recorder's
// contract is "stop() yields a playable, non-empty .webm at a predictable
// path" — a mocked browser cannot verify the Playwright flush behavior the
// module exists to encapsulate (context.close() before reading the video).
//
// Run: npm test  (or: node --import tsx --test src/lib/recording/tests/*.test.ts)

import { rm, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { startGameplayRecording } from "../gameplayRecorder";

const GAME_URL = "data:text/html,<title>recorder-test</title><h1>recording</h1>";
const RECORD_FOR_MS = 500;

test("standard quality: records and delivers a non-empty webm at the labeled path", async () => {
  const label = `recorder-test-${process.pid}`;
  const recording = await startGameplayRecording({
    gameUrl: GAME_URL,
    label,
    headless: true,
    quality: "standard",
  });

  try {
    assert.equal(path.basename(recording.artifactDir), label);
    assert.equal(recording.page.isClosed(), false);

    await new Promise((resolve) => setTimeout(resolve, RECORD_FOR_MS));
    const videoPath = await recording.stop();

    assert.equal(videoPath, path.join(recording.artifactDir, `gameplay-${label}.webm`));
    const video = await stat(videoPath);
    assert.ok(video.size > 0, "recorded video must not be a 0-byte file");
    assert.equal(recording.page.isClosed(), true, "stop() must close the browser");
  } finally {
    await rm(recording.artifactDir, { recursive: true, force: true });
  }
});

test("high quality: tab capture streams a non-empty webm to the labeled path", async () => {
  const label = `recorder-test-hq-${process.pid}`;
  const recording = await startGameplayRecording({
    gameUrl: GAME_URL,
    label,
    headless: true,
    quality: "high",
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, RECORD_FOR_MS));
    const videoPath = await recording.stop();

    assert.equal(videoPath, path.join(recording.artifactDir, `gameplay-${label}.webm`));
    const video = await stat(videoPath);
    assert.ok(video.size > 0, "recorded video must not be a 0-byte file");
    assert.equal(recording.page.isClosed(), true, "stop() must close the browser");
  } finally {
    await rm(recording.artifactDir, { recursive: true, force: true });
  }
});
