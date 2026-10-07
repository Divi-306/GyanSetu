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
  // How many module-writing AI calls run at once per pack. Each call can use several
  // thousand tokens; a low value avoids the calls competing for the same per-minute token
  // budget (which free/low-tier keys often cap in the low thousands) and failing together.
  // Raise this only if your AI provider key has a generous tokens-per-minute limit.
  PACK_MODULE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  // Hard ceiling on tokens requested per Groq call, regardless of what the caller asked for.
  // Groq's per-minute token budget is one account-wide number shared by every model, and it
  // rejects a request outright the instant ITS OWN requested max tokens exceeds that budget —
  // before any work happens — so asking for more than the account has, ever, always fails.
  // Default (6000) leaves headroom under a typical free/low-tier 8,000 TPM cap for the prompt
  // itself, which also counts against the same budget. Raise this only if your Groq key's
  // tier has a higher tokens-per-minute limit (check the x-ratelimit-limit-tokens response header).
  GROQ_MAX_TOKENS_PER_REQUEST: z.coerce.number().int().min(500).default(6000),
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
