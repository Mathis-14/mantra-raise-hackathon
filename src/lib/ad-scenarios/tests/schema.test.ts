// Unit tests for the pure contract layer (no Gemini, no network, no Playwright).
// Run: npx tsx --test src/lib/ad-scenarios/tests/*.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MECHANIC_FOCUS,
  adScenarioSpecSchema,
  variantConfigSchema,
} from "../src/schema";
import { resolveVariantConfig, buildPlayUrl, encodeVariant } from "../src/mutation";
import { SCENARIO_TEMPLATES, focusForTrend, templateForTrend } from "../src/templates";

describe("variantConfigSchema", () => {
  test("accepts a full layout + skin config", () => {
    const config = {
      startLevel: 3,
      loadout: "triple" as const,
      skin: "snow" as const,
      layout: {
        walls: [
          { x: -1.5, z: 5, halfW: 1.2, halfD: 0.75, kind: "crates" as const, axis: "x" as const },
          { x: 1.5, z: -6, halfW: 0.4, halfD: 4.5, kind: "crates" as const, axis: "z" as const },
        ],
        hazards: [{ type: "saw" as const, x: -3.4, z: 0 }],
        lanesX: [-3.1, 0, 3.1],
        hordeMult: 1.6,
      },
      overlayText: ["Watch this", "x1000"],
      autoplay: true,
      wavePressure: 1.8,
      aspect: "9:16" as const,
    };
    assert.equal(variantConfigSchema.safeParse(config).success, true);
  });

  test("rejects an unknown key (strict)", () => {
    const result = variantConfigSchema.safeParse({ startLevel: 2, gameSpeed: 1.5 });
    assert.equal(result.success, false);
  });

  test("rejects a wall outside the game clamp range", () => {
    const result = variantConfigSchema.safeParse({
      layout: { walls: [{ x: 9, z: 0, halfW: 1 }] },
    });
    assert.equal(result.success, false);
  });

  test("rejects wavePressure over the game max", () => {
    assert.equal(variantConfigSchema.safeParse({ wavePressure: 3 }).success, false);
  });

  test("rejects startLevel above 50", () => {
    assert.equal(variantConfigSchema.safeParse({ startLevel: 51 }).success, false);
  });

  test("rejects an obsolete key (gatePreset)", () => {
    assert.equal(variantConfigSchema.safeParse({ gatePreset: "trap" }).success, false);
  });

  test("accepts an empty config (all optional)", () => {
    assert.equal(variantConfigSchema.safeParse({}).success, true);
  });
});

describe("adScenarioSpecSchema", () => {
  test("every template is a valid spec", () => {
    for (const focus of MECHANIC_FOCUS) {
      assert.equal(adScenarioSpecSchema.safeParse(SCENARIO_TEMPLATES[focus]).success, true, focus);
    }
  });

  test("rejects a mechanicFocus outside the vocabulary", () => {
    const result = adScenarioSpecSchema.safeParse({
      ...SCENARIO_TEMPLATES.fail_bait,
      mechanicFocus: "gate_spam",
    });
    assert.equal(result.success, false);
  });

  test("rejects intensity outside 0-1", () => {
    const result = adScenarioSpecSchema.safeParse({
      ...SCENARIO_TEMPLATES.fail_bait,
      intensity: 1.5,
    });
    assert.equal(result.success, false);
  });
});

describe("resolveVariantConfig", () => {
  test("produces a valid, autoplay-enabled config for every template", () => {
    for (const focus of MECHANIC_FOCUS) {
      const config = resolveVariantConfig(SCENARIO_TEMPLATES[focus]);
      assert.equal(variantConfigSchema.safeParse(config).success, true, focus);
      assert.equal(config.autoplay, true, focus);
      assert.equal(config.aspect, "9:16", focus);
      assert.ok(config.overlayText && config.overlayText.length > 0, focus);
      assert.ok(config.layout, focus);
    }
  });

  test("respects the spec's explicit skin and loadout", () => {
    const config = resolveVariantConfig({
      ...SCENARIO_TEMPLATES.crowd_explosion,
      skin: "dusk",
      loadout: "single",
    });
    assert.equal(config.skin, "dusk");
    assert.equal(config.loadout, "single");
  });

  test("scales wave pressure within bounds across the intensity range", () => {
    for (const intensity of [0, 0.5, 1]) {
      const config = resolveVariantConfig({ ...SCENARIO_TEMPLATES.danger_comeback, intensity });
      assert.ok(config.wavePressure !== undefined);
      assert.ok(config.wavePressure >= 0.4 && config.wavePressure <= 2.5, `intensity ${intensity}`);
    }
  });

  test("falls back to the hook when overlayText is empty", () => {
    const config = resolveVariantConfig({ ...SCENARIO_TEMPLATES.speed_boost, overlayText: [] });
    assert.deepEqual(config.overlayText, [SCENARIO_TEMPLATES.speed_boost.hook]);
  });
});

describe("templates / trend routing", () => {
  test("routes keywords to the expected focus", () => {
    assert.equal(focusForTrend("fail bait maze"), "fail_bait");
    assert.equal(focusForTrend("crush the boss"), "boss_crush");
    assert.equal(focusForTrend("ice maze"), "maze_navigation");
    assert.equal(focusForTrend("crowd explode"), "crowd_explosion");
    assert.equal(focusForTrend(null), "crowd_explosion");
    assert.equal(focusForTrend("totally unrelated words"), "crowd_explosion");
  });

  test("weaves the trend into the hook", () => {
    const spec = templateForTrend("ice maze fail bait");
    assert.ok(spec.hook.includes("ice maze fail bait"));
    assert.equal(adScenarioSpecSchema.safeParse(spec).success, true);
  });
});

describe("mutation url helpers", () => {
  test("play URL round-trips the config through base64", () => {
    const config = resolveVariantConfig(SCENARIO_TEMPLATES.fail_bait);
    const url = buildPlayUrl(config, { port: 5173, autostart: true });
    const b64 = encodeVariant(config);
    assert.ok(url.includes(`variant=${b64}`));
    const decoded = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    assert.deepEqual(decoded, config);
    assert.ok(url.endsWith("&autostart"));
  });
});
