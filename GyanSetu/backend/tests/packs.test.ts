import { createHash } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { signPackFileUrl } from '../src/modules/packs/signing';
import { app, bearer, signupUser } from './helpers';

const pathOf = (url: string) => new URL(url).pathname + new URL(url).search;

/** Collects the response body as raw bytes instead of letting superagent parse it. */
const raw = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('learning packs', () => {
  let token: string;
  let manifest: any;

  beforeAll(async () => {
    token = (await signupUser()).accessToken;
    const pack = await request(app).get('/v1/courses/python/pack').set(bearer(token));
    manifest = (await request(app).get(pack.body.manifestUrl).set(bearer(token))).body;
  });

  it('course manifests need a login; the starter manifest does not', async () => {
    expect((await request(app).get(`/v1/packs/${manifest.packId}/manifest`)).status).toBe(401);
    const starter = await request(app).get('/v1/starter-bundle');
    expect((await request(app).get(starter.body.pack.manifestUrl)).status).toBe(200);
  });

  it('returns signed file URLs with sizes and checksums', () => {
    expect(manifest.files[0]).toMatchObject({ path: 'pack.json', role: 'content' });
    expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files[0].url).toContain('sig=');
  });

  it('serves pack.json matching the manifest checksum', async () => {
    const f = manifest.files[0];
    const res = await request(app).get(pathOf(f.url)).buffer(true).parse(raw);
    expect(res.status).toBe(200);
    expect(createHash('sha256').update(res.body).digest('hex')).toBe(f.sha256);
    const pack = JSON.parse(res.body.toString('utf8'));
    expect(pack.lessons.length).toBe(3);
    expect(pack.quizzes[0].questions.length).toBe(5);
    expect(pack.aiChunks.length).toBeGreaterThan(0);
  });

  it('supports HTTP Range so downloads can resume', async () => {
    const res = await request(app).get(pathOf(manifest.files[0].url)).set('Range', 'bytes=0-99').buffer(true).parse(raw);
    expect(res.status).toBe(206);
    expect((res.body as Buffer).length).toBe(100);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${manifest.files[0].sizeBytes}`);
  });

  it('rejects a tampered signature or expiry with LINK_EXPIRED', async () => {
    const url = new URL(manifest.files[0].url);
    url.searchParams.set('sig', 'x'.repeat(43));
    const badSig = await request(app).get(url.pathname + url.search);
    expect(badSig.status).toBe(403);
    expect(badSig.body.error.code).toBe('LINK_EXPIRED');

    const url2 = new URL(manifest.files[0].url);
    url2.searchParams.set('exp', String(Number(url2.searchParams.get('exp')) + 1));
    expect((await request(app).get(url2.pathname + url2.search)).status).toBe(403);
  });

  it('never serves files outside the pack, even with a correctly signed path', async () => {
    // Sign the traversal path with the real secret so the path guard itself is tested.
    const signed = new URL(signPackFileUrl(manifest.packId, '../../../.env'));
    const qs = signed.search;
    const res = await request(app).get(`/v1/packs/${manifest.packId}/files/..%2F..%2F..%2F.env${qs}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('JWT_ACCESS_SECRET');
  });
});
