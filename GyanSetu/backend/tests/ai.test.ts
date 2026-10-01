import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { app, bearer, signupUser } from './helpers';

/** Grok (xAI) provider, with the network stubbed: no real key or calls in tests. */
describe('AI tutor via xAI (Grok)', () => {
  let token: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    token = (await signupUser()).accessToken;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    env.XAI_API_KEY = '';
  });

  function stubXai(reply: (body: any) => { status?: number; json?: unknown }) {
    const calls: { url: string; init: RequestInit; body: any }[] = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url: String(url), init, body });
      const r = reply(body);
      return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
    }) as typeof fetch;
    env.XAI_API_KEY = 'xai-test-key';
    return calls;
  }

  const ask = (question: string, courseId?: string) =>
    request(app).post('/v1/ai/ask').set(bearer(token)).send({ question, courseId });

  it('sends a strict JSON-schema request and cites only excerpts it was given', async () => {
    const calls = stubXai((body) => {
      const sentId = /<source id="([^"]+)"/.exec(body.messages[1].content)?.[1];
      return {
        json: {
          model: 'grok-4.7',
          choices: [{
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                answer: 'A tuple cannot be changed after it is created; a list can.',
                confidence: 'high',
                groundedInCourseMaterial: true,
                usedSourceIds: [sentId, 'invented-source-id'],
              }),
            },
          }],
          usage: { prompt_tokens: 120, completion_tokens: 30 },
        },
      };
    });

    const res = await ask('What is the difference between a list and a tuple?', 'python');
    expect(res.status).toBe(200);

    const { url, init, body } = calls[0];
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer xai-test-key');
    expect(body.model).toBe('grok-4.7');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].role).toBe('system');

    expect(res.body).toMatchObject({ confidence: 'high', groundedInCourseMaterial: true, mode: 'online' });
    // The invented id is dropped; only the real Python excerpt remains.
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].courseId).toBe('python');
  });

  it('maps rate limits to AI_BUSY and cut-off replies to AI_UNAVAILABLE', async () => {
    stubXai(() => ({ status: 429, json: { error: 'rate limited' } }));
    const busy = await ask('What is a variable?');
    expect(busy.status).toBe(503);
    expect(busy.body.error.code).toBe('AI_BUSY');

    stubXai(() => ({ json: { choices: [{ finish_reason: 'length', message: { content: '{"answer": "trunc' } }] } }));
    const cut = await ask('What is a variable?');
    expect(cut.status).toBe(502);
    expect(cut.body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('does not leak the provider error text to students', async () => {
    stubXai(() => ({ status: 401, json: { error: 'Incorrect API key provided: xai-****' } }));
    const res = await ask('What is a variable?');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('API key');
  });
});
