import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { fallbackPlan, waitForGeneration } from '../src/modules/learningPacks/generator';
import type { Outline } from '../src/modules/learningPacks/pack.schema';
import { applyPlan, honestCoverage } from '../src/modules/learningPacks/plan';
import { isoDurationToSec, pickBest } from '../src/modules/learningPacks/videos';
import { app, bearer, signupUser } from './helpers';

/**
 * Duration-based packs, videos, video/study sync, career guidance and history deletion.
 * The AI (Groq) and Wikimedia are stubbed: no network, no keys.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  env.GROQ_API_KEY = '';
  env.VIDEO_SOURCES = '';
});

const groq = (content: unknown) =>
  new Response(JSON.stringify({ model: 'openai/gpt-oss-120b', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: {} }));

const curriculumReply = (subject: string) => ({
  learnable: true, rejectionReason: '', title: subject, subject, category: 'programming', icon: '🐍',
  description: `Learn ${subject}`, level: 'beginner', levelRange: { from: 'beginner', to: 'intermediate' }, estimatedHours: 10,
  prerequisites: [], learningObjectives: ['Write Python programs'], tags: ['python'],
  modules: [
    { key: 'basics', title: 'Basics', description: '', topics: [
      { key: 'variables', title: 'Variables', summary: '', difficulty: 'beginner', kind: 'lesson', priority: 'core', estimatedMinutes: 30 },
      { key: 'loops', title: 'Loops', summary: '', difficulty: 'beginner', kind: 'lesson', priority: 'core', estimatedMinutes: 40 },
    ] },
    { key: 'data', title: 'Data Analysis', description: '', topics: [
      { key: 'pandas', title: 'Pandas DataFrames', summary: '', difficulty: 'intermediate', kind: 'lesson', priority: 'core', estimatedMinutes: 45 },
      { key: 'mini-project', title: 'Mini project: analyse a CSV', summary: '', difficulty: 'intermediate', kind: 'project', priority: 'important', estimatedMinutes: 60 },
    ] },
  ],
});

const planReply = {
  depth: 'foundation',
  coverageStatement: 'Learn Python completely and become an expert in 5 days', // over-claim: must be replaced
  outcomes: ['Clean a dataset with pandas'], notCovered: ['Web frameworks'],
  careerPaths: [{ title: 'Data Analyst', relevance: 'pandas is core to analysis' }],
  extraTopics: [
    { key: 'final-test', title: 'Final assessment', summary: '', kind: 'assessment', difficulty: 'beginner', moduleKey: 'practice-projects-assessment', estimatedMinutes: 40 },
  ],
  days: [
    { dayNumber: 1, title: 'Python basics', focus: '', topicKeys: ['variables', 'loops'], estimatedMinutes: 70, completionCriteria: 'Write a loop' },
    { dayNumber: 2, title: 'pandas', focus: '', topicKeys: ['pandas'], estimatedMinutes: 45, completionCriteria: '' },
    // day 3 missing on purpose → becomes a revision day
    { dayNumber: 4, title: 'Project', focus: '', topicKeys: ['mini-project', 'not-a-topic'], estimatedMinutes: 60, completionCriteria: '' },
    { dayNumber: 5, title: 'Assessment', focus: '', topicKeys: ['final-test'], estimatedMinutes: 40, completionCriteria: '' },
  ],
};

const topicReply = (t: { key: string; title: string }) => ({
  key: t.key, title: t.title, difficulty: 'beginner', estimatedMinutes: 20, objectives: [], explanation: `About ${t.title}.`,
  simpleExplanation: '', analogy: '', keyPoints: [], examples: [], formulas: [], commonMistakes: [],
  mcqs: [{ question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', difficulty: 'beginner' }],
  viva: [], practice: [], flashcards: [], summary: '', keywords: [t.key],
});

/** Routes stubbed calls: Groq by schema name, Wikimedia by host. Records prompts for assertions. */
function stub(opts: { videos?: boolean; career?: boolean } = {}) {
  const calls: { schema?: string; url: string; user?: string }[] = [];
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    if (u.includes('commons.wikimedia.org')) {
      calls.push({ url: u });
      return new Response(JSON.stringify({
        query: { pages: {
          1: { title: 'File:Pandas dataframe tutorial.webm', imageinfo: [{
            url: 'https://upload.wikimedia.org/x/Pandas_dataframe_tutorial.webm', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Pandas.webm',
            thumburl: 'https://upload.wikimedia.org/thumb.jpg', size: 4_000_000, duration: 245, mime: 'video/webm',
            extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Asha</a>' }, ObjectName: { value: 'Pandas dataframe tutorial' } },
          }] },
          2: { title: 'File:Long lecture.webm', imageinfo: [{ url: 'https://u/long.webm', size: 1, duration: 5400, mime: 'video/webm', extmetadata: { LicenseShortName: { value: 'CC BY 4.0' } } }] },
        } },
      }));
    }
    const body = JSON.parse(init.body);
    const schema = body.response_format.json_schema.name as string;
    const user = body.messages[1].content as string;
    calls.push({ schema, url: u, user });
    if (schema === 'learning_pack_outline') return groq(curriculumReply(/<subject>(.*)<\/subject>/.exec(user)![1]));
    if (schema === 'duration_plan') return groq(planReply);
    if (schema === 'learning_pack_topic') return groq(topicReply(JSON.parse(/<topic>\n([\s\S]*?)\n<\/topic>/.exec(user)![1])));
    if (schema === 'video_picks') return groq({ picks: [{ topicKey: 'pandas', query: 'pandas dataframe tutorial', maxMinutes: 8, reason: 'visual' }] });
    if (schema === 'career_guidance') {
      return groq({
        summary: 'You are building data skills.', interests: [{ label: 'Data', emoji: '📊', evidence: 'Python pack' }],
        paths: [
          { title: 'Backend Developer', match: 40, why: ['x'], skillsHave: [], skillsToImprove: [], nextPacks: [], projects: [] },
          { title: 'Data Analyst', match: 140, why: ['Completed pandas'], skillsHave: ['pandas'], skillsToImprove: ['SQL'],
            nextPacks: [{ subject: 'SQL', durationDays: 500, goal: 'queries' }], projects: ['Sales dashboard'] },
        ],
        caveats: 'Based on one pack.',
      });
    }
    if (schema === 'career_roadmap') {
      return groq({ goal: /<target_path>(.*)<\/target_path>/.exec(user)?.[1] ?? '', currentLevel: 'beginner',
        skillAreas: [{ name: 'Python', progress: 60, evidence: 'pack' }],
        nextSteps: [{ step: 'Learn SQL', why: 'core', packSubject: 'SQL', packDays: 10 }, { step: 'Build a dashboard', why: 'portfolio', packSubject: '', packDays: 0 }],
        milestones: ['A published analysis'] });
    }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  env.AI_PROVIDER = 'groq';
  env.GROQ_API_KEY = 'gsk-test';
  env.VIDEO_SOURCES = opts.videos ? 'wikimedia' : '';
  return calls;
}

