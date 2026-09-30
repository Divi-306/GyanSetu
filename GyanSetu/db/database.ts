import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('gyansetu.db');


export function initializeDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_name TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(course_name, lesson_id)
    );
  `);
}


// ─────────────────────────────────────────────
// MARK LESSON AS COMPLETED
// ─────────────────────────────────────────────

export function markLessonCompleted(
  courseName: string,
  lessonId: string
) {
  const updatedAt = new Date().toISOString();

  db.runSync(
    `
      INSERT INTO progress (
        course_name,
        lesson_id,
        completed,
        updated_at
      )
      VALUES (?, ?, 1, ?)

      ON CONFLICT(course_name, lesson_id)
      DO UPDATE SET
        completed = 1,
        updated_at = excluded.updated_at;
    `,
    [courseName, lessonId, updatedAt]
  );
}


// ─────────────────────────────────────────────
// GET SINGLE LESSON PROGRESS
// ─────────────────────────────────────────────

export function getLessonProgress(
  courseName: string,
  lessonId: string
) {
  return db.getFirstSync<{
    completed: number;
  }>(
    `
      SELECT completed
      FROM progress
      WHERE course_name = ?
      AND lesson_id = ?
    `,
    [courseName, lessonId]
  );
}


// ─────────────────────────────────────────────
// GET COURSE OVERALL PROGRESS
// ─────────────────────────────────────────────

export function getCourseProgress(
  courseName: string
) {
  const result = db.getFirstSync<{
    completed: number;
  }>(
    `
      SELECT COUNT(*) as completed
      FROM progress
      WHERE course_name = ?
      AND completed = 1
    `,
    [courseName]
  );

  const completed = result?.completed ?? 0;

  // Current demo course has 5 lessons
  const totalLessons = 5;

  const percentage = Math.round(
    (completed / totalLessons) * 100
  );

  return {
    completed,
    total: totalLessons,
    percentage,
  };
}