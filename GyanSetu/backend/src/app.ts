import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { pool } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// Module routers — uncomment each as its phase is built:
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { coursesRouter, starterRouter } from './modules/courses/courses.routes';
// import { packsRouter } from './modules/packs/packs.routes';
// import { syncRouter } from './modules/sync/sync.routes';
// import { progressRouter } from './modules/progress/progress.routes';
// import { aiRouter } from './modules/ai/ai.routes';
// import { scholarshipsRouter } from './modules/scholarships/scholarships.routes';
// import { careerRouter } from './modules/career/career.routes';
// import { adminRouter } from './modules/admin/admin.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct client IPs behind Railway/Render/NGINX
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',') }));
  app.use(express.json({ limit: '1mb' }));
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger }));

  // Liveness: process is up. The app uses this as its "server reachable" probe.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Readiness: DB reachable. Used by the hosting platform.
  app.get('/ready', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  });

  app.use('/v1/auth', authRouter);
  app.use('/v1/me', usersRouter);
  app.use('/v1/courses', coursesRouter);
  app.use('/v1/starter-bundle', starterRouter);
  // app.use('/v1/packs', packsRouter);
  // app.use('/v1/sync', syncRouter);
  // app.use('/v1/progress', progressRouter);
  // app.use('/v1/ai', aiRouter);
  // app.use('/v1/scholarships', scholarshipsRouter);
  // app.use('/v1/career', careerRouter);
  // app.use('/v1/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
