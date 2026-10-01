import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { queryOne } from '../../db/pool';
import { HttpError, notFound, unauthorized } from '../../lib/errors';
import { optionalAuth } from '../../middleware/auth';
import type { PackManifest } from './packBuilder';
import { PACK_URL_TTL_SECONDS, signPackFileUrl, verifyPackFileSig } from './signing';

export const packsRouter = Router();

// ── GET /v1/packs/:packId/manifest ────────────────────────────────────
packsRouter.get('/:packId/manifest', optionalAuth, async (req, res) => {
  const packId = z.uuid().parse(req.params.packId);
  const pack = await queryOne<{ id: string; kind: string; manifest: PackManifest }>(
    'SELECT id, kind, manifest FROM learning_packs WHERE id = $1 AND is_published',
    [packId],
  );
  if (!pack) throw notFound('Learning pack');
  if (pack.kind === 'course' && !req.user) throw unauthorized('Log in to download full courses');

  res.json({
    ...pack.manifest,
    urlsExpireInSeconds: PACK_URL_TTL_SECONDS,
    files: pack.manifest.files.map((f) => ({ ...f, url: signPackFileUrl(pack.id, f.path) })),
  });
});

// ── GET /v1/packs/:packId/files/*filePath?exp=&sig= ──────────────────
// No Bearer header: resumable downloads replay their original headers, which
// would outlive a 15-minute access token. The HMAC signature is the auth.
// Supports HTTP Range (res.sendFile handles it), so downloads can resume.
packsRouter.get('/:packId/files/*filePath', async (req, res) => {
  const packId = z.uuid().parse(req.params.packId);
  const rawPath = req.params.filePath as unknown as string | string[];
  const filePath = ([] as string[]).concat(rawPath).join('/');
  const { exp, sig } = z.object({ exp: z.coerce.number().int(), sig: z.string().min(10) }).parse(req.query);

  if (!verifyPackFileSig(packId, filePath, exp, sig)) {
    throw new HttpError(403, 'LINK_EXPIRED', 'Download link expired. Fetch the manifest again.');
  }

  const pack = await queryOne<{ storage_prefix: string }>(
    'SELECT storage_prefix FROM learning_packs WHERE id = $1',
    [packId],
  );
  if (!pack) throw notFound('Learning pack');

  const base = path.resolve(env.PACK_STORAGE_DIR, pack.storage_prefix);
  const abs = path.resolve(base, filePath);
  if (!abs.startsWith(base + path.sep)) throw notFound('File'); // path traversal guard

  res.sendFile(abs, {
    headers: { 'Cache-Control': 'private, max-age=86400, immutable' },
  });
});
