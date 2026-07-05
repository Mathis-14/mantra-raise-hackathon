import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildFallbackVariantSpecs,
  buildVariantHtml,
  prepareVariantSourceHtml,
  variantPatchSpecSchema,
  type VariantPatchSpec,
} from "@/nodes/variants";
import type { PlaytestReport } from "@/contracts/types";

const REPORT: PlaytestReport = {
  run_id: "00000000-0000-4000-a000-000000000001",
  playable: true,
  fun_score: 7,
  fun_rationale: "The cannon loop is readable and satisfying once the first gate choice is clear.",
  friction_points: ["The opening seconds need a stronger hook", "Failure is not visible enough"],
  bugs: [],
  session_summary: "Started the game, steered through multiplier gates, built a crowd, then attacked the base.",
  headline: "Readable crowd action with room for a sharper hook",
};

const PATCH: VariantPatchSpec = {
  name: "Boss Pressure Hook",
  hypothesis: "Tests whether a clearer boss threat and high-contrast payoff improves first-session urgency.",
  headline: "Boss incoming",
  subheadline: "Steer hard through the biggest gate",
  accentColor: "#ff3366",
  secondaryColor: "#22d3ee",
  mood: "boss",
  pressure: "chaotic",
  overlayPosition: "top",
};

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("prepareVariantSourceHtml", () => {
  test("injects a base href before root-relative module assets", () => {
    const html = [
      "<!doctype html>",
      "<html><head>",
      '<script type="module" src="/src/main.js"></script>',
      "</head><body><div id=\"game\"></div></body></html>",
    ].join("");

    const prepared = prepareVariantSourceHtml(html, "http://127.0.0.1:5174/");

    assert.match(prepared, /<base data-mantra-source href="http:\/\/127\.0\.0\.1:5174\/">/);
    assert.ok(prepared.indexOf("<base data-mantra-source") < prepared.indexOf("src=\"/src/main.js\""));
    assert.equal(occurrences(prepareVariantSourceHtml(prepared, "http://127.0.0.1:5174/"), "data-mantra-source"), 1);
  });
});

describe("buildVariantHtml", () => {
  test("preserves the input game and injects a safe playable variant runtime", () => {
    const html = [
      "<!doctype html>",
      "<html><head><title>Prototype</title></head>",
      "<body><canvas id=\"game\"></canvas><script src=\"/src/main.js\"></script></body></html>",
    ].join("");
    const riskyPatch = {
      ...PATCH,
      headline: "Break </script> attempt",
    };

    const variantHtml = buildVariantHtml(html, riskyPatch);

    assert.match(variantHtml, /<script src="\/src\/main\.js"><\/script>/);
    assert.match(variantHtml, /data-mantra-variant-style/);
    assert.match(variantHtml, /data-mantra-variant-runtime/);
    assert.match(variantHtml, /window\.__MOB_VARIANT__/);
    assert.doesNotMatch(variantHtml, /Break <\/script> attempt/);
  });
});

describe("buildFallbackVariantSpecs", () => {
  test("returns valid visible variants without fixed deterministic output", () => {
    const specs = buildFallbackVariantSpecs({
      count: 5,
      report: REPORT,
      marketContext: "Hypercasual players respond to quick failure and visible rewards.",
    });

    assert.equal(specs.length, 5);
    assert.equal(new Set(specs.map((spec) => spec.name)).size, 5);
    assert.ok(new Set(specs.map((spec) => spec.accentColor)).size > 1);
    for (const spec of specs) {
      assert.equal(variantPatchSpecSchema.safeParse(spec).success, true);
    }
  });
});
