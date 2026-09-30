import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: [
    'req.headers.authorization',
    '*.password',
    '*.newPassword',
    '*.refreshToken',
    '*.idToken',
  ],
  transport:
    env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
