// owner: TBD (unassigned in the task split — claim it in team chat).
// Public node surface for variant generation. Internals live under
// src/nodes/variants/* to keep the pipeline entry point small.

import { randomInt, randomUUID } from "node:crypto";

import type { PlaytestReport, Variant } from "@/contracts/types";

import { buildVariantHtml, prepareVariantSourceHtml } from "./variants/html";
import {
  MAX_VARIANT_COUNT,
  normalizeVariantCount,
  variantPatchSpecSchema,
  type VariantPatchSpec,
} from "./variants/schema";
import { buildFallbackVariantSpecs, generateModelVariantSpecs } from "./variants/specs";

export { buildVariantHtml, prepareVariantSourceHtml, buildFallbackVariantSpecs, variantPatchSpecSchema };
export type { VariantPatchSpec };

export interface VariantsInput {
  runId: string;
  gameHtml: string;
  report: PlaytestReport;
  marketContext: string | null;
  count: number;
}

export async function generateVariants(input: VariantsInput): Promise<Variant[]> {
  const count = normalizeVariantCount(input.count);
  const fallbackSpecs = buildFallbackVariantSpecs({
    count,
    report: input.report,
    marketContext: input.marketContext,
  });

  const modelSpecs = await generateModelVariantSpecs(input, count).catch(() => []);
  const specs = completeVariantSpecs(modelSpecs, fallbackSpecs, count);
  const createdAt = new Date().toISOString();

  return specs.map((spec) => ({
    id: randomUUID(),
    run_id: input.runId,
    name: spec.name,
    hypothesis: spec.hypothesis,
    game_html: buildVariantHtml(input.gameHtml, spec),
    created_at: createdAt,
  }));
}

function completeVariantSpecs(
  modelSpecs: readonly VariantPatchSpec[],
  fallbackSpecs: readonly VariantPatchSpec[],
  count: number,
): VariantPatchSpec[] {
  const result: VariantPatchSpec[] = [];
  const seenNames = new Set<string>();

  for (const spec of [...modelSpecs, ...fallbackSpecs]) {
    if (result.length >= count) break;
    const uniqueName = uniqueVariantName(spec.name, seenNames);
    seenNames.add(uniqueName);
    result.push({ ...spec, name: uniqueName });
  }

  return result;
}

function uniqueVariantName(name: string, seenNames: ReadonlySet<string>): string {
  if (!seenNames.has(name)) return name;

  for (let suffix = 2; suffix <= MAX_VARIANT_COUNT + 1; suffix += 1) {
    const candidate = `${name} ${suffix}`;
    if (!seenNames.has(candidate)) return candidate;
  }

  return `${name} ${randomInt(1_000, 9_999)}`;
}
