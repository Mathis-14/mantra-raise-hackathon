import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildPhoneWrapperHtml,
  buildVariantPreviewUrl,
  listVariantPresets,
  VARIANT_PRESET_IDS,
  VariantConfigSchema,
} from "@/lib/variant-config";

describe("variant presets", () => {
  test("define five engine-backed configs", () => {
    const presets = listVariantPresets();

    assert.equal(presets.length, 5);
    assert.deepEqual(presets.map((preset) => preset.id), [...VARIANT_PRESET_IDS]);
    for (const preset of presets) {
      assert.equal(VariantConfigSchema.safeParse(preset.config).success, true, preset.id);
      assert.ok(preset.name.length > 0);
      assert.ok(preset.hypothesis.length > 0);
    }
  });
});

describe("variant preview URL", () => {
  test("encodes config with URL-safe base64", () => {
    const preset = listVariantPresets()[0];
    if (!preset) throw new Error("missing preset");

    const url = buildVariantPreviewUrl("https://game.example.test/?existing=1", preset.config, {
      autostart: true,
      bot: true,
      simSeconds: 8,
    });
    const parsed = new URL(url);
    const encoded = parsed.searchParams.get("variant");

    assert.equal(parsed.searchParams.get("existing"), "1");
    assert.equal(parsed.searchParams.has("autostart"), true);
    assert.equal(parsed.searchParams.has("bot"), true);
    assert.equal(parsed.searchParams.get("sim"), "8");
    assert.ok(encoded);
    assert.doesNotMatch(encoded, /[+/=]/);
  });
});

describe("phone wrapper", () => {
  test("escapes title and preview URL", () => {
    const html = buildPhoneWrapperHtml({
      title: "<Boss & Gate>",
      previewUrl: "https://game.example.test/?x=<script>",
    });

    assert.match(html, /&lt;Boss &amp; Gate&gt;/);
    assert.match(html, /https:\/\/game\.example\.test\/\?x=&lt;script&gt;/);
    assert.doesNotMatch(html, /<Boss & Gate>/);
  });
});
