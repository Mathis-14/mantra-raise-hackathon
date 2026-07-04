// Unit tests for the pure contract layer (no Gemini, no network).
// Run: npx tsx --test src/lib/tag-generation/tests/*.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { serializeTagDataset } from "../index";
import {
  TagGenerationError,
  modelOutputSchema,
  parseTimecode,
  tagDatasetSchema,
  toTagDataset,
  type ModelOutput,
} from "../src/schema";

const META = {
  sourceRef: "sample.mp4",
  appContext: null,
  generatedAt: "2026-07-04T12:00:00.000Z",
};

function segment(overrides: Partial<ModelOutput["segments"][number]> = {}) {
  return {
    startTimecode: "00:00",
    endTimecode: "00:05",
    contentType: "gameplay",
    summary: "Crowd multiplies through a gate.",
    emotions: ["satisfying" as const],
    visual: ["fast-paced" as const],
    adRoles: ["hook-candidate" as const],
    confidence: 0.9,
    ...overrides,
  };
}

describe("parseTimecode", () => {
  test("parses MM:SS", () => {
    assert.equal(parseTimecode("00:05"), 5);
    assert.equal(parseTimecode("01:15"), 75);
    assert.equal(parseTimecode("90:00"), 5400);
  });

  test("parses H:MM:SS", () => {
    assert.equal(parseTimecode("1:02:03"), 3723);
    assert.equal(parseTimecode("10:00:00"), 36000);
  });

  test("rejects malformed timecodes", () => {
    for (const bad of ["abc", "5", "1:2", "00:61", "1:2:3:4", "-1:00", ""]) {
      assert.throws(() => parseTimecode(bad), TagGenerationError, bad);
    }
  });
});

describe("toTagDataset", () => {
  test("converts timecodes, computes durations, sorts segments", () => {
    const raw: ModelOutput = {
      videoDurationTimecode: "00:20",
      segments: [
        segment({ startTimecode: "00:10", endTimecode: "00:20" }),
        segment({ startTimecode: "00:00", endTimecode: "00:10" }),
      ],
    };
    const dataset = toTagDataset(raw, META);
    assert.deepEqual(
      dataset.segments.map((s) => [s.start, s.end, s.durationSeconds]),
      [
        [0, 10, 10],
        [10, 20, 10],
      ],
    );
    assert.equal(dataset.durationSeconds, 20);
    assert.equal(dataset.appContext, null);
  });

  test("total duration never shorter than the last segment end", () => {
    const raw: ModelOutput = {
      videoDurationTimecode: "00:15",
      segments: [segment({ startTimecode: "00:00", endTimecode: "00:18" })],
    };
    assert.equal(toTagDataset(raw, META).durationSeconds, 18);
  });

  test("rejects a segment ending at or before its start", () => {
    const raw: ModelOutput = {
      videoDurationTimecode: "00:10",
      segments: [segment({ startTimecode: "00:05", endTimecode: "00:05" })],
    };
    assert.throws(() => toTagDataset(raw, META), TagGenerationError);
  });
});

describe("modelOutputSchema", () => {
  test("rejects tags outside the fixed vocabularies", () => {
    const payload: unknown = {
      videoDurationTimecode: "00:10",
      segments: [{ ...segment(), emotions: ["excitement"] }],
    };
    assert.equal(modelOutputSchema.safeParse(payload).success, false);
  });

  test("rejects confidence outside 0-1", () => {
    const result = modelOutputSchema.safeParse({
      videoDurationTimecode: "00:10",
      segments: [segment({ confidence: 1.5 })],
    });
    assert.equal(result.success, false);
  });

  test("accepts empty tag lists (additive tags may all be absent)", () => {
    const result = modelOutputSchema.safeParse({
      videoDurationTimecode: "00:10",
      segments: [segment({ emotions: [], visual: [], adRoles: [] })],
    });
    assert.equal(result.success, true);
  });
});

describe("serializeTagDataset", () => {
  test("round-trips through tagDatasetSchema", () => {
    const dataset = toTagDataset(
      { videoDurationTimecode: "00:10", segments: [segment()] },
      { ...META, appContext: "hypercasual game" },
    );
    const revived = tagDatasetSchema.parse(JSON.parse(serializeTagDataset(dataset)));
    assert.deepEqual(revived, dataset);
  });
});
