import { pool, queryOne, withTransaction } from '../src/db/pool';
import { normalizeSubject, publishVersion, type ModuleContent } from '../src/modules/learningPacks/generator';
import { CATEGORIES, slugify, type Outline } from '../src/modules/learningPacks/pack.schema';

// Usage:  npm run convert-courses               (converts courses that have no pack yet)
//         npm run convert-courses -- --rebuild  (publishes a new pack version for every course)
//
// Turns each curated course (lessons + quizzes in Postgres) into a dynamic learning
// pack, without any AI call: lesson → topic, quiz questions → MCQs. The old course
// screens keep working; the converted packs show up in Explore / My Learning Packs.

const LESSONS_PER_MODULE = 5;

const CATEGORY_BY_AREA: Record<string, (typeof CATEGORIES)[number]> = {
  programming: 'programming',
  databases: 'engineering',
  networking: 'engineering',
  systems: 'engineering',
};

/** First real paragraph of a lesson, used for summaries. */
function firstParagraph(md: string): string {
  return (
    md
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !p.startsWith('```') && !/^[-*\d]/.test(p)) ?? ''
  );
}

/** Lesson markdown without its leading "# Title" (the topic already has a title). */
const lessonBody = (md: string | null) => (md ?? '').trim().replace(/^#\s+.*(\n|$)/, '').trim();

function bullets(md: string, max = 6): string[] {
  return (md.match(/^\s*[-*]\s+(.+)$/gm) ?? []).map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).slice(0, max);
}

/** Fenced code blocks become examples, so the tutor can answer "give me an example". */
function codeExamples(md: string, title: string) {
  return [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)].slice(0, 3).map((m, i) => ({
    title: `${title} — example ${i + 1}`,
    body: '',
    code: m[2].trimEnd(),
    language: m[1] || '',
    steps: [] as string[],
  }));
}

