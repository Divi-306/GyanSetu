import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false, // tests share one database
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://gyansetu:gyansetu@localhost:5434/gyansetu_test',
      PUBLIC_BASE_URL: 'http://localhost:4000',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
      PACK_URL_SECRET: 'test-pack-secret-test-pack-secret-1234',
      // Separate from dev, so seeding the test DB never overwrites dev packs.
      PACK_STORAGE_DIR: './storage-test/packs',
      AI_PROVIDER: 'groq',
      GROQ_API_KEY: '',
      XAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      AI_MODEL: '',
      VIDEO_SOURCES: '', // tests that need videos stub the providers and switch them on
      YOUTUBE_API_KEY: '',
      SMTP_URL: '',
    },
  },
});
