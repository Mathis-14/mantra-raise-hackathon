// Composable "blocks" an agent picks from, and the mechanic_focus → layout
// recipes. Pure data + pure helpers so it round-trips through the schema and is
// unit-testable. Every value here must already satisfy variantConfigSchema.

import {
  HAZARD_TYPES,
  LOADOUTS,
  MECHANIC_FOCUS,
  SKINS,
  WALL_KINDS,
  type Hazard,
  type MechanicFocus,
  type Skin,
  type VariantLayout,
  type Wall,
} from "./schema";

// A reusable layout fragment. Recipes assemble these into a full VariantLayout.
export interface MechanicRecipe {
  focus: MechanicFocus;
  /** Human-readable rationale shown by listBlocks() and docs. */
  rationale: string;
  startLevel: number;
  /** Base horde multiplier before intensity scaling. */
  hordeMult: number;
  /** Base wave pressure before intensity scaling. */
  wavePressure: number;
  walls: Wall[];
  hazards: Hazard[];
  lanesX?: number[];
}

// --- mechanic_focus recipes -------------------------------------------------
// Coordinates are hand-placed inside the game's clamp range and kept off the
// central spawn corridor (x≈0) so hazards never block a passage.

export const MECHANIC_RECIPES: Record<MechanicFocus, MechanicRecipe> = {
  // Visual trap wall + flanking hazards: the "you'll fail this" bait.
  fail_bait: {
    focus: "fail_bait",
    rationale: "Narrow trap wall + flanking saws bait a wrong turn — classic fail-bait hook.",
    startLevel: 2,
    hordeMult: 1,
    wavePressure: 1.2,
    walls: [
      { x: -1.7, z: 4, halfW: 1.3, halfD: 0.75, kind: "crates" },
      { x: 1.7, z: 4, halfW: 1.3, halfD: 0.75, kind: "crates" },
      { x: 0, z: -6, halfW: 1.6, halfD: 0.75, kind: "mound" },
    ],
    hazards: [
      { type: "saw", x: -3.4, z: 0 },
      { type: "saw", x: 3.4, z: 0 },
    ],
  },
  // Sparse layout, low horde, early level: the crowd swells fast and clean.
  crowd_explosion: {
    focus: "crowd_explosion",
    rationale: "Low horde + open field at level 2 lets the crowd visibly explode in size.",
    startLevel: 2,
    hordeMult: 0.6,
    wavePressure: 0.8,
    walls: [{ x: 0, z: 6, halfW: 1.2, halfD: 0.6, kind: "crates" }],
    hazards: [],
  },
  // Boss-tier start: big base, heavier pressure, the "crush the boss" fantasy.
  boss_crush: {
    focus: "boss_crush",
    rationale: "Starts at level 3 (boss cadence) with denser waves for a crush-the-boss payoff.",
    startLevel: 3,
    hordeMult: 1.4,
    wavePressure: 1.6,
    walls: [
      { x: -2.4, z: 2, halfW: 1.1, halfD: 0.9, kind: "mound" },
      { x: 2.4, z: 2, halfW: 1.1, halfD: 0.9, kind: "mound" },
    ],
    hazards: [{ type: "spikes", x: -3.5, z: -9 }],
  },
  // Under pressure early, then overwhelm: the comeback story.
  danger_comeback: {
    focus: "danger_comeback",
    rationale: "High wave pressure (1.8) manufactures the near-loss before the comeback swell.",
    startLevel: 2,
    hordeMult: 1.2,
    wavePressure: 1.8,
    walls: [
      { x: -2.6, z: 8, halfW: 0.9, halfD: 0.75, kind: "crates" },
      { x: 2.4, z: -8, halfW: 0.9, halfD: 0.75, kind: "crates" },
    ],
    hazards: [
      { type: "spikes", x: 3.4, z: 5 },
      { type: "saw", x: -3.4, z: -3 },
    ],
  },
  // Almost no clutter: uninterrupted flow, reads as "fast".
  speed_boost: {
    focus: "speed_boost",
    rationale: "Minimal walls, no hazards, light waves — the run feels fast and frictionless.",
    startLevel: 1,
    hordeMult: 0.9,
    wavePressure: 0.7,
    walls: [{ x: -2.9, z: 0, halfW: 0.7, halfD: 0.6, kind: "mound" }],
    hazards: [],
  },
  // Longitudinal walls carve lanes: navigate-the-maze tension.
  maze_navigation: {
    focus: "maze_navigation",
    rationale: "Longitudinal (axis z) walls carve corridors — a maze the crowd must thread.",
    startLevel: 2,
    hordeMult: 1.1,
    wavePressure: 1,
    walls: [
      { x: -1.55, z: -6, halfW: 0.4, halfD: 4.5, kind: "crates", axis: "z" },
      { x: 1.55, z: -6, halfW: 0.4, halfD: 4.5, kind: "crates", axis: "z" },
      { x: 0, z: 8, halfW: 1.2, halfD: 0.6, kind: "crates" },
    ],
    hazards: [],
    lanesX: [-3.1, 0, 3.1],
  },
  // Hazards hug the flanks, tight timing: the close-call thrill.
  close_call: {
    focus: "close_call",
    rationale: "Flank hazards + moderate pressure produce repeated close-call dodges.",
    startLevel: 2,
    hordeMult: 1.2,
    wavePressure: 1.4,
    walls: [{ x: 0, z: 3, halfW: 1.4, halfD: 0.75, kind: "crates" }],
    hazards: [
      { type: "spikes", x: -3.6, z: -2 },
      { type: "spikes", x: 3.6, z: -2 },
      { type: "saw", x: 3.5, z: -11 },
    ],
  },
};

