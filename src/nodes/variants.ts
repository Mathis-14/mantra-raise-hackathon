// owner: variants stream.
// Generates preset-based variants of the variant-aware game runtime. This node
// deliberately does not compose scenario specs; it only picks bounded configs
// the game already knows how to read.

import type { PlaytestReport, Variant } from "@/contracts/types";
import {
  buildPhoneWrapperHtml,
  buildVariantPreviewUrl,
  listVariantPresets,
  type VariantPreset,
} from "@/lib/variant-config";
import { emitEvent } from "@/lib/events";

const DEFAULT_VARIANT_GAME_URL = "http://localhost:5174/";
const DEFAULT_VARIANT_COUNT = 5;
const MAX_VARIANTS = 5;

export interface VariantsInput {
  runId: string;
  /** Locked signature compatibility. Variants use variantGameUrl for playable phone previews. */
  gameHtml: string;
  report: PlaytestReport;
  marketContext: string | null;
  count: number;
  variantGameUrl?: string;
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return DEFAULT_VARIANT_COUNT;
  return Math.max(1, Math.min(MAX_VARIANTS, Math.round(count)));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function orderedPresets(input: VariantsInput): VariantPreset[] {
  const presets = listVariantPresets();
  const seed = [
    input.marketContext ?? "",
    input.report.headline,
    input.report.session_summary,
    input.report.friction_points.join("|"),
  ].join("\n");
  const offset = presets.length > 0 ? hashString(seed) % presets.length : 0;
  return presets.slice(offset).concat(presets.slice(0, offset));
}

async function emitVariantEvent(
  input: VariantsInput,
  message: string,
  data: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await emitEvent({
      run_id: input.runId,
      node: "variants",
      type: "action",
      message,
      screenshot_url: null,
      data,
    });
  } catch {
    // Events are liveness only; local unit tests should not require Supabase env.
  }
}

function variantGameUrl(input: VariantsInput): string {
  return new URL(input.variantGameUrl ?? DEFAULT_VARIANT_GAME_URL).toString();
}

export async function generateVariants(input: VariantsInput): Promise<Variant[]> {
  const requestedCount = clampCount(input.count);
  const presets = orderedPresets(input).slice(0, requestedCount);
  const createdAt = new Date().toISOString();
  const gameUrl = variantGameUrl(input);

  await emitVariantEvent(input, "Variant generation started", {
    requested_count: requestedCount,
    strategy: "preset_config",
  });

  const variants = presets.map((preset) => {
    const previewUrl = buildVariantPreviewUrl(gameUrl, preset.config, {
      autostart: true,
      bot: true,
      simSeconds: 8,
    });

    return {
      id: crypto.randomUUID(),
      run_id: input.runId,
      name: preset.name,
      hypothesis: preset.hypothesis,
      game_html: buildPhoneWrapperHtml({
        title: preset.name,
        previewUrl,
      }),
      created_at: createdAt,
    };
  });

  await emitVariantEvent(input, "Variant generation completed", {
    generated_count: variants.length,
    strategy: "preset_config",
  });

  return variants;
}
