import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { app } from './helpers';

/** AI Navigator intent endpoint, with the Groq call stubbed (no real key or network). */
describe('POST /v1/navigator/intent', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    env.AI_PROVIDER = 'groq';
    env.GROQ_API_KEY = '';
  });

  function stubModel(actions: unknown) {
    const calls: any[] = [];
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ model: 'test', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(actions) } }] }),
        { status: 200 },
      );
    }) as typeof fetch;
    env.AI_PROVIDER = 'groq';
    env.GROQ_API_KEY = 'gsk-test-key';
    return calls;
  }

  const action = (a: Record<string, unknown>) => ({ target: null, query: null, index: null, lessonNumber: null, ...a });

  it('works for guests and sends the screen context and strict action schema', async () => {
    const calls = stubModel({ actions: [action({ action: 'OPEN_COURSE', target: 'dsa' })] });
    const res = await request(app).post('/v1/navigator/intent').send({
      message: 'open my DSA course',
      context: {
        route: '/courses',
        courses: [{ id: 'dsa', title: 'Data Structures & Algorithms' }],
        screenItems: ['Python Basics', 'DBMS'],
        currentCourse: null,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual([action({ action: 'OPEN_COURSE', target: 'dsa' })]);

    const body = calls[0];
    expect(body.response_format.json_schema.name).toBe('navigator_actions');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.max_completion_tokens).toBe(1500);
    expect(body.messages[1].content).toContain('dsa: Data Structures & Algorithms');
    expect(body.messages[1].content).toContain('1. Python Basics');
    // The model is only ever offered the fixed catalog of action names.
    expect(body.response_format.json_schema.schema.properties.actions.items.properties.action.enum).toContain('GO_BACK');
  });

  it('turns an action outside the catalog into UNKNOWN instead of passing it through', async () => {
    stubModel({ actions: [action({ action: 'DELETE_ACCOUNT' })] });
    const res = await request(app).post('/v1/navigator/intent').send({ message: 'delete my account' });
    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual([action({ action: 'UNKNOWN' })]);
  });

  it('returns multi-step commands in order', async () => {
    stubModel({ actions: [action({ action: 'OPEN_COURSE', target: 'dsa' }), action({ action: 'START_NEXT_LESSON', target: 'dsa' })] });
    const res = await request(app).post('/v1/navigator/intent').send({ message: 'open DSA and start the next lesson' });
    expect(res.body.actions.map((a: any) => a.action)).toEqual(['OPEN_COURSE', 'START_NEXT_LESSON']);
  });

  it('validates input and reports when no AI is configured', async () => {
    expect((await request(app).post('/v1/navigator/intent').send({ message: '' })).status).toBe(400);
    env.GROQ_API_KEY = '';
    const res = await request(app).post('/v1/navigator/intent').send({ message: 'go home' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});
