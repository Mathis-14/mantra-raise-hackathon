import { Buffer } from "node:buffer";

import { z } from "zod";

export const MAP_STYLE_IDS = ["default", "neon_night", "sunset", "toxic"] as const;
export const TEAM_COLOR_IDS = ["classic", "cyan_magenta", "lime_violet", "gold_crimson"] as const;
export const ASSET_STYLE_IDS = ["default", "hazard", "armory", "treasure", "snow"] as const;

export const VariantConfigSchema = z
  .object({
    loadout: z.enum(["single", "double", "triple"]).optional(),
    startLevel: z.number().int().min(1).max(50).optional(),
    forceBoss: z.boolean().optional(),
    wavePressure: z.number().min(0.4).max(2.5).optional(),
    giantProba: z.number().min(0).max(1).optional(),
    bossScale: z.number().min(1).max(4).optional(),
    bossHp: z.number().min(8).max(80).optional(),
    gatePreset: z.enum(["default", "fail_bait", "chain_multiply", "advanced_mix"]).optional(),
    coinMultiplier: z.number().min(1).max(5).optional(),
    championChargeMult: z.number().min(1).max(4).optional(),
    mapStyle: z.enum(MAP_STYLE_IDS).optional(),
    teamColor: z.enum(TEAM_COLOR_IDS).optional(),
    assetStyle: z.enum(ASSET_STYLE_IDS).optional(),
    overlayText: z.array(z.string().min(1)).max(5).optional(),
    aspect: z.literal("9:16").optional(),
  })
  .strict();

export type VariantConfig = z.infer<typeof VariantConfigSchema>;

export const VARIANT_PRESET_IDS = [
  "fail_bait_gate",
  "triple_cannon_chain",
  "boss_crush",
  "comeback_pressure",
  "coin_reward",
] as const;

export type VariantPresetId = (typeof VARIANT_PRESET_IDS)[number];

export interface VariantPreset {
  id: VariantPresetId;
  name: string;
  hypothesis: string;
  config: VariantConfig;
}

export const VARIANT_PRESETS: Record<VariantPresetId, VariantPreset> = {
  fail_bait_gate: {
    id: "fail_bait_gate",
    name: "Fail-Bait Gate",
    hypothesis: "A visibly risky red gate beside a safer multiplier should increase watch time by making viewers want to correct the player.",
    config: {
      gatePreset: "fail_bait",
      wavePressure: 1.15,
      mapStyle: "toxic",
      teamColor: "lime_violet",
      assetStyle: "hazard",
      overlayText: ["Only 1% choose right", "Don't hit red!", "Try now"],
      aspect: "9:16",
    },
  },
  triple_cannon_chain: {
    id: "triple_cannon_chain",
    name: "Triple Cannon Chain",
    hypothesis: "Starting with a triple cannon and chained multipliers should make crowd growth immediately readable and more satisfying.",
    config: {
      loadout: "triple",
      gatePreset: "chain_multiply",
      wavePressure: 0.85,
      coinMultiplier: 2,
      mapStyle: "neon_night",
      teamColor: "cyan_magenta",
      assetStyle: "armory",
      overlayText: ["Triple cannon chain", "x3 into x3!", "How big is yours?"],
      aspect: "9:16",
    },
  },
  boss_crush: {
    id: "boss_crush",
    name: "Boss Crush",
    hypothesis: "An oversized boss with visible HP should create doubt early and a clearer payoff when the crowd wins.",
    config: {
      loadout: "triple",
      startLevel: 3,
      forceBoss: true,
      bossHp: 56,
      bossScale: 3.5,
      wavePressure: 0.9,
      mapStyle: "sunset",
      teamColor: "gold_crimson",
      assetStyle: "treasure",
      overlayText: ["This boss looks impossible", "HP dropping...", "Beat it?"],
      aspect: "9:16",
    },
  },
  comeback_pressure: {
    id: "comeback_pressure",
    name: "Comeback Pressure",
    hypothesis: "Heavy early pressure should create a near-loss moment that makes the recovery more compelling.",
    config: {
      gatePreset: "chain_multiply",
      wavePressure: 2,
      giantProba: 0.5,
      championChargeMult: 2.4,
      mapStyle: "toxic",
      teamColor: "lime_violet",
      assetStyle: "hazard",
      overlayText: ["I almost lost...", "Save it!", "Could you?"],
      aspect: "9:16",
    },
  },
  coin_reward: {
    id: "coin_reward",
    name: "Reward Shower",
    hypothesis: "A bigger coin payoff after the base falls should make the end state feel more rewarding and ad-friendly.",
    config: {
      loadout: "double",
      gatePreset: "advanced_mix",
      coinMultiplier: 4,
      wavePressure: 1,
      mapStyle: "sunset",
      teamColor: "gold_crimson",
      assetStyle: "treasure",
      overlayText: ["Big reward run", "Break the base", "Claim the coins"],
      aspect: "9:16",
    },
  },
};

export function listVariantPresets(): VariantPreset[] {
  return VARIANT_PRESET_IDS.map((id) => VARIANT_PRESETS[id]);
}

export function encodeVariantConfig(config: VariantConfig): string {
  const parsed = VariantConfigSchema.parse(config);
  return Buffer.from(JSON.stringify(parsed), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildVariantPreviewUrl(
  gameUrl: string,
  config: VariantConfig,
  options: { autostart?: boolean; bot?: boolean; simSeconds?: number } = {},
): string {
  const url = new URL(gameUrl);
  url.searchParams.set("variant", encodeVariantConfig(config));
  if (options.autostart) url.searchParams.set("autostart", "");
  if (options.bot) url.searchParams.set("bot", "");
  if (options.simSeconds !== undefined) {
    url.searchParams.set("sim", String(Math.max(0, Math.min(60, options.simSeconds))));
  }
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPhoneWrapperHtml(input: { title: string; previewUrl: string }): string {
  const title = escapeHtml(input.title);
  const previewUrl = escapeHtml(input.previewUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title}</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050713}
iframe{display:block;width:100%;height:100%;border:0;background:#050713}
</style>
</head>
<body>
<iframe src="${previewUrl}" title="${title}" allow="autoplay; fullscreen; pointer-lock"></iframe>
</body>
</html>`;
}
