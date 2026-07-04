// Unit tests for the pure layer (no Gemini, no network, no fs writes).
// Run: npx tsx --test src/lib/ad-scenarios/tests/*.test.ts

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AdScenarioError,
  buildVariantHtml,
  generateVariantFromScenario,
  listTemplates,
  qualitativeChecklist,
  resolveVariantConfig,
  TEMPLATES,
  validateScenario,
  VariantConfigSchema,
} from "../index";

const BASE_HTML = "<!doctype html><html><head><title>Mob</title></head><body></body></html>";

describe("validateScenario", () => {
  test("accepts all 8 templates", () => {
    const specs = listTemplates();
    assert.equal(specs.length, 8);
    for (const spec of specs) {
      assert.equal(validateScenario(spec).id, spec.id);
    }
  });

  test("rejects an incomplete scenario with a readable message", () => {
    let err: unknown;
    try {
      validateScenario({ id: "x", title: "y" });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof AdScenarioError);
    assert.equal((err as AdScenarioError).stage, "validate");
    assert.match((err as AdScenarioError).message, /ad_scenario_validate_failed/);
  });
});

describe("qualitativeChecklist", () => {
  test("passes on every template", () => {
    for (const spec of listTemplates()) {
      const result = qualitativeChecklist(spec);
      assert.deepEqual(result.failed, [], `${spec.id} failed: ${result.failed.join(",")}`);
      assert.equal(result.ok, true);
    }
  });
});

describe("resolveVariantConfig", () => {
  test("produces a valid, 9:16 config for every template", () => {
    for (const spec of listTemplates()) {
      const config = resolveVariantConfig(spec);
      assert.equal(config.aspect, "9:16");
      assert.deepEqual(config.overlayText, spec.recording_plan.overlay_text);
      assert.equal(VariantConfigSchema.safeParse(config).success, true);
    }
  });

  test("clamps out-of-range spec parameters", () => {
    const spec = structuredClone(TEMPLATES.fail_bait_gate!);
    spec.gameplay_mutation.parameters = {
      trap_gate_scale: 9, // > max 2
      enemy_wave_pressure: 99, // > max 2.5
      final_coin_multiplier: 100, // > max 5
    };
    const config = resolveVariantConfig(spec);
    assert.equal(config.trapGateScale, 2);
    assert.equal(config.wavePressure, 2.5);
    assert.equal(config.coinMultiplier, 5);
  });
});

describe("buildVariantHtml", () => {
  test("injects the config script before </head> without mutating the original", () => {
    const config = resolveVariantConfig(TEMPLATES.crowd_explosion!);
    const out = buildVariantHtml(BASE_HTML, config);
    assert.notEqual(out, BASE_HTML);
    assert.equal(BASE_HTML.includes("__MOB_VARIANT__"), false);
    assert.match(out, /<script>window\.__MOB_VARIANT__=/);
    assert.ok(out.indexOf("__MOB_VARIANT__") < out.indexOf("</head>"));
  });

  test("throws when no injection marker is present", () => {
    const config = resolveVariantConfig(TEMPLATES.boss_crush!);
    assert.throws(() => buildVariantHtml("<div>no head</div>", config), AdScenarioError);
  });

  test("refuses to double-inject", () => {
    const config = resolveVariantConfig(TEMPLATES.boss_crush!);
    const once = buildVariantHtml(BASE_HTML, config);
    assert.throws(() => buildVariantHtml(once, config), AdScenarioError);
  });
});

describe("generateVariantFromScenario", () => {
  test("produces a playable variant with rich metadata", () => {
    const gen = generateVariantFromScenario(TEMPLATES.champion_release!, BASE_HTML);
    assert.equal(gen.variant.name, TEMPLATES.champion_release!.title);
    assert.match(gen.variant.game_html, /__MOB_VARIANT__/);
    assert.ok(gen.creative_prompt.includes("0-3s:"));
    assert.ok(gen.playtest_checklist.length >= 4);
    assert.equal(gen.recording_plan.aspect_ratio, "9:16");
    assert.ok(gen.dashboard_blurb.length > 0);
  });
});
