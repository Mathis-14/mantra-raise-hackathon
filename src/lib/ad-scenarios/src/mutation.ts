// The bridge from an AdScenarioSpec to the exact bounded config the GAME reads
// at `window.__MOB_VARIANT__`, plus pure HTML injection. All values are clamped
// and re-validated: an LLM-drafted spec becomes a validated config here.

import { z } from "zod";
import { AdScenarioError, type AdScenarioSpec } from "./schema";

// ── The exact shape the game reads from window.__MOB_VARIANT__ ─────────────
// Every key optional, bounded, and .strict() so a typo can never reach the
// game silently. app.js (owned by a teammate) applies these; see docs/usage.md.

export const VariantConfigSchema = z
  .object({
    loadout: z.enum(["single", "double", "triple"]).optional(),
    startLevel: z.number().int().min(1).max(20).optional(),
    forceBoss: z.boolean().optional(),
    wavePressure: z.number().min(0.4).max(2.5).optional(),
    giantProba: z.number().min(0).max(1).optional(),
    bossScale: z.number().min(1).max(4).optional(),
    bossHp: z.number().min(8).max(60).optional(),
    gatePreset: z.enum(["default", "fail_bait", "chain_multiply", "advanced_mix"]).optional(),
    trapGateScale: z.number().min(1).max(2).optional(),
    goodGateMultiplier: z.enum(["x2", "x3"]).optional(),
    obstacleSet: z.enum(["none", "saw", "spikes", "mixed", "boost_lane"]).optional(),
    boostZones: z.boolean().optional(),
    coinMultiplier: z.number().min(1).max(5).optional(),
    confettiIntensity: z.number().min(1).max(4).optional(),
    championChargeMult: z.number().min(1).max(4).optional(),
    gameSpeed: z.number().min(0.5).max(1.2).optional(),
    mapStyle: z.enum(["default", "neon_night", "sunset", "toxic"]).optional(),
    overlayText: z.array(z.string()).optional(),
    aspect: z.literal("9:16").optional(),
    autoplay: z.boolean().optional(),
    simSeconds: z.number().int().min(5).max(120).optional(),
  })
  .strict();

export type VariantConfig = z.infer<typeof VariantConfigSchema>;

const HTML_HEAD_CLOSE = "</head>";
const MODULE_SCRIPT = /<script\b[^>]*type=["']module["'][^>]*>/i;
const MARKER = "__MOB_VARIANT__";

// Clamp helper — keep a numeric parameter inside a range before validation.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numParam(
  params: AdScenarioSpec["gameplay_mutation"]["parameters"],
  key: string,
): number | undefined {
  const v = params?.[key];
  return typeof v === "number" ? v : undefined;
}

function strParam(
  params: AdScenarioSpec["gameplay_mutation"]["parameters"],
  key: string,
): string | undefined {
  const v = params?.[key];
  return typeof v === "string" ? v : undefined;
}

function boolParam(
  params: AdScenarioSpec["gameplay_mutation"]["parameters"],
  key: string,
): boolean | undefined {
  const v = params?.[key];
  return typeof v === "boolean" ? v : undefined;
}

// Defaults per mechanic focus so a spec with sparse `parameters` still yields a
// config that visibly exercises the mechanic being tested.
function defaultsFor(focus: AdScenarioSpec["gameplay_mutation"]["mechanic_focus"]): VariantConfig {
  switch (focus) {
    case "gates":
      return { gatePreset: "fail_bait", trapGateScale: 1.4, goodGateMultiplier: "x3", wavePressure: 1.15 };
    case "champion":
      return { championChargeMult: 2.5, wavePressure: 1.3, giantProba: 0.3 };
    case "boss":
      return { forceBoss: true, bossScale: 2.6, bossHp: 40, wavePressure: 1.2 };
    case "loadout":
      return { loadout: "triple", wavePressure: 1.1 };
    case "speed_boost":
      return { obstacleSet: "boost_lane", boostZones: true, gameSpeed: 1.15 };
    case "danger_comeback":
      return { wavePressure: 2.0, giantProba: 0.5, gatePreset: "chain_multiply", goodGateMultiplier: "x3" };
    case "coin_reward":
      return { coinMultiplier: 3, confettiIntensity: 4 };
    case "base_destruction":
      return { wavePressure: 1.5, coinMultiplier: 2, confettiIntensity: 3 };
    default:
      return {};
  }
}

