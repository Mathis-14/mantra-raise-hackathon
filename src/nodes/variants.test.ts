import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { PlaytestReport } from "@/contracts/types";
import { generateVariants } from "@/nodes/variants";

const BASE_HTML = "<!doctype html><html><head><title>variant</title></head><body></body></html>";

const REPORT: PlaytestReport = {
  run_id: "run_123",
  playable: true,
  fun_score: 7,
  fun_rationale: "The crowd growth is readable and satisfying.",
  friction_points: ["gate choice needs stronger contrast", "boss payoff could be bigger"],
  bugs: [],
  session_summary: "The agent steered through multiplier gates, grew the crowd, and destroyed the base.",
  headline: "Readable crowd growth with room for stronger ad hooks",
};

describe("generateVariants", () => {
  test("returns persisted variants as phone-safe playable wrappers", async () => {
    const variants = await generateVariants({
      runId: "run_123",
      gameHtml: BASE_HTML,
      report: REPORT,
      marketContext: "hypercasual fail-bait and satisfying crowd growth",
      count: 5,
      variantGameUrl: "https://game.example.test/",
    });

    assert.equal(variants.length, 5);
    assert.equal(new Set(variants.map((variant) => variant.id)).size, 5);

    for (const variant of variants) {
      assert.equal(variant.run_id, "run_123");
      assert.ok(variant.name.length > 0);
      assert.ok(variant.hypothesis.length > 0);
      assert.match(variant.game_html, /<iframe/);
      assert.match(variant.game_html, /https:\/\/game\.example\.test\//);
      assert.match(variant.game_html, /[?&]variant=/);
      assert.doesNotMatch(variant.game_html, /__MOB_VARIANT__/);
    }
  });
});
