import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { normalizeSubject, waitForGeneration } from '../src/modules/learningPacks/generator';
import { app, bearer, signupUser } from './helpers';

/**
 * Dynamic learning packs, with the Groq API stubbed. The stub answers by schema
 * name, so outline, module, tutor and question calls each get a plausible reply.
 */

type Reply = { status?: number; json?: unknown };
const realFetch = globalThis.fetch;

const groqReply = (content: unknown): Reply => ({
  json: {
    model: 'openai/gpt-oss-120b',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  },
});

function outlineFor(subject: string, opts: { learnable?: boolean; extraTopic?: boolean; dropTopic?: boolean } = {}) {
  const topics2 = [
    { key: 'bfs', title: 'Breadth-First Search', summary: 'Level by level', difficulty: 'beginner' },
    { key: 'dfs', title: 'Depth-First Search', summary: 'Go deep first', difficulty: 'intermediate' },
  ];
  return {
    learnable: opts.learnable ?? true,
    rejectionReason: opts.learnable === false ? 'That is not a subject.' : '',
    title: subject,
    subject,
    category: 'programming',
    icon: '🕸️',
    description: `Learn ${subject}`,
    level: 'beginner',
    levelRange: { from: 'beginner', to: 'advanced' },
    estimatedHours: 6,
    prerequisites: ['Arrays'],
    learningObjectives: ['Traverse graphs'],
    tags: ['dsa'],
    modules: [
      {
        key: 'graph-basics',
        title: 'Graph Basics',
        description: 'Vertices and edges',
        topics: [
          ...(opts.dropTopic ? [] : [{ key: 'what-is-a-graph', title: 'What is a Graph', summary: 'Nodes and edges', difficulty: 'beginner' }]),
          { key: 'representation', title: 'Graph Representation', summary: 'Adjacency list', difficulty: 'beginner' },
        ],
      },
      {
        key: 'traversal',
        title: 'Traversal',
        description: 'BFS and DFS',
        topics: opts.extraTopic ? [...topics2, { key: 'topo-sort', title: 'Topological Sort', summary: 'Order a DAG', difficulty: 'advanced' }] : topics2,
      },
    ],
  };
}

function topicContentFor(t: { key: string; title: string }) {
  return {
    key: t.key,
    title: t.title,
    difficulty: 'beginner',
    estimatedMinutes: 12,
    objectives: ['Explain it'],
    explanation: `## ${t.title}\nA graph is a set of vertices connected by edges. ${t.title} explained.`,
    simpleExplanation: 'Dots joined by lines.',
    analogy: 'Like cities joined by roads.',
    keyPoints: ['Vertices are nodes', 'Edges connect vertices'],
    examples: [{ title: 'Road map', body: 'Cities and roads.', code: '', language: '', steps: [] }],
    formulas: [],
    commonMistakes: [{ mistake: 'Edges must be straight', correction: 'Edges are just connections' }],
    mcqs: [
      { question: 'A graph is made of?', options: ['Vertices and edges', 'Rows', 'Bits', 'Files'], correctIndex: 0, explanation: 'By definition.', difficulty: 'beginner' },
      // Invalid: correctIndex outside the options. Must be dropped, not break the module.
      { question: 'Broken?', options: ['a', 'b'], correctIndex: 7, explanation: '', difficulty: 'beginner' },
    ],
    viva: [{ question: 'What is a graph?', expectedAnswer: 'Vertices joined by edges.', keyPoints: ['vertices', 'edges'], followUp: 'Directed?' }],
    practice: [{ type: 'coding', prompt: 'Build an adjacency list.', hints: ['Use a map'], solution: 'adj = {}', answerKeywords: ['adjacency'] }],
    flashcards: [{ front: 'Vertex?', back: 'A node' }],
    summary: 'Graphs model connections.',
    keywords: ['graph', 'vertex', 'edge'],
  };
}