/**
 * Translates a validated spec's gameplay_mutation into a validated
 * VariantConfig: focus defaults, then spec `parameters` overrides (clamped),
 * always 9:16 and overlays from the recording plan. Throws
 * AdScenarioError('mutate', ...) if the resolved draft fails the bounds check.
 */
export function resolveVariantConfig(spec: AdScenarioSpec): VariantConfig {
  const params = spec.gameplay_mutation.parameters;
  const draft: Record<string, unknown> = { ...defaultsFor(spec.gameplay_mutation.mechanic_focus) };

  // Spec parameters use the AD_SCENARIO_SPEC.md naming; map to config keys.
  const trap = numParam(params, "trap_gate_scale");
  if (trap !== undefined) draft.trapGateScale = clamp(trap, 1, 2);

  const goodMult = strParam(params, "good_gate_multiplier");
  if (goodMult === "x2" || goodMult === "x3") draft.goodGateMultiplier = goodMult;

  const pressure = numParam(params, "enemy_wave_pressure") ?? numParam(params, "wave_pressure");
  if (pressure !== undefined) draft.wavePressure = clamp(pressure, 0.4, 2.5);

  const coin = numParam(params, "final_coin_multiplier") ?? numParam(params, "coin_multiplier");
  if (coin !== undefined) draft.coinMultiplier = clamp(coin, 1, 5);

  const confetti = numParam(params, "confetti_intensity");
  if (confetti !== undefined) draft.confettiIntensity = clamp(confetti, 1, 4);

  const champ = numParam(params, "champion_charge_mult") ?? numParam(params, "champion_speed");
  if (champ !== undefined) draft.championChargeMult = clamp(champ, 1, 4);

  const giant = numParam(params, "giant_proba");
  if (giant !== undefined) draft.giantProba = clamp(giant, 0, 1);

  const bScale = numParam(params, "boss_scale");
  if (bScale !== undefined) draft.bossScale = clamp(bScale, 1, 4);

  const bHp = numParam(params, "boss_hp");
  if (bHp !== undefined) draft.bossHp = clamp(bHp, 8, 60);

  const speed = numParam(params, "game_speed");
  if (speed !== undefined) draft.gameSpeed = clamp(speed, 0.5, 1.2);

  const start = numParam(params, "start_level");
  if (start !== undefined) draft.startLevel = clamp(Math.round(start), 1, 20);

  const boost = boolParam(params, "boost_zones");
  if (boost !== undefined) draft.boostZones = boost;

  const loadout = strParam(params, "loadout");
  if (loadout === "single" || loadout === "double" || loadout === "triple") draft.loadout = loadout;

  const mapStyle = strParam(params, "map_style");
  if (mapStyle && ["default", "neon_night", "sunset", "toxic"].includes(mapStyle)) {
    draft.mapStyle = mapStyle;
  }

  // Always-on invariants: vertical + overlay text sourced from the plan.
  draft.aspect = "9:16";
  draft.overlayText = spec.recording_plan.overlay_text;

  const parsed = VariantConfigSchema.safeParse(draft);
  if (!parsed.success) {
    throw new AdScenarioError("mutate", z.prettifyError(parsed.error), { cause: parsed.error });
  }
  return parsed.data;
}

/**
 * Returns a COPY of baseHtml with a `<script>window.__MOB_VARIANT__=…</script>`
 * injected just before </head> (or before the first module script). Pure:
 * never mutates the original string. Throws AdScenarioError('mutate', ...) if
 * no injection marker is present.
 */
export function buildVariantHtml(baseHtml: string, config: VariantConfig): string {
  if (baseHtml.includes(MARKER)) {
    throw new AdScenarioError(
      "mutate",
      "base HTML already defines __MOB_VARIANT__ — refusing to double-inject",
    );
  }
  // JSON is safe to inline; escape </script> defensively.
  const json = JSON.stringify(config).replace(/<\/script>/gi, "<\\/script>");
  const tag = `<script>window.${MARKER}=${json};</script>`;

  const headIdx = baseHtml.indexOf(HTML_HEAD_CLOSE);
  if (headIdx !== -1) {
    return baseHtml.slice(0, headIdx) + tag + "\n" + baseHtml.slice(headIdx);
  }
  const moduleMatch = MODULE_SCRIPT.exec(baseHtml);
  if (moduleMatch) {
    const at = moduleMatch.index;
    return baseHtml.slice(0, at) + tag + "\n" + baseHtml.slice(at);
  }
  throw new AdScenarioError(
    "mutate",
    "no injection marker found (expected </head> or a <script type=\"module\">)",
  );
}
