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
