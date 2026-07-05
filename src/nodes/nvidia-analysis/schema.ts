import { z } from "zod";

export const analysisDimensionSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  strengths: z.array(z.string().min(1)).max(5),
  issues: z.array(z.string().min(1)).max(5),
}).strict();

export const analysisEvidenceSchema = z.object({
  timestamp_seconds: z.number().min(0),
  dimension: z.enum(["color", "audio", "video"]),
  observation: z.string().min(1),
  player_impact: z.string().min(1),
}).strict();

export const variantHypothesisSchema = z.object({
  problem: z.string().min(1),
  proposed_change: z.string().min(1),
  expected_effect: z.string().min(1),
  evidence_timestamp_seconds: z.number().min(0),
}).strict();

export const nvidiaAnalysisDraftSchema = z.object({
  color: analysisDimensionSchema,
  audio: analysisDimensionSchema,
  video: analysisDimensionSchema,
  verdict: z.enum(["promising", "iterate", "kill"]),
  summary: z.string().min(1),
  evidence: z.array(analysisEvidenceSchema).min(1).max(12),
  variant_hypotheses: z.array(variantHypothesisSchema).min(1).max(5),
}).strict();

export const gameplayVersionInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  videoUrl: z.url().refine(
    (value) => new URL(value).pathname.toLowerCase().endsWith(".mp4"),
    "NVIDIA gameplay input must be an MP4 URL",
  ),
  audioPresent: z.literal(true),
}).strict();

export const gameplayComparisonInputSchema = z.object({
  runId: z.string().min(1),
  versions: z.array(gameplayVersionInputSchema).min(2).max(6),
}).strict().superRefine((input, context) => {
  const ids = new Set(input.versions.map(({ id }) => id));
  if (ids.size !== input.versions.length) {
    context.addIssue({ code: "custom", message: "Gameplay version IDs must be unique" });
  }
});

export const gameplayVersionAnalysisSchema = nvidiaAnalysisDraftSchema.extend({
  version_id: z.string().min(1),
  version_name: z.string().min(1),
  video_url: z.url(),
  overall_score: z.number().min(0).max(100),
  rank: z.number().int().positive(),
  provenance: z.object({
    provider: z.literal("NVIDIA"),
    model: z.string().min(1),
  }).strict(),
}).strict();

export const gameplayComparisonSchema = z.object({
  run_id: z.string().min(1),
  winner_version_id: z.string().min(1),
  winner_reason: z.string().min(1),
  score_weights: z.object({
    color: z.number(),
    audio: z.number(),
    video: z.number(),
  }).strict(),
  versions: z.array(gameplayVersionAnalysisSchema).min(2),
}).strict();

export type NvidiaAnalysisDraft = z.infer<typeof nvidiaAnalysisDraftSchema>;
export type GameplayVersionInput = z.infer<typeof gameplayVersionInputSchema>;
export type GameplayComparisonInput = z.infer<typeof gameplayComparisonInputSchema>;
export type GameplayVersionAnalysis = z.infer<typeof gameplayVersionAnalysisSchema>;
export type GameplayComparison = z.infer<typeof gameplayComparisonSchema>;
