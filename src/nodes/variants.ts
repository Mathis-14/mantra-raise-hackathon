// owner: ad-scenarios stream.
// Generates N mutated versions of the game HTML, each testing one hypothesis
// drawn from the playtest report + market context. Output must stay playable —
// a variant the playtest agent can't open is worthless downstream.
//
// Rich per-variant metadata (config, recording plan, creative prompt, checklist)
// is produced by generateScenarioVariants and mapped down to the canonical
// Variant[] here; a teammate wires the rich persistence onto the secondary export.

import type { PlaytestReport, Variant } from "@/contracts/types";
import {
  composeScenario,
  generateVariantFromScenario,
  type GeneratedVariant,
} from "@/lib/ad-scenarios";

export interface VariantsInput {
  runId: string;
  gameHtml: string;
  report: PlaytestReport;
  marketContext: string | null;
  count: number;
}

// Derive N distinct trend seeds from the report + market context so composeScenario
// produces varied scenarios (and its deterministic fallback picks varied templates).
function trendSeeds(input: VariantsInput): string[] {
  const base =
    input.marketContext?.trim() ||
    input.report.headline ||
    input.report.session_summary ||
    "hypercasual mob game";
  const angles = input.report.friction_points.length
    ? input.report.friction_points
    : ["crowd growth", "gate choice", "boss crush", "reward payoff"];
  const seeds: string[] = [];
  for (let i = 0; i < input.count; i++) {
    const angle = angles[i % angles.length];
    seeds.push(`${base} | angle: ${angle} | slot ${i + 1}`);
  }
  return seeds;
}

/**
 * Produces `count` fully-resolved GeneratedVariants (rich metadata). Skips a
 * scenario that fails to generate rather than failing the whole run; throws
 * only if not a single variant could be produced.
 */
export async function generateScenarioVariants(
  input: VariantsInput,
): Promise<GeneratedVariant[]> {
  const now = new Date().toISOString();
  const seeds = trendSeeds(input);
  const generated: GeneratedVariant[] = [];

  for (const trend of seeds) {
    try {
      const spec = await composeScenario({
        trend,
        marketContext: input.marketContext,
        report: input.report,
        now,
      });
      generated.push(generateVariantFromScenario(spec, input.gameHtml));
    } catch {
      // Skip a bad scenario, keep going — one failure must not kill the run.
      continue;
    }
  }

  if (generated.length === 0) {
    throw new Error(`variant generation produced nothing for run ${input.runId}`);
  }
  return generated;
}

export async function generateVariants(input: VariantsInput): Promise<Variant[]> {
  const generated = await generateScenarioVariants(input);
  const createdAt = new Date().toISOString();
  return generated.map((g) => ({
    id: crypto.randomUUID(),
    run_id: input.runId,
    name: g.variant.name,
    hypothesis: g.variant.hypothesis,
    game_html: g.variant.game_html,
    created_at: createdAt,
  }));
}
