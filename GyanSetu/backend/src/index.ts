import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { pool } from './db/pool';
import { resumeInterruptedGenerations } from './modules/learningPacks/generator';

const app = createApp();

// 0.0.0.0 so phones on the same Wi-Fi can reach your dev machine.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`GyanSetu API listening on :${env.PORT}`);
  void startupChecks();
});

/** Say plainly when the database is down, instead of failing on the first thing that queries it. */
async function startupChecks() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    const target = env.DATABASE_URL.replace(/\/\/[^@]*@/, '//'); // never log the password
    logger.error(
      { code: (err as { code?: string }).code },
      `Database not reachable at ${target}. Start it with "docker compose up -d db" in backend/ (Docker Desktop must be running). ` +
        'The API keeps running and reconnects automatically once the database is up.',
    );
    return;
  }
  // Pack generation runs in-process; continue any that a restart interrupted.
  resumeInterruptedGenerations().catch((err) => logger.error({ err }, 'could not resume pack generations'));
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

