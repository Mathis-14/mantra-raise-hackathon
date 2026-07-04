// The building-block library the composing agent draws from. The point is
// VARIETY within bounded, engine-real knobs — not a deterministic single path.
// Each block documents a readable label, the VariantConfig keys it produces,
// and the value range. Blocks are frozen (`as const`) so they can't drift.
//
// Ranges are anchored to the real Mob Rush engine constants (see the module
// AGENTS.md): loadouts single/double/triple; waves size=2+1.3·lvl; giant proba
// .35; boss every 3 levels hp24 scale3; gates x2/x3 + chain/advanced; obstacles
// saw/spikes; boost mult 1.75; champion charge; coins=25+5·lvl; palette below.

import type { MechanicFocus } from "./schema";

// Bounded config keys these blocks can produce. Kept as a string union so
// vocabulary and mutation.ts agree without a circular import on the Zod schema.
export type ConfigKey =
  | "loadout"
  | "startLevel"
  | "forceBoss"
  | "wavePressure"
  | "giantProba"
  | "bossScale"
  | "bossHp"
  | "gatePreset"
  | "trapGateScale"
  | "goodGateMultiplier"
  | "obstacleSet"
  | "boostZones"
  | "coinMultiplier"
  | "confettiIntensity"
  | "championChargeMult"
  | "gameSpeed"
  | "mapStyle";

export interface Block {
  /** Stable key for the block within its set. */
  key: string;
  /** Human-readable label for dashboards / prompts. */
  label: string;
  /** The VariantConfig keys this block influences. */
  produces: ConfigKey[];
  /** Documented range / allowed values, for prompt context and review. */
  range: string;
}

// ── Loadouts (single .14 / double .19,2 tirs / triple .25,3 tirs) ──────────
export const LOADOUTS = [
  { key: "single", label: "Single cannon (fast fire)", produces: ["loadout"], range: "fireDelay .14, 1 shot" },
  { key: "double", label: "Double cannon", produces: ["loadout"], range: "fireDelay .19, 2 shots" },
  { key: "triple", label: "Triple cannon (spread)", produces: ["loadout"], range: "fireDelay .25, 3 shots" },
] as const satisfies readonly Block[];

// ── Enemy profiles → wavePressure / giantProba / forceBoss / bossScale/Hp ──
export const ENEMY_PROFILES = [
  { key: "trickle", label: "Light trickle", produces: ["wavePressure", "giantProba"], range: "wavePressure .5, giantProba 0" },
  { key: "swarm", label: "Dense swarm", produces: ["wavePressure", "giantProba"], range: "wavePressure 1.6, giantProba .2" },
  { key: "giants_heavy", label: "Giant-heavy", produces: ["wavePressure", "giantProba"], range: "wavePressure 1.1, giantProba .8" },
  { key: "boss_rush", label: "Boss rush", produces: ["forceBoss", "bossScale", "bossHp", "wavePressure"], range: "forceBoss true, bossScale 1–4, bossHp 8–60" },
] as const satisfies readonly Block[];

// ── Map styles → palette/fog overrides (cosmetic, in service of the angle) ─
export const MAP_STYLES = [
  { key: "default", label: "Default purple track", produces: ["mapStyle"], range: "bg #2B1D6B track #EDE7FF" },
  { key: "neon_night", label: "Neon night", produces: ["mapStyle"], range: "dark bg, neon blue/red accents" },
  { key: "sunset", label: "Sunset warm", produces: ["mapStyle"], range: "warm orange/gold palette" },
  { key: "toxic", label: "Toxic green", produces: ["mapStyle"], range: "green fog, hazard read" },
] as const satisfies readonly Block[];

// ── Gate layouts → gatePreset / trapGateScale / goodGateMultiplier ─────────
export const GATE_LAYOUTS = [
  { key: "default", label: "Default gates", produces: ["gatePreset", "goodGateMultiplier"], range: "x2, no trap emphasis" },
  { key: "fail_bait", label: "Fail-bait trap gate", produces: ["gatePreset", "trapGateScale", "goodGateMultiplier"], range: "big red trap 1–2×, small x3 good" },
  { key: "chain_multiply", label: "Chained multipliers", produces: ["gatePreset", "goodGateMultiplier"], range: "gate chain (lvl≥2), x3" },
  { key: "advanced_mix", label: "Advanced mixed gates", produces: ["gatePreset", "goodGateMultiplier"], range: "advanced layout (lvl≥4)" },
] as const satisfies readonly Block[];

// ── Obstacle sets → obstacleSet / boostZones ───────────────────────────────
export const OBSTACLE_SETS = [
  { key: "none", label: "Clean track", produces: ["obstacleSet"], range: "no obstacles" },
  { key: "saw", label: "Saw blades", produces: ["obstacleSet"], range: "saw hazards" },
  { key: "spikes", label: "Spike rollers", produces: ["obstacleSet"], range: "spikes / large spikes (lvl≥2)" },
  { key: "mixed", label: "Mixed hazards", produces: ["obstacleSet"], range: "saw + spikes" },
  { key: "boost_lane", label: "Boost lane", produces: ["obstacleSet", "boostZones"], range: "boost zones mult 1.75" },
] as const satisfies readonly Block[];

// ── Reward styles → coinMultiplier / confettiIntensity ─────────────────────
export const REWARD_STYLES = [
  { key: "default", label: "Standard reward", produces: ["coinMultiplier", "confettiIntensity"], range: "coinMult 1, confetti 1" },
  { key: "jackpot", label: "Jackpot reward", produces: ["coinMultiplier", "confettiIntensity"], range: "coinMult 2–5, confetti 3–4" },
] as const satisfies readonly Block[];

// Flat palette anchors (from the engine) — for map-style prompt context.
export const PALETTE = {
  bg: "#2B1D6B",
  track: "#EDE7FF",
  blue: "#38B6FF",
  red: "#FF4D6D",
  gold: "#FFD54A",
} as const;

/** Every block set, keyed by family — handy for prompt construction. */
export const VOCABULARY = {
  loadouts: LOADOUTS,
  enemyProfiles: ENEMY_PROFILES,
  mapStyles: MAP_STYLES,
  gateLayouts: GATE_LAYOUTS,
  obstacleSets: OBSTACLE_SETS,
  rewardStyles: REWARD_STYLES,
} as const;

// Which block families are most relevant to each mechanic focus. Every focus
// gets loadout + map + reward as always-available cosmetics; the rest target
// the mechanic being tested.
const RELEVANCE: Record<MechanicFocus, readonly (readonly Block[])[]> = {
  gates: [GATE_LAYOUTS, ENEMY_PROFILES, REWARD_STYLES, MAP_STYLES],
  champion: [ENEMY_PROFILES, LOADOUTS, MAP_STYLES, REWARD_STYLES],
  boss: [ENEMY_PROFILES, LOADOUTS, MAP_STYLES],
  loadout: [LOADOUTS, ENEMY_PROFILES, MAP_STYLES],
  speed_boost: [OBSTACLE_SETS, ENEMY_PROFILES, MAP_STYLES],
  danger_comeback: [ENEMY_PROFILES, GATE_LAYOUTS, MAP_STYLES],
  coin_reward: [REWARD_STYLES, GATE_LAYOUTS, MAP_STYLES],
  base_destruction: [ENEMY_PROFILES, REWARD_STYLES, MAP_STYLES],
};

/** Lists the blocks a scenario for `focus` may reasonably compose from. */
export function blocksForMechanic(focus: MechanicFocus): Block[] {
  return RELEVANCE[focus].flatMap((set) => set as readonly Block[]);
}
