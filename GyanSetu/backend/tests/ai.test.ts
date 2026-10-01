import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { replyLanguage, unescapeNewlines } from '../src/modules/ai/ai.service';
import { app, bearer, signupUser } from './helpers';

/** OpenAI-compatible providers (Groq default, xAI), with the network stubbed: no real keys or calls. */
describe('AI tutor via OpenAI-compatible providers', () => {
  let token: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    token = (await signupUser()).accessToken;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    env.AI_PROVIDER = 'groq';
    env.GROQ_API_KEY = '';
    env.XAI_API_KEY = '';
  });

  function stub(provider: 'groq' | 'xai', reply: (body: any) => { status?: number; json?: unknown }) {
    const calls: { url: string; init: RequestInit; body: any }[] = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url: String(url), init, body });
      const r = reply(body);
      return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
    }) as typeof fetch;
    env.AI_PROVIDER = provider;
    if (provider === 'groq') env.GROQ_API_KEY = 'gsk-test-key';
    else env.XAI_API_KEY = 'xai-test-key';
    return calls;
  }

  const answerCitingFirstSource = (body: any) => {
    const sentId = /<source id="([^"]+)"/.exec(body.messages[1].content)?.[1];
    return {
      json: {
        model: body.model,
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
  };

  const ask = (question: string, courseId?: string) =>
    request(app).post('/v1/ai/ask').set(bearer(token)).send({ question, courseId });

  it('Groq: strict JSON schema on gpt-oss-120b with low reasoning; cites only given excerpts', async () => {
    const calls = stub('groq', answerCitingFirstSource);

    const res = await ask('What is the difference between a list and a tuple?', 'python');
    expect(res.status).toBe(200);

    const { url, init, body } = calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk-test-key');
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.include_reasoning).toBe(false);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0].role).toBe('system');

    expect(res.body).toMatchObject({ confidence: 'high', groundedInCourseMaterial: true, mode: 'online' });
    // The invented id is dropped; only the real Python excerpt remains.
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].courseId).toBe('python');
  });

  it('xAI: same contract, routed to the xAI endpoint', async () => {
    const calls = stub('xai', answerCitingFirstSource);
    const res = await ask('What is the difference between a list and a tuple?', 'python');
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe('https://api.x.ai/v1/chat/completions');
    expect(calls[0].body.model).toBe('grok-4.7');
    expect(calls[0].body.reasoning_effort).toBeUndefined();
  });

  it('maps rate limits to AI_BUSY and cut-off replies to AI_UNAVAILABLE', async () => {
    stub('groq', () => ({ status: 429, json: { error: 'rate limited' } }));
    const busy = await ask('What is a variable?');
    expect(busy.status).toBe(503);
    expect(busy.body.error.code).toBe('AI_BUSY');

    stub('groq', () => ({ json: { choices: [{ finish_reason: 'length', message: { content: '{"answer": "trunc' } }] } }));
    const cut = await ask('What is a variable?');
    expect(cut.status).toBe(502);
    expect(cut.body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('does not leak the provider error text to students', async () => {
    stub('groq', () => ({ status: 401, json: { error: { message: 'Invalid API Key' } } }));
    const res = await ask('What is a variable?');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('API Key');
  });
});

describe('AI reply language', () => {
  it('answers Devanagari questions in Hindi and Latin-script questions in English/Hinglish', () => {
    expect(replyLanguage('Python में list और tuple में क्या अंतर है?')).toMatch(/^Hindi/);
    expect(replyLanguage('What is a primary key?')).toMatch(/^English/);
    expect(replyLanguage('list aur tuple mein kya fark hai')).toMatch(/Hinglish/);
  });
});

describe('AI answer clean-up', () => {
  it('turns double-escaped line breaks into real ones, but leaves code in normal answers alone', () => {
    // The model sent backslash + "n" characters, not line breaks.
    expect(unescapeNewlines('TCP is reliable.\\n\\nUDP is fast.')).toBe('TCP is reliable.\n\nUDP is fast.');
    // A real multi-line answer containing a code escape is left exactly as is.
    const withCode = 'Example:\nprint("a\\nb")';
    expect(unescapeNewlines(withCode)).toBe(withCode);
  });
});
