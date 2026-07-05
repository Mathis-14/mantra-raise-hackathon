// The module's contract: Zod schemas, inferred types, and the game-side
// VariantConfig that Mob Rush consumes via window.__MOB_VARIANT__ / ?variant=.
// Everything here is pure — no I/O, no Gemini — so it is the unit-test surface.
//
// Bounds MUST mirror the game's own sanitizers exactly (src/levels/layouts.js
// setLayoutOverride, src/core/app.js readVariantConfig, src/enemy/waves.js).
// Anything outside the game's clamp range is silently coerced in-game, so we
// reject it at the boundary instead of shipping a config the game reinterprets.

import { z } from "zod";

// --- Fixed vocabularies (game contract) ------------------------------------

export const SKINS = ["canyon", "dusk", "snow"] as const;
export const LOADOUTS = ["single", "double", "triple"] as const;
export const WALL_KINDS = ["crates", "mound"] as const;
export const WALL_AXES = ["x", "z"] as const;
export const HAZARD_TYPES = ["saw", "spikes", "spikesLarge"] as const;
export const ASPECT = "9:16" as const;

// mechanic_focus: the ad-making angle a variant leans on. Free of game detail —
// resolveVariantConfig maps each to concrete layout/skin/pressure choices.
export const MECHANIC_FOCUS = [
  "fail_bait",
  "crowd_explosion",
  "boss_crush",
  "danger_comeback",
  "speed_boost",
  "maze_navigation",
  "close_call",
] as const;

export const skinSchema = z.enum(SKINS);
export const loadoutSchema = z.enum(LOADOUTS);
export const wallKindSchema = z.enum(WALL_KINDS);
export const hazardTypeSchema = z.enum(HAZARD_TYPES);
export const mechanicFocusSchema = z.enum(MECHANIC_FOCUS);

export type Skin = z.infer<typeof skinSchema>;
export type Loadout = z.infer<typeof loadoutSchema>;
export type WallKind = z.infer<typeof wallKindSchema>;
export type HazardType = z.infer<typeof hazardTypeSchema>;
export type MechanicFocus = z.infer<typeof mechanicFocusSchema>;

export type AdScenarioStage = "compose" | "resolve" | "persist" | "record";

/** Every failure inside the module surfaces as this — callers never see raw errors. */
export class AdScenarioError extends Error {
  constructor(
    readonly stage: AdScenarioStage,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`ad_scenario_${stage}_failed: ${message}`, options);
    this.name = "AdScenarioError";
  }
}

// --- VariantConfig (what the game reads) -----------------------------------

// Bounds copied verbatim from src/levels/layouts.js setLayoutOverride.
export const wallSchema = z
  .object({
    x: z.number().min(-4).max(4),
    z: z.number().min(-18).max(14),
    halfW: z.number().min(0.4).max(2.6),
    halfD: z.number().min(0.4).max(5).optional(),
    kind: wallKindSchema.optional(),
    axis: z.enum(WALL_AXES).optional(),
  })
  .strict();

export const hazardSchema = z
  .object({
    type: hazardTypeSchema,
    x: z.number().min(-4).max(4),
    z: z.number().min(-18).max(14),
  })
  .strict();

export const layoutSchema = z
  .object({
    walls: z.array(wallSchema).max(10).optional(),
    hazards: z.array(hazardSchema).max(6).optional(),
    lanesX: z.array(z.number()).min(2).max(4).optional(),
    hordeMult: z.number().min(0.5).max(4).optional(),
  })
  .strict();

export const variantConfigSchema = z
  .object({
    startLevel: z.number().int().min(1).max(50).optional(),
    loadout: loadoutSchema.optional(),
    skin: skinSchema.optional(),
    layout: layoutSchema.optional(),
    overlayText: z.array(z.string().min(1)).optional(),
    autoplay: z.boolean().optional(),
    wavePressure: z.number().min(0.4).max(2.5).optional(),
    aspect: z.literal(ASPECT).optional(),
  })
  .strict();

export type Wall = z.infer<typeof wallSchema>;
export type Hazard = z.infer<typeof hazardSchema>;
export type VariantLayout = z.infer<typeof layoutSchema>;
export type VariantConfig = z.infer<typeof variantConfigSchema>;

// --- AdScenarioSpec (the creative brief, domain-agnostic) ------------------
// This is what an LLM (or the deterministic fallback) produces from inspiration.
// resolveVariantConfig translates it into a game-legal VariantConfig.

export const adScenarioSpecSchema = z
  .object({
    hook: z.string().min(1).describe("One-line scroll-stopping promise for the ad opener"),
    mechanicFocus: mechanicFocusSchema.describe("The gameplay angle this variant leans on"),
    hypothesis: z
      .string()
      .min(1)
      .describe("What we believe will make this variant convert, in one sentence"),
    skin: skinSchema.describe("Visual theme that best sells the hook"),
    loadout: loadoutSchema.describe("Cannon loadout that fits the pace of the hook"),
    intensity: z
      .number()
      .min(0)
      .max(1)
      .describe("0 = calm/clean, 1 = maximum chaos — scales pressure and clutter"),
    overlayText: z
      .array(z.string().min(1))
      .max(4)
      .describe("Short on-screen banner lines shown during gameplay"),
  })
  .strict();

export type AdScenarioSpec = z.infer<typeof adScenarioSpecSchema>;

// --- Persisted variant (rejouable) -----------------------------------------

export const recordingSchema = z
  .object({
    url: z.string().min(1),
    seconds: z.number().positive(),
    aspect: z.literal(ASPECT),
  })
  .strict();

export const savedVariantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    created_at: z.iso.datetime(),
    trend: z.string().nullable(),
    hypothesis: z.string().min(1),
    scenario: adScenarioSpecSchema,
    config: variantConfigSchema,
    playUrl: z.string().min(1),
    recording: recordingSchema,
  })
  .strict();

export type Recording = z.infer<typeof recordingSchema>;
export type SavedVariant = z.infer<typeof savedVariantSchema>;
