import crypto from 'node:crypto';
import { env } from '../../config/env';

export const PACK_URL_TTL_SECONDS = 24 * 60 * 60;

function hmac(data: string) {
  return crypto.createHmac('sha256', env.PACK_URL_SECRET).update(data).digest('base64url');
}

export function signPackFileUrl(
  packId: string,
  filePath: string,
  ttlSeconds = PACK_URL_TTL_SECONDS,
  baseUrl = env.PUBLIC_BASE_URL,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmac(`${packId}:${filePath}:${exp}`);
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/v1/packs/${packId}/files/${encodedPath}?exp=${exp}&sig=${sig}`;
}

export function verifyPackFileSig(packId: string, filePath: string, exp: number, sig: string): boolean {
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(hmac(`${packId}:${filePath}:${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
