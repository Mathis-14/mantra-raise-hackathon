// Canonical env access — import from "@/lib/env". Never read process.env
// directly elsewhere; this is the one place shapes are validated.
// Parsing is lazy so `npm run build`/typecheck work on machines without .env.

import { z } from "zod";

const serverSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

// Gemini-only consumers (tag-generation) validate just their own key so they
// run without Supabase config.
const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

let cachedPublic: z.infer<typeof publicSchema> | null = null;

export function publicEnv() {
  // NEXT_PUBLIC_* must be referenced explicitly — Next.js inlines them at build.
  cachedPublic ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  return cachedPublic;
}

let cachedServer: z.infer<typeof serverSchema> | null = null;

/** Server/worker only — throws where server secrets are missing. */
export function serverEnv() {
  cachedServer ??= serverSchema.parse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return cachedServer;
}

let cachedGemini: z.infer<typeof geminiSchema> | null = null;

/** Server/worker only — throws where the Gemini key is missing. */
export function geminiEnv() {
  cachedGemini ??= geminiSchema.parse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  });
  return cachedGemini;
}