/** Routes stubbed Groq calls by schema name. `failModule` makes that module's calls fail. */
function stubGroq(opts: { learnable?: boolean; failModule?: string; extraTopic?: boolean; dropTopic?: boolean } = {}) {
  const calls: { schema: string; body: any }[] = [];
  globalThis.fetch = vi.fn(async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const schema = body.response_format.json_schema.name as string;
    calls.push({ schema, body });
    const user = body.messages[1].content as string;
    let reply: Reply;
    if (schema === 'learning_pack_outline') {
      const subject = /<subject>(.*)<\/subject>/.exec(user)?.[1] ?? 'Graph Algorithms';
      reply = groqReply(outlineFor(subject, opts));
    } else if (schema === 'learning_pack_topic') {
      const module = JSON.parse(/<module>\n([\s\S]*?)\n<\/module>/.exec(user)![1]);
      const topic = JSON.parse(/<topic>\n([\s\S]*?)\n<\/topic>/.exec(user)![1]);
      reply = module.key === opts.failModule ? { status: 500, json: {} } : groqReply(topicContentFor(topic));
    } else if (schema === 'pack_tutor_answer') {
      const sent = /<topic id="([^"]+)"/.exec(user)?.[1];
      reply = groqReply({
        answer: 'BFS visits neighbours level by level.',
        confidence: 'high',
        groundedInPack: true,
        usedTopicIds: [sent, 'made-up-topic'],
        suggestedFollowUps: ['Give me an example'],
      });
    } else {
      reply = groqReply({
        mcqs: [{ question: 'New Q?', options: ['x', 'y', 'z', 'w'], correctIndex: 2, explanation: 'z', difficulty: 'beginner' }],
        viva: [],
      });
    }
    return new Response(JSON.stringify(reply.json ?? {}), { status: reply.status ?? 200 });
  }) as typeof fetch;
  env.AI_PROVIDER = 'groq';
  env.GROQ_API_KEY = 'gsk-test-key';
  return calls;
}

const uniqueSubject = (base: string) => `${base} ${randomUUID().slice(0, 8)}`;

afterEach(() => {
  globalThis.fetch = realFetch;
  env.GROQ_API_KEY = '';
});

describe('subject normalisation', () => {
  it('strips request phrasing so equivalent requests share a pack', () => {
    expect(normalizeSubject('Teach me Computer Networks!')).toBe('computer networks');
    expect(normalizeSubject('I want to learn React')).toBe('react');
    expect(normalizeSubject('  C++ DSA  ')).toBe('c++ dsa');
    expect(normalizeSubject('LeetCode 678')).toBe('leetcode 678');
  });
});