// ─────────────────────────── Planning invariants ───────────────────────────

const baseOutline = (): Outline => {
  const c = curriculumReply('Python');
  return { ...c, modules: c.modules.map((m) => ({ ...m, topics: m.topics.map((t) => ({ ...t, difficulty: 'beginner' as const, kind: t.kind as 'lesson' | 'project' })) })) } as unknown as Outline;
};

describe('duration planner normalisation', () => {
  it('always yields exactly N days, every topic once, no empty day, honest coverage', () => {
    const out = applyPlan(baseOutline(), planReply as any, { durationDays: 5, dailyMinutes: 60, goal: 'data science' });
    const plan = out.plan!;
    expect(plan.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4, 5]);
    const scheduled = plan.days.flatMap((d) => d.topicKeys);
    const all = out.modules.flatMap((m) => m.topics.map((t) => t.key));
    expect(new Set(scheduled).size).toBe(scheduled.length);
    expect(new Set(scheduled)).toEqual(new Set(all));
    expect(plan.days.every((d) => d.topicKeys.length > 0)).toBe(true);
    // The gap on day 3 became a generated revision topic; the unknown key was ignored.
    const day3 = out.modules.flatMap((m) => m.topics).find((t) => t.key === plan.days[2].topicKeys[0])!;
    expect(day3).toMatchObject({ kind: 'revision', dayNumber: 3 });
    expect(plan.coverageStatement).toBe('Build a strong foundation in Python in 5 days.');
    expect(out.modules.at(-1)!.key).toBe('practice-projects-assessment');
  });

  it('merges overflow days and fills a short plan deterministically', () => {
    const out = applyPlan(baseOutline(), planReply as any, { durationDays: 2, dailyMinutes: 60, goal: null });
    expect(out.plan!.days).toHaveLength(2);
    expect(out.plan!.days[1].topicKeys).toEqual(expect.arrayContaining(['mini-project', 'final-test']));

    const fallback = applyPlan(baseOutline(), fallbackPlan(baseOutline(), { durationDays: 10, dailyMinutes: 30, goal: null }), { durationDays: 10, dailyMinutes: 30, goal: null });
    expect(fallback.plan!.days).toHaveLength(10);
    expect(fallback.plan!.days.every((d) => d.topicKeys.length > 0)).toBe(true);
  });

  it('keeps a realistic coverage statement and rejects over-claims', () => {
    expect(honestCoverage('Master the core concepts of SQL in 10 days', 'foundation', 'SQL', 10)).toBe('Master the core concepts of SQL in 10 days');
    expect(honestCoverage('Learn everything about React', 'intermediate', 'React', 7)).toBe('Strengthen your core skills in React in 7 days.');
  });
});

