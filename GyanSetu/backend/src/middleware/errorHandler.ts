import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
    return;
  }
  if (err?.code === '23505') {
    res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'Resource already exists' } });
    return;
  }
  if (err?.code === '23503') {
    res.status(400).json({ error: { code: 'UNKNOWN_REFERENCE', message: 'A referenced record does not exist' } });
    return;
  }
  // Errors from express internals (e.g. res.sendFile ENOENT) carry a status.
  if (typeof err?.status === 'number' && err.status < 500) {
    // Don't echo err.message: for sendFile it contains the server's filesystem path.
    const notFound = err.status === 404;
    res.status(err.status).json({
      error: { code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message: notFound ? 'File not found' : 'Bad request' },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
