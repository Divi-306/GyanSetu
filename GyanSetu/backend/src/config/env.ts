import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  PUBLIC_BASE_URL: z.string().min(1),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  JWT_ACCESS_SECRET: z.string().min(32),
  PACK_URL_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(90),

  CORS_ORIGINS: z.string().default('*'),
  PACK_STORAGE_DIR: z.string().default('./storage/packs'),
  MEDIA_SOURCE_DIR: z.string().default('./storage/media'),

  // AI tutor provider. Each has its own key; AI_MODEL overrides the provider's default model.
  AI_PROVIDER: z.enum(['groq', 'xai', 'anthropic']).default('groq'),
  GROQ_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined), // blank means "use the provider's default"
  // Navigator commands are simple; a smaller model is faster and spares the tutor's rate limit.
  NAVIGATOR_MODEL: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),

  // Short educational videos for learning packs. Wikimedia Commons needs no key (public-domain /
  // CC files, downloadable). YouTube is used only with a key, and is stream-only (its terms forbid downloads).
  // How many topic-writing AI calls run in parallel across all pack generation. Each call is
  // capped at GROQ_BACKGROUND_MAX_TOKENS_PER_REQUEST below, so 2 in flight together stays
  // under a typical 8,000 TPM budget with headroom to spare. Lower to 1 for the safest
  // behaviour on an unknown/low-tier key, at the cost of slower generation.
  PACK_MODULE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  // Hard ceiling on tokens requested per Groq call, regardless of what the caller asked for.
  // Verified empirically against a real key (2026-10-08): Groq's per-minute token budget is
  // a single account-wide ROLLING-WINDOW number shared by every model (this key: 8,000 TPM,
  // from x-ratelimit-limit-tokens), consumed by ACTUAL usage — but before running a request,
  // it checks that request's OWN asked-for max tokens against whatever is CURRENTLY
  // remaining and rejects with 429 if the ask alone exceeds the remainder, even if the real
  // usage would have fit. A lower cap doesn't guarantee admission, but shrinks each call's
  // "ask" so it fits a smaller remaining window more often. Raise this only if your Groq
  // key's own x-ratelimit-limit-tokens header is comfortably higher.
  GROQ_MAX_TOKENS_PER_REQUEST: z.coerce.number().int().min(500).default(6000),
  // Tighter cap for background work (pack/topic generation, video picks) specifically — the
  // student isn't directly waiting on these the way they are on a tutor reply or a Navigator
  // command. A pack generates over several minutes and many calls; if each one used the full
  // interactive cap above, it would consume the ENTIRE shared per-minute budget for that whole
  // time, and every other AI feature (tutor, Career Guidance, quiz) would correctly but
  // unhelpfully report "busy" until generation finished. Reserving headroom here lets
  // interactive calls still succeed while a pack generates in the background.
  GROQ_BACKGROUND_MAX_TOKENS_PER_REQUEST: z.coerce.number().int().min(500).default(3000),
  // Minimum gap enforced between consecutive background AI calls (pack/topic generation),
  // even when neither was rate-limited. Verified empirically against a real Groq key: its
  // per-minute budget is a rolling window of ACTUAL usage, and firing background calls
  // back-to-back as fast as the network allows keeps that window's remaining budget too
  // low, too often, for an interactive request (tutor, Navigator, quiz) to be admitted when
  // it happens to arrive in that moment. Spacing background calls out lowers their average
  // consumption rate, leaving the window free more of the time for interactive traffic.
  PACK_GENERATION_MIN_GAP_MS: z.coerce.number().int().min(0).default(1500),
  // Learning packs cost several AI calls each; this caps it per student per day.
  PACK_GENERATION_DAILY_LIMIT: z.coerce.number().int().min(1).default(30),
  VIDEO_SOURCES: z.string().default('wikimedia,youtube'),
  YOUTUBE_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),

  GOOGLE_CLIENT_IDS: z.string().default(''),

  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('GyanSetu <no-reply@gyansetu.app>'),
  APP_RESET_URL: z.string().default('gyansetu://reset-password'),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