describe('video selection', () => {
  it('picks short, on-topic videos and parses YouTube durations', () => {
    const base = { description: '', source: 'wikimedia' as const, url: 'u', downloadUrl: null, thumbnail: null, license: 'CC0', attribution: '', downloadable: false, sizeBytes: null };
    const best = pickBest(
      [
        { ...base, title: 'Pandas dataframe basics', durationSec: 3600 }, // too long
        { ...base, title: 'Cooking pasta', durationSec: 200 }, // off topic
        { ...base, title: 'Pandas dataframe tutorial', durationSec: 240, downloadable: true },
      ],
      'pandas dataframe tutorial',
      8,
    );
    expect(best?.title).toBe('Pandas dataframe tutorial');
    expect(isoDurationToSec('PT4M13S')).toBe(253);
    expect(isoDurationToSec('PT1H')).toBe(3600);
  });
});

// ─────────────────────────── Generation end to end ───────────────────────────

describe('duration-based generation', () => {
  let token: string;
  beforeAll(async () => {
    token = (await signupUser()).accessToken;
  });

  it('builds an N-day plan with kinds, days and licensed videos', async () => {
    const calls = stub({ videos: true });
    const subject = `Python for data ${randomUUID().slice(0, 6)}`;
    const res = await request(app).post('/v1/learning-packs').set(bearer(token)).send({ subject, durationDays: 5, dailyMinutes: 60, goal: 'data science' });
    expect(res.status).toBe(202);
    expect(res.body.pack).toMatchObject({ durationDays: 5, dailyMinutes: 60, depth: 'foundation', goal: 'data science' });
    expect(res.body.version.outline.plan.days).toHaveLength(5);
    expect(res.body.version.outline.careerPaths[0].title).toBe('Data Analyst');
    // The curriculum prompt carried the time budget and the goal.
    const curriculumPrompt = calls.find((c) => c.schema === 'learning_pack_outline')!.user!;
    expect(curriculumPrompt).toContain('5 days × 60 minutes');
    expect(curriculumPrompt).toContain('<goal>data science</goal>');

    const packId = res.body.pack.id;
    await waitForGeneration(packId, 1);
    const content = await request(app).get(`/v1/learning-packs/${packId}/versions/1/content`).set(bearer(token));
    const pack = JSON.parse(content.text);
    expect(pack.schemaVersion).toBe(3);
    expect(pack.plan.days).toHaveLength(5);
    expect(pack.plan.days.every((d: any) => d.topicIds.length > 0)).toBe(true);
    const topics = pack.modules.flatMap((m: any) => m.topics);
    expect(topics.find((t: any) => t.id === 'mini-project')).toMatchObject({ kind: 'project', dayNumber: 4 });
    expect(topics.find((t: any) => t.id === 'final-test')).toMatchObject({ kind: 'assessment', dayNumber: 5 });
    const video = topics.find((t: any) => t.id === 'pandas').videos[0];
    expect(video).toMatchObject({
      source: 'wikimedia', downloadable: true, license: 'CC BY-SA 4.0', attribution: 'Asha', durationSec: 245,
      downloadUrl: 'https://upload.wikimedia.org/x/Pandas_dataframe_tutorial.webm',
    });
    expect(createHash('sha256').update(content.text).digest('hex')).toBe(content.headers['x-content-sha256']);
  });

  it('reuses a public pack only for the same duration; a new learner with history gets a private, personalised pack', async () => {
    stub();
    const fresh = (await signupUser()).accessToken;
    const subject = `Statistics ${randomUUID().slice(0, 6)}`;
    const first = await request(app).post('/v1/learning-packs').set(bearer(fresh)).send({ subject, durationDays: 7, dailyMinutes: 30 });
    await waitForGeneration(first.body.pack.id, 1);

    const other = (await signupUser()).accessToken;
    const same = await request(app).post('/v1/learning-packs').set(bearer(other)).send({ subject, durationDays: 7, dailyMinutes: 30 });
    expect(same.body).toMatchObject({ reused: true, pack: { id: first.body.pack.id } });
    const longer = await request(app).post('/v1/learning-packs').set(bearer(other)).send({ subject, durationDays: 15, dailyMinutes: 30 });
    expect(longer.body.reused).toBe(false);
    await waitForGeneration(longer.body.pack.id, 1);

    // `token` has history from the previous test → personalised: private, never reused, profile in the prompt.
    const calls = stub();
    await sync(token, [item('LP_ANSWER_RECORDED', {
      answerId: randomUUID(), packId: first.body.pack.id, packVersion: 1, topicId: 'pandas', itemId: 'pandas~mcq-1', kind: 'mcq', correct: true, score: 1, answeredAt: new Date().toISOString(),
    })]);
    const personal = await request(app).post('/v1/learning-packs').set(bearer(token)).send({ subject, durationDays: 7, dailyMinutes: 30 });
    expect(personal.body.reused).toBe(false);
    expect(calls.find((c) => c.schema === 'learning_pack_outline')!.user).toContain('<learner_profile>');
    const row = await pool.query('SELECT is_public FROM generated_packs WHERE id = $1', [personal.body.pack.id]);
    expect(row.rows[0].is_public).toBe(false);
    await waitForGeneration(personal.body.pack.id, 1);
  });
});

