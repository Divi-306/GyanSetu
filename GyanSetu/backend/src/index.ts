import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { pool } from './db/pool';

const app = createApp();

// 0.0.0.0 so phones on the same Wi-Fi can reach your dev machine.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`GyanSetu API listening on :${env.PORT}`);
});

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