describe('dynamic learning packs', () => {
  let token: string;
  beforeAll(async () => {
    token = (await signupUser()).accessToken;
  });

  const create = (body: object, t = token) => request(app).post('/v1/learning-packs').set(bearer(t)).send(body);

  it('needs a login to generate', async () => {
    const res = await request(app).post('/v1/learning-packs').send({ subject: 'Graph Algorithms' });
    expect(res.status).toBe(401);
  });

  it('returns the outline immediately, then generates content in the background', async () => {
    const calls = stubGroq();
    const subject = uniqueSubject('Graph Algorithms');
    const res = await create({ subject: `Teach me ${subject}` });
    expect(res.status).toBe(202);
    expect(res.body.reused).toBe(false);
    expect(res.body.version).toMatchObject({ version: 1, status: 'generating', modulesTotal: 2 });
    expect(res.body.version.outline.modules.map((m: any) => m.title)).toEqual(['Graph Basics', 'Traversal']);

    const packId = res.body.pack.id;
    await waitForGeneration(packId, 1);
    expect(calls.filter((c) => c.schema === 'learning_pack_topic')).toHaveLength(4);

    const status = await request(app).get(`/v1/learning-packs/${packId}`).set(bearer(token));
    expect(status.body.version).toMatchObject({ status: 'ready', modulesDone: 2, topicCount: 4 });
    expect(status.body.pack.latestReadyVersion).toBe(1);

    // Content is served byte-exact with a checksum the app verifies.
    const content = await request(app).get(`/v1/learning-packs/${packId}/versions/1/content`).set(bearer(token)).buffer(true);
    const sha = createHash('sha256').update(content.text, 'utf8').digest('hex');
    expect(content.headers['x-content-sha256']).toBe(sha);
    expect(status.body.version.sha256).toBe(sha);

    const pack = JSON.parse(content.text);
    expect(pack).toMatchObject({ schemaVersion: 3, packId, version: 1, migration: null, plan: null });
    const topic = pack.modules[0].topics[0];
    expect(topic.id).toBe('what-is-a-graph');
    expect(topic.mcqs).toHaveLength(1); // the inconsistent MCQ was dropped
    expect(topic.mcqs[0].id).toBe('what-is-a-graph~mcq-1');
    // Module metadata (summary, revisionNotes, glossary) is synthesised from the topics'
    // own content now, not a separate AI-sourced field — no glossary call is made per topic.
    expect(pack.glossary).toHaveLength(0);
  });

  it('reuses an existing public pack for the same subject without calling the AI', async () => {
    stubGroq();
    const subject = uniqueSubject('Operating Systems');
    const first = await create({ subject });
    await waitForGeneration(first.body.pack.id, 1);

    const calls = stubGroq();
    const again = await create({ subject: `I want to learn ${subject}` });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ reused: true, pack: { id: first.body.pack.id } });
    expect(calls).toHaveLength(0);
  });

  it('refuses requests that are not learnable', async () => {
    stubGroq({ learnable: false });
    const res = await create({ subject: uniqueSubject('asdfgh') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_LEARNABLE');
  });

  it('marks a version failed when a module fails, and retry resumes only the missing module', async () => {
    stubGroq({ failModule: 'traversal' });
    const res = await create({ subject: uniqueSubject('Graph Theory') });
    const packId = res.body.pack.id;
    await waitForGeneration(packId, 1);

    const failed = await request(app).get(`/v1/learning-packs/${packId}`).set(bearer(token));
    expect(failed.body.version).toMatchObject({ status: 'failed', modulesDone: 1 });

    const calls = stubGroq();
    const retry = await request(app).post(`/v1/learning-packs/${packId}/versions/1/retry`).set(bearer(token));
    expect(retry.status).toBe(202);
    await waitForGeneration(packId, 1);
    expect(calls.filter((c) => c.schema === 'learning_pack_topic')).toHaveLength(2);
    const ready = await request(app).get(`/v1/learning-packs/${packId}`).set(bearer(token));
    expect(ready.body.version.status).toBe('ready');
  });

  it('new versions keep topic ids and list removed topics for progress migration', async () => {
    stubGroq();
    const res = await create({ subject: uniqueSubject('Graphs') });
    const packId = res.body.pack.id;
    await waitForGeneration(packId, 1);

    const calls = stubGroq({ extraTopic: true, dropTopic: true });
    const v2 = await request(app).post(`/v1/learning-packs/${packId}/versions`).set(bearer(token)).send({ changeRequest: 'Add topological sort' });
    expect(v2.status).toBe(202);
    expect(v2.body.version.version).toBe(2);
    // The previous outline is sent so the model can keep keys stable.
    expect(calls[0].body.messages[1].content).toContain('<previous_outline>');
    await waitForGeneration(packId, 2);

    const content = JSON.parse((await request(app).get(`/v1/learning-packs/${packId}/versions/2/content`).set(bearer(token))).text);
    const ids = content.modules.flatMap((m: any) => m.topics.map((t: any) => t.id));
    expect(ids).toEqual(['representation', 'bfs', 'dfs', 'topo-sort']);
    expect(content.migration).toEqual({ fromVersion: 1, removedTopicIds: ['what-is-a-graph'] });
  });

  it('hides personal (goal) packs from other students', async () => {
    stubGroq();
    const res = await create({ subject: uniqueSubject('Calculus'), goal: 'Pass my JEE exam in March' });
    const other = (await signupUser()).accessToken;
    expect((await request(app).get(`/v1/learning-packs/${res.body.pack.id}`).set(bearer(other))).status).toBe(404);
    expect((await request(app).get(`/v1/learning-packs/${res.body.pack.id}`).set(bearer(token))).status).toBe(200);
  });

  it('the pack tutor cites only topics it was given', async () => {
    stubGroq();
    const res = await create({ subject: uniqueSubject('BFS and DFS') });
    const packId = res.body.pack.id;
    await waitForGeneration(packId, 1);

    const answer = await request(app)
      .post(`/v1/learning-packs/${packId}/tutor`)
      .set(bearer(token))
      .send({ question: 'Explain breadth-first search', topicId: 'bfs', context: { percent: 20, weakTopicIds: ['dfs'] } });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ groundedInPack: true, mode: 'online' });
    expect(answer.body.topics).toEqual([{ topicId: 'bfs', title: 'Breadth-First Search' }]);

    const questions = await request(app)
      .post(`/v1/learning-packs/${packId}/topics/bfs/questions`)
      .set(bearer(token))
      .send({ mcqCount: 1 });
    expect(questions.status).toBe(200);
    expect(questions.body.mcqs[0].id).toMatch(/^bfs~xmcq-/);
  });

  it('lists converted courses and ready packs in explore', async () => {
    const res = await request(app).get('/v1/learning-packs?q=python');
    expect(res.status).toBe(200);
    expect(res.body.packs.some((p: any) => p.source === 'course' && p.title === 'Python Basics')).toBe(true);
  });
});

