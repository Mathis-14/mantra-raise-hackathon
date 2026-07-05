import { z } from "zod";

import {
  CREATIVE_HOOK_TYPES,
  type Creative,
  type CreativeAttributes,
  type MetricPoint,
} from "@/contracts/types";

const idSchema = z.string().trim().min(1, "ID must not be empty");
const normalizedSignalSchema = z.number().finite().min(0).max(1);

export const creativeAttributesSchema: z.ZodType<CreativeAttributes> = z.object({
  hook_type: z.enum(CREATIVE_HOOK_TYPES),
  gameplay_category: z.string().trim().min(1),
  progression_style: z.string().trim().min(1),
  novelty: normalizedSignalSchema,
  pacing: normalizedSignalSchema,
  audience_fit: normalizedSignalSchema,
  predicted_engagement: normalizedSignalSchema,
  visual_clarity: normalizedSignalSchema,
});

export const creativeSchema: z.ZodType<Creative> = z.object({
  id: idSchema,
  run_id: idSchema,
  variant_id: idSchema.nullable(),
  video_url: z.string().trim().min(1),
  duration_s: z.number().finite().positive(),
  attributes: creativeAttributesSchema,
  status: z.enum(["generated", "deployed", "kept", "iterate", "killed"]),
  created_at: z.string().trim().min(1),
});

export const metricPointSchema: z.ZodType<MetricPoint> = z.object({
  id: idSchema,
  creative_id: idSchema,
  ts: z.string().trim().min(1),
  impressions: z.number().int().positive(),
  clicks: z.number().int().nonnegative(),
  installs: z.number().int().nonnegative(),
  spend_usd: z.number().finite().nonnegative(),
  ctr: normalizedSignalSchema,
  cpi: z.number().finite().nonnegative(),
  watch_time_s: z.number().finite().nonnegative(),
  completion_rate: normalizedSignalSchema,
}).superRefine((metric, context) => {
  if (metric.clicks > metric.impressions) {
    context.addIssue({
      code: "custom",
      path: ["clicks"],
      message: "clicks must not exceed impressions",
    });
  }
  if (metric.installs > metric.clicks) {
    context.addIssue({
      code: "custom",
      path: ["installs"],
      message: "installs must not exceed clicks",
    });
  }
});

const creativesSchema = z.array(creativeSchema).min(1, "At least one creative is required");
const metricsSchema = z.array(metricPointSchema);

export function parseCreatives(value: unknown): Creative[] {
  return creativesSchema.parse(value);
}

export function parseMetrics(value: unknown): MetricPoint[] {
  return metricsSchema.parse(value);
}

export function parseRunId(value: unknown): string {
  return idSchema.parse(value);
}
