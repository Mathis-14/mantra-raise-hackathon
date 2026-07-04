// Public API of the ad-scenarios library. One entry point; everything else is
// re-exported contract. See ./AGENTS.md for scope and rules.

export {
  PLAYER_MOTIVATIONS,
  TARGET_EMOTIONS,
  MECHANIC_FOCUSES,
  playerMotivationSchema,
  targetEmotionSchema,
  mechanicFocusSchema,
  AdScenarioSpecSchema,
  AdScenarioError,
  validateScenario,
  qualitativeChecklist,
} from "./src/schema";
export type {
  PlayerMotivation,
  TargetEmotion,
  MechanicFocus,
  AdScenarioSpec,
  AdScenarioStage,
  ChecklistResult,
} from "./src/schema";

export { VariantConfigSchema, resolveVariantConfig, buildVariantHtml } from "./src/mutation";
export type { VariantConfig } from "./src/mutation";

export { VOCABULARY, PALETTE, blocksForMechanic } from "./src/vocabulary";
export type { Block, ConfigKey } from "./src/vocabulary";

export { loadInspiration } from "./src/inspiration";
export type { InspirationIndex, InspirationItem, InspirationKind } from "./src/inspiration";

export { TEMPLATES, listTemplates } from "./src/templates";

export { generateVariantFromScenario } from "./src/generator";
export type { GeneratedVariant, HumanSummary } from "./src/generator";

export {
  composeScenario,
  composeScenarioFallback,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
} from "./src/compose";
export type { ComposeInput } from "./src/compose";