describe('learning pack progress sync', () => {
  const sync = (token: string, items: unknown[]) =>
    request(app).post('/v1/sync/batch').set(bearer(token)).send({ deviceId: 'test-device', items });
  const item = (type: string, payload: object, at = new Date().toISOString()) => ({ id: randomUUID(), type, createdAt: at, payload });

  it('applies library, progress, topic and answer items with merge rules, and pulls them back', async () => {
    const { accessToken } = await signupUser();
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM generated_packs WHERE legacy_course_id = 'python'");
    const packId = rows[0].id;
    const t1 = '2026-10-01T10:00:00.000Z';
    const t2 = '2026-10-01T11:00:00.000Z';

    const items = [
      item('LP_LIBRARY_CHANGED', { packId, version: 1, state: 'active', updatedAt: t1 }),
      item('LP_PROGRESS_UPDATED', { packId, percent: 60, currentTopicId: 'lists-and-tuples', updatedAt: t2 }),
      item('LP_PROGRESS_UPDATED', { packId, percent: 30, currentTopicId: 'introduction-to-python', updatedAt: t1 }),
      item('LP_TOPIC_UPDATED', { packId, topicId: 'introduction-to-python', completedAt: t2, timeSpentDeltaSec: 120, updatedAt: t2 }),
      item('LP_TOPIC_UPDATED', { packId, topicId: 'introduction-to-python', completedAt: t1, bookmarked: true, timeSpentDeltaSec: 30, updatedAt: t1 }),
      item('LP_ANSWER_RECORDED', {
        answerId: randomUUID(), packId, packVersion: 1, topicId: 'lists-and-tuples', itemId: 'lists-and-tuples~mcq-1',
        kind: 'mcq', correct: false, score: 0, answeredAt: t1,
      }),
    ];
    const first = await sync(accessToken, items);
    expect(first.body.results.map((r: any) => r.status)).toEqual(Array(6).fill('applied'));
    // Replaying the batch (lost response) changes nothing: time is not double-counted.
    const replay = await sync(accessToken, items);
    expect(replay.body.results.every((r: any) => r.status === 'duplicate')).toBe(true);

    const pull = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    expect(pull.body.packLibrary).toEqual([expect.objectContaining({ packId, state: 'active', title: 'Python Basics' })]);
    // Max percent; position from the newest update.
    expect(pull.body.packProgress[0]).toMatchObject({ percent: 60, currentTopicId: 'lists-and-tuples' });
    const topic = pull.body.packTopics[0];
    expect(topic).toMatchObject({ topicId: 'introduction-to-python', bookmarked: true, timeSpentSec: 150 });
    expect(new Date(topic.completedAt).toISOString()).toBe(t1); // earliest completion wins
    expect(pull.body.packAnswers).toHaveLength(1);

    // An older library change can't undo a newer one.
    await sync(accessToken, [item('LP_LIBRARY_CHANGED', { packId, version: 1, state: 'deleted', updatedAt: '2026-09-01T00:00:00.000Z' })]);
    const lib = await request(app).get('/v1/learning-packs/library').set(bearer(accessToken));
    expect(lib.body.packs[0].state).toBe('active');
  });

  it('syncs tutor chat; a clear removes older messages everywhere and late older messages stay out', async () => {
    const { accessToken } = await signupUser();
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM generated_packs WHERE legacy_course_id = 'python'");
    const packId = rows[0].id;
    const msg = (role: string, text: string, createdAt: string) =>
      item('LP_CHAT_MESSAGE', { messageId: randomUUID(), packId, role, text, meta: role === 'tutor' ? { mode: 'offline', grounded: true } : null, createdAt });

    const first = [msg('user', 'What is a list?', '2026-10-01T10:00:00.000Z'), msg('tutor', 'A list is…', '2026-10-01T10:00:01.000Z')];
    expect((await sync(accessToken, first)).body.results.map((r: any) => r.status)).toEqual(['applied', 'applied']);
    expect((await sync(accessToken, first)).body.results.every((r: any) => r.status === 'duplicate')).toBe(true);

    let pull = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    expect(pull.body.packChat.map((m: any) => m.text)).toEqual(['What is a list?', 'A list is…']);
    expect(pull.body.packChat[1].meta).toEqual({ mode: 'offline', grounded: true });

    // Clear at 11:00, then a message written offline at 10:30 arrives late, and a new one at 11:05.
    await sync(accessToken, [item('LP_CHAT_CLEARED', { packId, clearedAt: '2026-10-01T11:00:00.000Z' })]);
    await sync(accessToken, [msg('user', 'late, from before the clear', '2026-10-01T10:30:00.000Z'), msg('user', 'after the clear', '2026-10-01T11:05:00.000Z')]);

    pull = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    expect(pull.body.packChat.map((m: any) => m.text)).toEqual(['after the clear']);
    expect(new Date(pull.body.packChatClears[0].clearedAt).toISOString()).toBe('2026-10-01T11:00:00.000Z');
  });

  it('rejects progress for a pack that does not exist', async () => {
    const { accessToken } = await signupUser();
    const res = await sync(accessToken, [
      item('LP_PROGRESS_UPDATED', { packId: randomUUID(), percent: 10, currentTopicId: null, updatedAt: new Date().toISOString() }),
    ]);
    expect(res.body.results[0]).toMatchObject({ status: 'rejected', code: 'UNKNOWN_REFERENCE' });
  });
});
