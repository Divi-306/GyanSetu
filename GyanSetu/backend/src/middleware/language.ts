import type { RequestHandler } from 'express';
import { normalizeLanguage } from '../lib/i18n';

export const resolveRequestLanguage: RequestHandler = (req, _res, next) => {
  const value = req.headers['accept-language'] ?? req.headers['x-language'];
  req.language = normalizeLanguage(value);
  next();
};
