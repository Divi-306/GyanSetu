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

  if (version < 2) {
    await db.execAsync(`
      -- ── Dynamic learning packs (AI-generated, any subject) ──
      -- The verified pack JSON lives in the file system (file_uri); these tables are
      -- its queryable copy. offline = 1 once the student chose "Download"; packs
      -- opened without downloading are cached with offline = 0 and are hidden offline.
      CREATE TABLE IF NOT EXISTS lp_packs (
        pack_id           TEXT PRIMARY KEY NOT NULL,
        version           INTEGER NOT NULL,
        title             TEXT NOT NULL,
        subject           TEXT NOT NULL,
        description       TEXT NOT NULL DEFAULT '',
        category          TEXT NOT NULL,
        level_from        TEXT NOT NULL,
        level_to          TEXT NOT NULL,
        icon              TEXT NOT NULL,
        module_count      INTEGER NOT NULL,
        topic_count       INTEGER NOT NULL,
        estimated_minutes INTEGER NOT NULL DEFAULT 0,
        size_bytes        INTEGER NOT NULL,
        sha256            TEXT NOT NULL,
        file_uri          TEXT NOT NULL,
        offline           INTEGER NOT NULL DEFAULT 0,
        state             TEXT NOT NULL CHECK (state IN ('ACTIVE', 'FAILED')),
        latest_version    INTEGER,          -- newest ready version the server reported
        downloaded_at     TEXT NOT NULL,
        last_opened_at    TEXT
      );

      CREATE TABLE IF NOT EXISTS lp_modules (
        pack_id        TEXT NOT NULL,
        id             TEXT NOT NULL,
        position       INTEGER NOT NULL,
        title          TEXT NOT NULL,
        description    TEXT NOT NULL,
        summary        TEXT NOT NULL,
        revision_notes TEXT NOT NULL,
        PRIMARY KEY (pack_id, id)
      );

      -- content_json: the topic without its question bank (that is in lp_items).
      CREATE TABLE IF NOT EXISTS lp_topics (
        pack_id      TEXT NOT NULL,
        id           TEXT NOT NULL,
        module_id    TEXT NOT NULL,
        position     INTEGER NOT NULL,   -- order within the whole pack
        title        TEXT NOT NULL,
        difficulty   TEXT NOT NULL,
        content_json TEXT NOT NULL,
        PRIMARY KEY (pack_id, id)
      );
      CREATE INDEX IF NOT EXISTS lp_topics_order_idx ON lp_topics (pack_id, position);

      -- Question bank: MCQs, viva, practice, flashcards. source 'online' = extra questions
      -- fetched later from the server; they survive pack updates.
      CREATE TABLE IF NOT EXISTS lp_items (
        pack_id      TEXT NOT NULL,
        id           TEXT NOT NULL,
        topic_id     TEXT NOT NULL,
        kind         TEXT NOT NULL CHECK (kind IN ('mcq', 'viva', 'practice', 'flashcard')),
        payload_json TEXT NOT NULL,
        source       TEXT NOT NULL DEFAULT 'pack',
        PRIMARY KEY (pack_id, id)
      );
      CREATE INDEX IF NOT EXISTS lp_items_topic_idx ON lp_items (pack_id, topic_id, kind);

      -- Retrieval units for the offline tutor (paragraphs, key points, examples, glossary).
      CREATE TABLE IF NOT EXISTS lp_chunks (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        pack_id  TEXT NOT NULL,
        topic_id TEXT,                     -- null for glossary / module-level text
        field    TEXT NOT NULL,
        label    TEXT NOT NULL,
        text     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lp_chunks_pack_idx ON lp_chunks (pack_id);

      -- ── Student data for packs (written locally first, synced via sync_queue) ──
      -- The account's library, as last pulled/pushed (restores "My Learning Packs" on a new phone).
      CREATE TABLE IF NOT EXISTS lp_library (
        pack_id        TEXT PRIMARY KEY NOT NULL,
        version        INTEGER NOT NULL,
        state          TEXT NOT NULL CHECK (state IN ('active', 'deleted')),
        title          TEXT NOT NULL,
        icon           TEXT NOT NULL,
        level          TEXT,
        latest_version INTEGER,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lp_progress (
        pack_id          TEXT PRIMARY KEY NOT NULL,
        percent          INTEGER NOT NULL DEFAULT 0,
        current_topic_id TEXT,
        updated_at       TEXT NOT NULL
      );

      -- Rows are kept when a topic disappears in a newer pack version; they come back if it returns.
      CREATE TABLE IF NOT EXISTS lp_topic_progress (
        pack_id             TEXT NOT NULL,
        topic_id            TEXT NOT NULL,
        completed_at        TEXT,
        bookmarked          INTEGER NOT NULL DEFAULT 0,
        bookmark_updated_at TEXT,
        time_spent_sec      INTEGER NOT NULL DEFAULT 0,
        last_seen_at        TEXT,
        PRIMARY KEY (pack_id, topic_id)
      );

      CREATE TABLE IF NOT EXISTS lp_answers (
        id           TEXT PRIMARY KEY NOT NULL,
        pack_id      TEXT NOT NULL,
        pack_version INTEGER NOT NULL,
        topic_id     TEXT NOT NULL,
        item_id      TEXT NOT NULL,
        kind         TEXT NOT NULL,
        correct      INTEGER NOT NULL,
        score        REAL NOT NULL,
        response     TEXT,
        answered_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lp_answers_topic_idx ON lp_answers (pack_id, topic_id, answered_at);

      -- Tutor conversation, per pack. Synced to the student's other devices (LP_CHAT_MESSAGE / LP_CHAT_CLEARED).
      CREATE TABLE IF NOT EXISTS lp_chat (
        id         TEXT PRIMARY KEY NOT NULL,
        pack_id    TEXT NOT NULL,
        role       TEXT NOT NULL CHECK (role IN ('user', 'tutor')),
        text       TEXT NOT NULL,
        meta_json  TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lp_chat_pack_idx ON lp_chat (pack_id, created_at);
    `);
    version = 2;
  }

  if (version < 3) {
    await db.execAsync(`
      -- ── Learning OS: day plans, videos, storage optimisation, study time ──
      ALTER TABLE lp_packs ADD COLUMN duration_days INTEGER;
      ALTER TABLE lp_packs ADD COLUMN daily_minutes INTEGER;
      ALTER TABLE lp_packs ADD COLUMN goal TEXT;
      ALTER TABLE lp_packs ADD COLUMN depth TEXT;
      ALTER TABLE lp_packs ADD COLUMN plan_json TEXT;          -- coverage, outcomes, not covered, career paths
      ALTER TABLE lp_packs ADD COLUMN optimized_at TEXT;       -- set while optional data is compressed/offloaded
      ALTER TABLE lp_packs ADD COLUMN bytes_saved INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE lp_topics ADD COLUMN kind TEXT NOT NULL DEFAULT 'lesson';
      ALTER TABLE lp_topics ADD COLUMN day_number INTEGER;

      CREATE TABLE IF NOT EXISTS lp_days (
        pack_id             TEXT NOT NULL,
        day_number          INTEGER NOT NULL,
        title               TEXT NOT NULL,
        focus               TEXT NOT NULL,
        topic_ids_json      TEXT NOT NULL,
        estimated_minutes   INTEGER NOT NULL,
        completion_criteria TEXT NOT NULL,
        PRIMARY KEY (pack_id, day_number)
      );

      -- Videos: pack videos (from provider APIs) and the student's own imports (source 'user',
      -- never uploaded). status: remote (not on the phone) | downloaded | offloaded (removed to
      -- save space, re-downloadable). wanted_offline remembers the student chose to keep it.
      CREATE TABLE IF NOT EXISTS lp_videos (
        pack_id        TEXT NOT NULL,
        id             TEXT NOT NULL,
        topic_id       TEXT NOT NULL,
        title          TEXT NOT NULL,
        description    TEXT NOT NULL DEFAULT '',
        duration_sec   REAL,
        source         TEXT NOT NULL,
        url            TEXT NOT NULL,
        download_url   TEXT,
        thumbnail      TEXT,
        license        TEXT NOT NULL DEFAULT '',
        attribution    TEXT NOT NULL DEFAULT '',
        downloadable   INTEGER NOT NULL DEFAULT 0,
        size_bytes     INTEGER,
        local_uri      TEXT,
        status         TEXT NOT NULL DEFAULT 'remote' CHECK (status IN ('remote', 'downloaded', 'offloaded')),
        wanted_offline INTEGER NOT NULL DEFAULT 0,
        added_at       TEXT NOT NULL,
        PRIMARY KEY (pack_id, id)
      );
      CREATE INDEX IF NOT EXISTS lp_videos_topic_idx ON lp_videos (pack_id, topic_id);

      CREATE TABLE IF NOT EXISTS lp_video_progress (
        pack_id      TEXT NOT NULL,
        video_id     TEXT NOT NULL,
        position_sec REAL NOT NULL DEFAULT 0,
        duration_sec REAL,
        completed_at TEXT,
        updated_at   TEXT NOT NULL,
        PRIMARY KEY (pack_id, video_id)
      );

      -- Study time per local calendar day: streaks, weekly activity, reminders.
      CREATE TABLE IF NOT EXISTS study_days (
        day        TEXT PRIMARY KEY NOT NULL,   -- YYYY-MM-DD, device local time
        seconds    INTEGER NOT NULL DEFAULT 0
      );
    `);
    version = 3;
  }

  if (version < 4) {
    await db.execAsync(`
      -- Pack-native quizzes. A quiz is generated on demand (online) and only persists
      -- here once the student taps "Save to Learning Pack"; offline-built quizzes
      -- (sampled from lp_items) are saved the same way with source 'offline'.
      CREATE TABLE IF NOT EXISTS lp_quizzes (
        pack_id       TEXT NOT NULL,
        id            TEXT NOT NULL,
        subject       TEXT NOT NULL,
        difficulty    TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
        topic_ids_json TEXT NOT NULL,
        source        TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'offline')),
        pack_version  INTEGER NOT NULL,
        created_at    TEXT NOT NULL,
        PRIMARY KEY (pack_id, id)
      );

      CREATE TABLE IF NOT EXISTS lp_quiz_questions (
        pack_id       TEXT NOT NULL,
        quiz_id       TEXT NOT NULL,
        id            TEXT NOT NULL,
        position      INTEGER NOT NULL,
        topic_id      TEXT NOT NULL,
        question      TEXT NOT NULL,
        options_json  TEXT NOT NULL,
        correct_index INTEGER NOT NULL,
        explanation   TEXT NOT NULL DEFAULT '',
        difficulty    TEXT NOT NULL,
        PRIMARY KEY (pack_id, quiz_id, id)
      );
      CREATE INDEX IF NOT EXISTS lp_quiz_questions_quiz_idx ON lp_quiz_questions (pack_id, quiz_id);

      -- Append-only: one row per attempt. Score/weak topics are read back, never recomputed in place.
      CREATE TABLE IF NOT EXISTS lp_quiz_attempts (
        pack_id          TEXT NOT NULL,
        quiz_id          TEXT NOT NULL,
        id               TEXT NOT NULL,
        answers_json     TEXT NOT NULL,
        score            INTEGER NOT NULL,
        total            INTEGER NOT NULL,
        correct_count    INTEGER NOT NULL,
        wrong_count      INTEGER NOT NULL,
        weak_topics_json TEXT NOT NULL DEFAULT '[]',
        time_taken_sec   INTEGER NOT NULL DEFAULT 0,
        started_at       TEXT,
        submitted_at     TEXT NOT NULL,
        PRIMARY KEY (pack_id, quiz_id, id)
      );
      CREATE INDEX IF NOT EXISTS lp_quiz_attempts_pack_idx ON lp_quiz_attempts (pack_id, submitted_at);
    `);
    version = 4;
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
