-- ───────────────────── Dynamic (AI-generated) learning packs ─────────────────────
-- Subject-agnostic: a pack is generated from whatever the student types. Packs are
-- shared: a second student asking for the same subject at the same level reuses it.

CREATE TABLE generated_packs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_key      text NOT NULL,                 -- normalised request, e.g. 'computer networks'
  title            text NOT NULL,
  subject          text NOT NULL,
  description      text NOT NULL DEFAULT '',
  category         text NOT NULL,                 -- programming / mathematics / science / theory / ...
  level            text NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  icon             text NOT NULL DEFAULT '📘',
  language         text NOT NULL DEFAULT 'en',
  source           text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'course')),
  legacy_course_id text REFERENCES courses(id) ON DELETE SET NULL,   -- set for converted curated courses
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  is_public        boolean NOT NULL DEFAULT true,  -- false when the request carried a personal goal
  latest_ready_version integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generated_packs_subject_idx ON generated_packs (subject_key, level);
CREATE UNIQUE INDEX generated_packs_legacy_idx ON generated_packs (legacy_course_id) WHERE legacy_course_id IS NOT NULL;

CREATE TABLE generated_pack_versions (
  pack_id       uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  version       integer NOT NULL CHECK (version >= 1),
  status        text NOT NULL CHECK (status IN ('generating', 'ready', 'failed')),
  outline       jsonb NOT NULL,                   -- modules + topic titles, shown before content is ready
  modules_total smallint NOT NULL,
  modules_done  smallint NOT NULL DEFAULT 0,
  content_text  text,                             -- the assembled pack JSON, byte-exact (sha256 is over this)
  sha256        text,
  size_bytes    integer,
  topic_count   integer,
  model         text,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  change_notes  text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  ready_at      timestamptz,
  PRIMARY KEY (pack_id, version),
  CHECK ((status = 'ready') = (content_text IS NOT NULL))
);
CREATE INDEX generated_pack_versions_status_idx ON generated_pack_versions (status) WHERE status = 'generating';

-- One row per module per version, so a failed generation resumes where it stopped.
CREATE TABLE generated_pack_modules (
  pack_id    uuid NOT NULL,
  version    integer NOT NULL,
  module_key text NOT NULL,
  position   smallint NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  content    jsonb,
  attempts   smallint NOT NULL DEFAULT 0,
  error      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, version, module_key),
  FOREIGN KEY (pack_id, version) REFERENCES generated_pack_versions(pack_id, version) ON DELETE CASCADE
);

-- ─────────────────────────── Student data (via /v1/sync) ───────────────────────────

-- The student's library: which packs they keep. Last write wins on client time.
CREATE TABLE pack_library (
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id           uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  version           integer NOT NULL,
  state             text NOT NULL CHECK (state IN ('active', 'deleted')),
  client_updated_at timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);

CREATE TABLE pack_progress (
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id           uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  percent           smallint NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  current_topic_id  text,
  client_updated_at timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);

-- Topic ids are stable across pack versions (see generator), so progress survives updates.
CREATE TABLE pack_topic_progress (
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id             uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  topic_id            text NOT NULL,
  completed_at        timestamptz,                -- earliest completion wins; never un-completes
  bookmarked          boolean NOT NULL DEFAULT false,
  bookmark_updated_at timestamptz,                -- last write wins for the bookmark
  time_spent_sec      integer NOT NULL DEFAULT 0, -- sum of deltas; sync_events makes each delta count once
  received_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id, topic_id)
);

-- Append-only answer log: quiz, viva, practice and flashcard results. Mastery and weak topics derive from it.
CREATE TABLE pack_answers (
  id           uuid PRIMARY KEY,                  -- client-generated
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id      uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  pack_version integer NOT NULL,
  topic_id     text NOT NULL,
  item_id      text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('mcq', 'viva', 'practice', 'flashcard')),
  correct      boolean NOT NULL,
  score        real NOT NULL CHECK (score BETWEEN 0 AND 1),
  answered_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pack_answers_user_idx ON pack_answers (user_id, received_at);
CREATE INDEX pack_answers_topic_idx ON pack_answers (user_id, pack_id, topic_id);
