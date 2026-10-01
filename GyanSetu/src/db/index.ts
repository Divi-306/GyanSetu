import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('gyansetu.db');

/**
 * Local schema. Content rows use the server's UUIDs so progress recorded
 * offline syncs to the right lesson/quiz. Bump user_version for each change.
 */
export async function migrate() {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      -- Pre-backend demo table, keyed by course name. Its data can't be mapped to real lessons.
      DROP TABLE IF EXISTS progress;

      CREATE TABLE IF NOT EXISTS kv (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      -- Catalog cache (GET /v1/courses) plus starter-only courses from packs.
      CREATE TABLE IF NOT EXISTS courses (
        id              TEXT PRIMARY KEY NOT NULL,
        title           TEXT NOT NULL,
        subtitle        TEXT,
        description     TEXT,
        icon            TEXT,
        lesson_count    INTEGER,
        pack_version    INTEGER,
        full_size_bytes INTEGER,
        lite_size_bytes INTEGER,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        in_catalog      INTEGER NOT NULL DEFAULT 0
      );

      -- One row per downloaded pack. pack_key is the course id, or 'starter'.
      CREATE TABLE IF NOT EXISTS learning_packs (
        pack_key      TEXT PRIMARY KEY NOT NULL,
        pack_id       TEXT NOT NULL,
        version       INTEGER NOT NULL,
        variant       TEXT NOT NULL,
        size_bytes    INTEGER NOT NULL,
        state         TEXT NOT NULL CHECK (state IN ('DOWNLOADING', 'ACTIVE', 'FAILED')),
        dir_uri       TEXT,
        downloaded_at TEXT
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id            TEXT PRIMARY KEY NOT NULL,
        course_id     TEXT NOT NULL,
        position      INTEGER NOT NULL,
        title         TEXT NOT NULL,
        content_type  TEXT NOT NULL,
        body_md       TEXT NOT NULL,
        duration_min  INTEGER,
        media_uri     TEXT,
        media_omitted INTEGER NOT NULL DEFAULT 0,
        from_full_pack INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS lessons_course_idx ON lessons (course_id, position);

      CREATE TABLE IF NOT EXISTS quizzes (
        id        TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL,
        lesson_id TEXT,
        title     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quiz_questions (
        id            TEXT PRIMARY KEY NOT NULL,
        quiz_id       TEXT NOT NULL,
        position      INTEGER NOT NULL,
        prompt        TEXT NOT NULL,
        options_json  TEXT NOT NULL,
        correct_index INTEGER NOT NULL,
        explanation   TEXT
      );
      CREATE INDEX IF NOT EXISTS quiz_questions_quiz_idx ON quiz_questions (quiz_id, position);

      CREATE TABLE IF NOT EXISTS ai_chunks (
        id           TEXT PRIMARY KEY NOT NULL,
        course_id    TEXT NOT NULL,
        lesson_id    TEXT,
        text         TEXT NOT NULL,
        source_label TEXT NOT NULL
      );

      -- ── Student data (mirrors the server; written locally first) ──
      CREATE TABLE IF NOT EXISTS lesson_completions (
        lesson_id    TEXT PRIMARY KEY NOT NULL,
        completed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS course_progress (
        course_id      TEXT PRIMARY KEY NOT NULL,
        percent        INTEGER NOT NULL DEFAULT 0,
        last_lesson_id TEXT,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id           TEXT PRIMARY KEY NOT NULL,
        quiz_id      TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        score        INTEGER NOT NULL,
        total        INTEGER NOT NULL,
        started_at   TEXT,
        submitted_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id         TEXT PRIMARY KEY NOT NULL,
        lesson_id  TEXT NOT NULL,
        text       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      -- Outbox for POST /v1/sync/batch. Rows are written in the same transaction as the change.
      CREATE TABLE IF NOT EXISTS sync_queue (
        id              TEXT PRIMARY KEY NOT NULL,
        type            TEXT NOT NULL,
        payload_json    TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
        retry_count     INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error      TEXT
      );
      CREATE INDEX IF NOT EXISTS sync_queue_pending_idx ON sync_queue (status, next_attempt_at, created_at);
    `);
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(key: string, value: unknown) {
  await db.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

export async function kvDelete(key: string) {
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}
