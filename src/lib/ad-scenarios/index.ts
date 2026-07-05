// Public API of the ad-scenarios toolkit. One entry point; everything else is
// re-exported contract. See ./AGENTS.md for scope and rules.
//
// The toolkit lets an agent: inspect composable blocks, compose a Mob Rush
// variant from a trend + inspiration folder, persist it as a rejouable JSON,
// and record a vertical 9:16 gameplay clip via Playwright.

export {
  SKINS,
  LOADOUTS,
  WALL_KINDS,
  WALL_AXES,
  HAZARD_TYPES,
  MECHANIC_FOCUS,
  ASPECT,
  AdScenarioError,
  skinSchema,
  loadoutSchema,
  wallKindSchema,
  hazardTypeSchema,
  mechanicFocusSchema,
  wallSchema,
  hazardSchema,
  layoutSchema,
  variantConfigSchema,
  adScenarioSpecSchema,
  recordingSchema,
  savedVariantSchema,
} from "./src/schema";
export type {
  Skin,
  Loadout,
  WallKind,
  HazardType,
  MechanicFocus,
  AdScenarioStage,
  Wall,
  Hazard,
  VariantLayout,
  VariantConfig,
  AdScenarioSpec,
  Recording,
  SavedVariant,
} from "./src/schema";

export {
  MECHANIC_RECIPES,
  FOCUS_DEFAULT_LOADOUT,
  FOCUS_DEFAULT_SKIN,
  blockCatalog,
} from "./src/vocabulary";
export type { MechanicRecipe, BlockCatalog } from "./src/vocabulary";

export {
  resolveVariantConfig,
  encodeVariant,
  buildPlayUrl,
  buildVariantHtml,
  DEFAULT_GAME_PORT,
} from "./src/mutation";
export type { PlayUrlOptions } from "./src/mutation";

export { composeScenario, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from "./src/compose";
export type { ComposeOptions, ComposeResult } from "./src/compose";

export { loadInspiration, summarizeInspiration } from "./src/inspiration";
export type { Inspiration, InspirationAsset, InspirationNote } from "./src/inspiration";

export { SCENARIO_TEMPLATES, focusForTrend, templateForTrend } from "./src/templates";

export {
  listBlocks,
  composeVariant,
  saveVariant,
  loadVariant,
  recordVariant,
  DEFAULT_INSPIRATION_DIR,
  DEFAULT_VARIANTS_DIR,
  DEFAULT_RECORD_SECONDS,
  RECORD_VIEWPORT,
} from "./src/toolkit";
export type {
  ComposeVariantOptions,
  ComposedVariant,
  RecordOptions,
} from "./src/toolkit";
