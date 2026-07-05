import assert from "node:assert/strict";
import test from "node:test";

import { compareGameplayVersions, type NvidiaAnalysisDraft } from "@/nodes/nvidia-analysis";

const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

const ORIGINAL: NvidiaAnalysisDraft = {
  color: {
    score: 61,
    confidence: 0.86,
    summary: "Enemies blend into the track during crowded encounters.",
    strengths: ["Player color remains recognizable"],
    issues: ["Enemy and background hues converge"],
  },
  audio: {
    score: 58,
    confidence: 0.82,
    summary: "Important collisions have weak feedback.",
    strengths: ["Music intensity is stable"],
    issues: ["Impact sounds are not prominent"],
  },
  video: {
    score: 66,
    confidence: 0.9,
    summary: "The opening communicates the mechanic but the middle drags.",
    strengths: ["Core action is visible immediately"],
    issues: ["Low event density in the middle"],
  },
  verdict: "iterate",
  summary: "Readable core loop with weak audiovisual payoff.",
  evidence: [{
    timestamp_seconds: 8.2,
    dimension: "video",
    observation: "No new threat or reward appears for several seconds.",
    player_impact: "Momentum drops.",
  }],
  variant_hypotheses: [{
    problem: "The middle section loses momentum.",
    proposed_change: "Introduce the first gate earlier.",
    expected_effect: "Increase meaningful decisions in the first ten seconds.",
    evidence_timestamp_seconds: 8.2,
  }],
};

const HIGH_CONTRAST: NvidiaAnalysisDraft = {
  color: {
    score: 88,
    confidence: 0.92,
    summary: "Player, enemies, and gates remain distinct during crowding.",
    strengths: ["Strong foreground separation"],
    issues: [],
  },
  audio: {
    score: 79,
    confidence: 0.87,
    summary: "Impacts and rewards have clear synchronized feedback.",
    strengths: ["Reward sound aligns with the visual event"],
    issues: ["One repeated impact sample is noticeable"],
  },
  video: {
    score: 84,
    confidence: 0.91,
    summary: "The first meaningful choice arrives quickly and pacing remains stable.",
    strengths: ["Early decision point", "Clear reward peak"],
    issues: [],
  },
  verdict: "promising",
  summary: "The strongest version due to readable action and consistent feedback.",
  evidence: [{
    timestamp_seconds: 4.6,
    dimension: "color",
    observation: "Enemy silhouettes stay distinct against the track.",
    player_impact: "Threats can be recognized without hesitation.",
  }],
  variant_hypotheses: [{
    problem: "The impact sample becomes repetitive.",
    proposed_change: "Rotate three pitch-varied impact samples.",
    expected_effect: "Preserve feedback clarity without audio fatigue.",
    evidence_timestamp_seconds: 13.1,
  }],
};

test("compares NVIDIA analyses and ranks the strongest gameplay version", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: Array<{ type: string; video_url?: { url: string } }> }>;
    };
    const videoUrl = body.messages[0]?.content[0]?.video_url?.url;
    const draft = videoUrl?.includes("high-contrast") ? HIGH_CONTRAST : ORIGINAL;
    return Response.json({ choices: [{ message: { content: JSON.stringify(draft) } }] });
  };

  const comparison = await compareGameplayVersions({
    runId: "run-1",
    versions: [
      { id: "original", name: "Original", videoUrl: "https://example.test/original.mp4", audioPresent: true },
      { id: "high-contrast", name: "High Contrast", videoUrl: "https://example.test/high-contrast.mp4", audioPresent: true },
    ],
  }, {
    apiKey: "test-key",
    baseUrl: "https://integrate.api.nvidia.test/v1",
    model: MODEL,
    fetchImpl,
  });

  assert.equal(comparison.winner_version_id, "high-contrast");
  assert.equal(comparison.versions[0]?.rank, 1);
  assert.equal(comparison.versions[0]?.overall_score, 84);
  assert.equal(comparison.versions[1]?.overall_score, 62.5);
  assert.match(comparison.winner_reason, /color readability/);
  assert.equal(comparison.versions[0]?.provenance.provider, "NVIDIA");
  assert.equal(comparison.versions[0]?.provenance.model, MODEL);
});

test("retries once when NVIDIA returns malformed output", async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    const content = requests === 1 ? "not-json" : JSON.stringify(ORIGINAL);
    return Response.json({ choices: [{ message: { content } }] });
  };

  const comparison = await compareGameplayVersions({
    runId: "run-retry",
    versions: [
      { id: "a", name: "A", videoUrl: "https://example.test/a.mp4", audioPresent: true },
      { id: "b", name: "B", videoUrl: "https://example.test/b.mp4", audioPresent: true },
    ],
  }, {
    apiKey: "test-key",
    baseUrl: "https://integrate.api.nvidia.test/v1",
    model: MODEL,
    fetchImpl,
  });

  assert.equal(requests, 3);
  assert.equal(comparison.versions.length, 2);
});

test("rejects duplicate gameplay version IDs before calling NVIDIA", async () => {
  await assert.rejects(
    compareGameplayVersions({
      runId: "run-duplicate",
      versions: [
        { id: "same", name: "A", videoUrl: "https://example.test/a.mp4", audioPresent: true },
        { id: "same", name: "B", videoUrl: "https://example.test/b.mp4", audioPresent: true },
      ],
    }, {
      apiKey: "test-key",
      baseUrl: "https://integrate.api.nvidia.test/v1",
      model: MODEL,
      fetchImpl: async () => {
        throw new Error("fetch must not be called");
      },
    }),
    /Gameplay version IDs must be unique/,
  );
});