async function convertCourse(courseId: string, rebuild: boolean) {
  const course = await queryOne<{ id: string; title: string; description: string | null; subject_area: string | null; icon: string | null }>(
    'SELECT id, title, description, subject_area, icon FROM courses WHERE id = $1',
    [courseId],
  );
  if (!course) return;
  const existing = await queryOne<{ id: string; latest_ready_version: number | null }>(
    'SELECT id, latest_ready_version FROM generated_packs WHERE legacy_course_id = $1',
    [courseId],
  );
  if (existing?.latest_ready_version && !rebuild) {
    console.log(`• ${courseId} already converted (v${existing.latest_ready_version})`);
    return;
  }

  const { rows: lessons } = await pool.query<{ id: string; position: number; title: string; body_md: string | null; duration_min: number | null }>(
    'SELECT id, position, title, body_md, duration_min FROM lessons WHERE course_id = $1 ORDER BY position',
    [courseId],
  );
  if (lessons.length === 0) return;
  const { rows: questions } = await pool.query<{ lesson_id: string | null; prompt: string; options: string[]; correct_index: number; explanation: string | null }>(
    `SELECT q.lesson_id, qq.prompt, qq.options, qq.correct_index, qq.explanation
       FROM quizzes q JOIN quiz_questions qq ON qq.quiz_id = q.id
      WHERE q.course_id = $1 ORDER BY q.title, qq.position`,
    [courseId],
  );

  const taken = new Set<string>();
  const topicKey = (title: string) => {
    let key = slugify(title);
    for (let n = 2; taken.has(key); n++) key = `${slugify(title)}-${n}`;
    taken.add(key);
    return key;
  };
  const lessonTopics = lessons.map((l) => ({ lesson: l, key: topicKey(l.title) }));
  const lastLessonId = lessons[lessons.length - 1].id;

  const groups: (typeof lessonTopics)[] = [];
  for (let i = 0; i < lessonTopics.length; i += LESSONS_PER_MODULE) groups.push(lessonTopics.slice(i, i + LESSONS_PER_MODULE));

  const outline: Outline = {
    title: course.title,
    subject: course.title,
    category: CATEGORY_BY_AREA[(course.subject_area ?? '').toLowerCase()] ?? 'theory',
    icon: course.icon ?? '📘',
    description: course.description ?? '',
    level: 'beginner',
    levelRange: { from: 'beginner', to: 'beginner' },
    estimatedHours: Math.max(1, Math.round(lessons.reduce((s, l) => s + (l.duration_min ?? 15), 0) / 60)),
    prerequisites: [],
    learningObjectives: [],
    tags: [course.subject_area ?? ''].filter(Boolean),
    modules: groups.map((g, i) => ({
      key: groups.length === 1 ? slugify(course.title) : `${slugify(course.title)}-part-${i + 1}`,
      title: groups.length === 1 ? course.title : `${course.title} — Part ${i + 1}`,
      description: g.map((t) => t.lesson.title).join(', '),
      topics: g.map((t) => ({ key: t.key, title: t.lesson.title, summary: '', difficulty: 'beginner' as const })),
    })),
  };

  const modules = new Map<string, ModuleContent>(
    outline.modules.map((m, i) => [
      m.key,
      {
        summary: m.description,
        revisionNotes: groups[i]
          .map(({ lesson }) => {
            const md = lessonBody(lesson.body_md);
            const points = bullets(md);
            return `## ${lesson.title}\n${points.length ? points.map((b) => `- ${b}`).join('\n') : firstParagraph(md)}`;
          })
          .join('\n\n'),
        objectives: [],
        glossary: [],
        topics: groups[i].map(({ lesson, key }) => {
          const md = lessonBody(lesson.body_md);
          const intro = firstParagraph(md);
          // Course-wide quizzes (no lesson) attach to the last lesson.
          const mcqs = questions
            .filter((q) => q.lesson_id === lesson.id || (!q.lesson_id && lesson.id === lastLessonId))
            .map((q) => ({
              question: q.prompt, options: q.options, correctIndex: q.correct_index, explanation: q.explanation ?? '', difficulty: 'beginner',
            }));
          return {
            key,
            title: lesson.title,
            difficulty: 'beginner' as const,
            estimatedMinutes: lesson.duration_min ?? 15,
            objectives: [],
            explanation: md || lesson.title,
            simpleExplanation: intro,
            analogy: '',
            keyPoints: bullets(md),
            examples: codeExamples(md, lesson.title),
            formulas: [],
            commonMistakes: [],
            mcqs,
            viva: [],
            practice: [],
            flashcards: [],
            summary: intro,
            keywords: [...new Set(lesson.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2))],
          };
        }),
      },
    ]),
  );

  const { packId, version } = await withTransaction(async (db) => {
    let id = existing?.id;
    if (!id) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO generated_packs (subject_key, title, subject, description, category, level, icon, source, legacy_course_id)
         VALUES ($1, $2, $3, $4, $5, 'beginner', $6, 'course', $7) RETURNING id`,
        [normalizeSubject(course.title), course.title, course.title, outline.description, outline.category, outline.icon, courseId],
      );
      id = rows[0].id;
    }
    const { rows } = await db.query<{ next: number }>(
      'SELECT coalesce(max(version), 0) + 1 AS next FROM generated_pack_versions WHERE pack_id = $1',
      [id],
    );
    await db.query(
      `INSERT INTO generated_pack_versions (pack_id, version, status, outline, modules_total, modules_done, model, change_notes)
       VALUES ($1, $2, 'generating', $3, $4, $4, NULL, 'Converted from the curated course')`,
      [id, rows[0].next, JSON.stringify(outline), outline.modules.length],
    );
    return { packId: id, version: rows[0].next };
  });

  // publishVersion validates questions the same way as AI output.
  const content = await publishVersion(packId, version, outline, modules, 'course');
  console.log(`✔ ${courseId} → pack ${packId} v${version} (${content.metadata.topicCount} topics)`);
}

async function main() {
  const rebuild = process.argv.includes('--rebuild');
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM courses WHERE is_published ORDER BY sort_order');
  for (const { id } of rows) await convertCourse(id, rebuild);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
