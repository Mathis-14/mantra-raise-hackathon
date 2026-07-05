// Translation layer: AdScenarioSpec (creative brief) → VariantConfig (what the
// game reads), plus the play URL builder and HTML injection for a game copy.
// Pure and deterministic — the unit-test surface alongside schema/vocabulary.

import { z } from "zod";
import {
  AdScenarioError,
  ASPECT,
  variantConfigSchema,
  type AdScenarioSpec,
  type VariantConfig,
} from "./schema";
import {
  FOCUS_DEFAULT_LOADOUT,
  FOCUS_DEFAULT_SKIN,
  MECHANIC_RECIPES,
  recipeLayout,
  scale,
} from "./vocabulary";

/**
 * Turns a validated AdScenarioSpec into a game-legal VariantConfig. The spec's
 * loadout/skin win over the focus defaults (the LLM may have a better read);
 * layout, pressure and start level come from the mechanic recipe scaled by
 * intensity. Re-validated with variantConfigSchema so a bad mapping can't leak.
 */
export function resolveVariantConfig(spec: AdScenarioSpec): VariantConfig {
  const recipe = MECHANIC_RECIPES[spec.mechanicFocus];
  const candidate: VariantConfig = {
    startLevel: recipe.startLevel,
    loadout: spec.loadout ?? FOCUS_DEFAULT_LOADOUT[spec.mechanicFocus],
    skin: spec.skin ?? FOCUS_DEFAULT_SKIN[spec.mechanicFocus],
    layout: recipeLayout(recipe, spec.intensity),
    overlayText: spec.overlayText.length > 0 ? spec.overlayText : [spec.hook],
    wavePressure: scale(recipe.wavePressure, spec.intensity, 0.4, 2.5),
    autoplay: true, // recordings need the bot to actually play
    aspect: ASPECT,
  };

  const parsed = variantConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AdScenarioError("resolve", z.prettifyError(parsed.error), { cause: parsed.error });
  }
  return parsed.data;
}

/** Base64 (URL-safe-free, matches the game's atob) encoding of the config JSON. */
export function encodeVariant(config: VariantConfig): string {
  return Buffer.from(JSON.stringify(config), "utf8").toString("base64");
}

export interface PlayUrlOptions {
  port?: number;
  host?: string;
  /** Skip the title screen (bot recordings need this). */
  autostart?: boolean;
}

/** Playable URL: http://host:port/?variant=<b64>[&autostart]. */
export function buildPlayUrl(config: VariantConfig, options: PlayUrlOptions = {}): string {
  const host = options.host ?? "localhost";
  const port = options.port ?? DEFAULT_GAME_PORT;
  const base = `http://${host}:${port}/?variant=${encodeVariant(config)}`;
  return options.autostart ? `${base}&autostart` : base;
}

export const DEFAULT_GAME_PORT = 5173;

/**
 * Injects the config into a COPY of the game HTML as window.__MOB_VARIANT__ so
 * the file plays the variant with no query string. Never mutates the source
 * game — the caller passes gameHtml read from disk and persists the result.
 */
export function buildVariantHtml(gameHtml: string, config: VariantConfig): string {
  const marker = "</head>";
  const idx = gameHtml.indexOf(marker);
  const snippet = `<script>window.__MOB_VARIANT__=${JSON.stringify(config)};</script>`;
  if (idx === -1) {
    // No <head>: prepend so the boot code still finds the global.
    return `${snippet}\n${gameHtml}`;
  }
  return `${gameHtml.slice(0, idx)}${snippet}\n${marker}${gameHtml.slice(idx + marker.length)}`;
}