// ─────────────────────────── Sync: video progress & study time ───────────────────────────

const sync = (token: string, items: unknown[]) => request(app).post('/v1/sync/batch').set(bearer(token)).send({ deviceId: 'd', items });
const item = (type: string, payload: object) => ({ id: randomUUID(), type, createdAt: new Date().toISOString(), payload });

describe('video progress and study time sync', () => {
  it('merges video positions (newest wins, completion sticks) and sums study time once', async () => {
    const { accessToken } = await signupUser();
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM generated_packs WHERE legacy_course_id = 'python'");
    const packId = rows[0].id;
    const items = [
      item('LP_VIDEO_PROGRESS', { packId, videoId: 'v1', positionSec: 120, durationSec: 300, completedAt: null, updatedAt: '2026-10-01T10:00:00.000Z' }),
      item('LP_VIDEO_PROGRESS', { packId, videoId: 'v1', positionSec: 300, durationSec: 300, completedAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' }),
      item('LP_STUDY_TIME', { day: '2026-10-01', secondsDelta: 600 }),
      item('LP_STUDY_TIME', { day: '2026-10-01', secondsDelta: 300 }),
    ];
    expect((await sync(accessToken, items)).body.results.map((r: any) => r.status)).toEqual(Array(4).fill('applied'));
    expect((await sync(accessToken, items)).body.results.every((r: any) => r.status === 'duplicate')).toBe(true);

    const pull = await request(app).get('/v1/sync/pull').set(bearer(accessToken));
    const v = pull.body.packVideoProgress[0];
    expect(v.positionSec).toBe(120); // the 10:00 write is newer than the 09:00 one
    expect(new Date(v.completedAt).toISOString()).toBe('2026-10-01T09:00:00.000Z'); // completion still kept
    expect(pull.body.studyDays).toEqual([{ day: '2026-10-01', seconds: 900 }]);
  });
});

// ─────────────────────────── Career guidance ───────────────────────────

describe('career guidance', () => {
  it('needs some evidence, uses only learning data + stated interests, and caches by evidence', async () => {
    const { accessToken, user } = await signupUser();
    const none = await request(app).get('/v1/career/guidance').set(bearer(accessToken));
    expect(none.body.status).toBe('insufficient_data');

    // Sensitive fields set on purpose: they must never reach the prompt.
    await pool.query(
      `UPDATE student_profiles SET gender = 'female', category = 'OBC', annual_family_income = 250000,
              interests = '{data analysis}', goals = 'Get an analyst job' WHERE user_id = $1`,
      [user.id],
    );
    const calls = stub();
    const res = await request(app).post('/v1/career/guidance/refresh').set(bearer(accessToken)).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    const g = res.body.guidance;
    expect(g.paths.map((p: any) => p.title)).toEqual(['Data Analyst', 'Backend Developer']); // sorted by match
    expect(g.paths[0].match).toBe(100); // clamped
    expect(g.paths[0].nextPacks[0].durationDays).toBe(60); // clamped
    expect(g.roadmaps['Data Analyst'].nextSteps[1].pack).toBeNull();

    const prompt = calls.find((c) => c.schema === 'career_guidance')!.user!;
    expect(prompt).toContain('data analysis');
    for (const secret of ['female', 'OBC', '250000']) expect(prompt).not.toContain(secret);

    // Same evidence → cached, no AI call.
    const again = stub();
    await request(app).post('/v1/career/guidance/refresh').set(bearer(accessToken)).send({});
    expect(again.length).toBe(0);
    expect((await request(app).get('/v1/career/guidance').set(bearer(accessToken))).body).toMatchObject({ status: 'ready', outdated: false });

    // Roadmap for the other path is generated on demand and cached.
    const rm = await request(app).post('/v1/career/roadmap').set(bearer(accessToken)).send({ path: 'Backend Developer' });
    expect(rm.body.roadmap.goal).toBe('Backend Developer');
  });

  it('clear learning history removes progress, study time and guidance but keeps the library', async () => {
    const { accessToken, user } = await signupUser();
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM generated_packs WHERE legacy_course_id = 'python'");
    await sync(accessToken, [
      item('LP_LIBRARY_CHANGED', { packId: rows[0].id, version: 1, state: 'active', updatedAt: new Date().toISOString() }),
      item('LP_STUDY_TIME', { day: '2026-10-02', secondsDelta: 60 }),
    ]);
    expect((await request(app).delete('/v1/learning-packs/history').set(bearer(accessToken))).status).toBe(204);
    const left = await pool.query(
      `SELECT (SELECT count(*) FROM study_days WHERE user_id = $1)::int AS days, (SELECT count(*) FROM pack_library WHERE user_id = $1)::int AS lib`,
      [user.id],
    );
    expect(left.rows[0]).toEqual({ days: 0, lib: 1 });
  });
});