// --- Loadout / skin heuristics ---------------------------------------------

export const FOCUS_DEFAULT_LOADOUT: Record<MechanicFocus, (typeof LOADOUTS)[number]> = {
  fail_bait: "single",
  crowd_explosion: "triple",
  boss_crush: "triple",
  danger_comeback: "double",
  speed_boost: "double",
  maze_navigation: "single",
  close_call: "double",
};

export const FOCUS_DEFAULT_SKIN: Record<MechanicFocus, Skin> = {
  fail_bait: "dusk",
  crowd_explosion: "canyon",
  boss_crush: "dusk",
  danger_comeback: "snow",
  speed_boost: "canyon",
  maze_navigation: "snow",
  close_call: "dusk",
};

// --- Catalogue for agents (listBlocks) -------------------------------------

export interface BlockCatalog {
  skins: readonly Skin[];
  loadouts: readonly (typeof LOADOUTS)[number][];
  wallKinds: readonly (typeof WALL_KINDS)[number][];
  hazardTypes: readonly (typeof HAZARD_TYPES)[number][];
  mechanicFocus: { focus: MechanicFocus; rationale: string }[];
  ranges: {
    startLevel: [number, number];
    wallX: [number, number];
    wallZ: [number, number];
    wallHalfW: [number, number];
    wallHalfD: [number, number];
    maxWalls: number;
    maxHazards: number;
    lanesX: [number, number];
    hordeMult: [number, number];
    wavePressure: [number, number];
    intensity: [number, number];
  };
}

export function blockCatalog(): BlockCatalog {
  return {
    skins: SKINS,
    loadouts: LOADOUTS,
    wallKinds: WALL_KINDS,
    hazardTypes: HAZARD_TYPES,
    mechanicFocus: MECHANIC_FOCUS.map((focus) => ({
      focus,
      rationale: MECHANIC_RECIPES[focus].rationale,
    })),
    ranges: {
      startLevel: [1, 50],
      wallX: [-4, 4],
      wallZ: [-18, 14],
      wallHalfW: [0.4, 2.6],
      wallHalfD: [0.4, 5],
      maxWalls: 10,
      maxHazards: 6,
      lanesX: [2, 4],
      hordeMult: [0.5, 4],
      wavePressure: [0.4, 2.5],
      intensity: [0, 1],
    },
  };
}

// Scale a base pressure/horde value by intensity, clamped to the game's range.
export function scale(base: number, intensity: number, min: number, max: number): number {
  // intensity 0.5 is neutral (returns base); 0 → 0.7×, 1 → 1.4× before clamp.
  const factor = 0.7 + intensity * 0.7;
  const value = Math.round(base * factor * 100) / 100;
  return Math.max(min, Math.min(max, value));
}

// Build the concrete layout from a recipe (already game-legal by construction).
export function recipeLayout(recipe: MechanicRecipe, intensity: number): VariantLayout {
  const layout: VariantLayout = {
    walls: recipe.walls,
    hazards: recipe.hazards,
    hordeMult: scale(recipe.hordeMult, intensity, 0.5, 4),
  };
  if (recipe.lanesX) layout.lanesX = recipe.lanesX;
  return layout;
}
