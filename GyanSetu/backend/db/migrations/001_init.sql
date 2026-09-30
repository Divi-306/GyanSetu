CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────────────────────── Identity ─────────────────────────────
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  email              citext UNIQUE,
  phone              text UNIQUE,                 -- E.164, e.g. +919876543210
  password_hash      text,                        -- null for Google-only accounts
  google_sub         text UNIQUE,
  role               text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi')),
  email_verified_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE student_profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth        date,
  gender               text CHECK (gender IN ('female', 'male', 'other', 'prefer_not')),
  state                text,
  category             text CHECK (category IN ('GEN', 'OBC', 'SC', 'ST', 'EWS')),
  annual_family_income integer CHECK (annual_family_income >= 0),
  education_level      text CHECK (education_level IN ('school', 'diploma', 'undergraduate', 'postgraduate')),
  institution          text,
  current_course       text,
  semester             smallint CHECK (semester BETWEEN 1 AND 12),
  is_pwd               boolean,
  interests            text[] NOT NULL DEFAULT '{}',
  goals                text,
  data_consent_at      timestamptz,               -- consent to use sensitive fields for matching
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE,            -- sha256 of the opaque token
  family_id      uuid NOT NULL,                   -- all rotations of one login share a family
  device_id      text,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  revoked_reason text CHECK (revoked_reason IN ('rotated', 'logout', 'reuse', 'password_reset')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE password_reset_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Content ─────────────────────────────
CREATE TABLE courses (
  id           text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  title        text NOT NULL,
  subtitle     text,
  description  text,
  subject_area text,
  semester     smallint,
  icon         text,                              -- emoji used by the app
  sort_order   integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lessons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  title        text NOT NULL,
  content_type text NOT NULL DEFAULT 'markdown' CHECK (content_type IN ('markdown', 'pdf', 'video')),
  body_md      text,                              -- lesson text (always present, even for pdf/video: summary)
  media_key    text,                              -- path under MEDIA_SOURCE_DIR (or bucket key)
  duration_min smallint,
  is_sample    boolean NOT NULL DEFAULT false,    -- included in the Starter Bundle
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, position)
);

CREATE TABLE quizzes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id  uuid REFERENCES lessons(id) ON DELETE SET NULL,
  title      text NOT NULL,
  is_sample  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, title)
);

CREATE TABLE quiz_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position      integer NOT NULL,
  prompt        text NOT NULL,
  options       jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  correct_index smallint NOT NULL,
  explanation   text,
  UNIQUE (quiz_id, position)
);

CREATE TABLE learning_packs (
  id             uuid PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('course', 'starter')),
  course_id      text REFERENCES courses(id) ON DELETE CASCADE,   -- null for starter
  version        integer NOT NULL,
  variant        text NOT NULL CHECK (variant IN ('full', 'lite')),
  size_bytes     bigint NOT NULL,
  storage_prefix text NOT NULL,                  -- relative dir / bucket prefix
  manifest       jsonb NOT NULL,
  release_notes  text,
  is_published   boolean NOT NULL DEFAULT true,
  published_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (kind, course_id, version, variant),
  CHECK ((kind = 'starter') = (course_id IS NULL))
);

CREATE TABLE ai_knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id    uuid REFERENCES lessons(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  text         text NOT NULL,
  source_label text NOT NULL,                    -- "Python Basics › Lesson 2: Variables"
  search       tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, text)) STORED
);
CREATE INDEX ai_chunks_search_idx ON ai_knowledge_chunks USING gin (search);
CREATE INDEX ai_chunks_course_idx ON ai_knowledge_chunks (course_id);

-- ─────────────────────────── Student data ───────────────────────────
-- Idempotency log: one row per sync item ever received.
CREATE TABLE sync_events (
  id                uuid PRIMARY KEY,             -- client-generated
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id         text NOT NULL,
  type              text NOT NULL,
  client_created_at timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_events_user_idx ON sync_events (user_id, received_at DESC);

CREATE TABLE lesson_completions (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE student_progress (
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id         text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  percent_complete  smallint NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
  last_lesson_id    uuid REFERENCES lessons(id) ON DELETE SET NULL,
  client_updated_at timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE quiz_attempts (
  id           uuid PRIMARY KEY,                  -- client-generated; append-only
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id      uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  answers      jsonb NOT NULL,                    -- [{questionId, selectedIndex}]
  client_score smallint NOT NULL,
  server_score smallint NOT NULL,
  total        smallint NOT NULL,
  started_at   timestamptz,
  submitted_at timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quiz_attempts_user_idx ON quiz_attempts (user_id, received_at);

CREATE TABLE notes (
  id          uuid PRIMARY KEY,                   -- client-generated
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL,               -- client time, used for last-write-wins
  deleted_at  timestamptz,                        -- tombstone
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_user_idx ON notes (user_id, received_at);

CREATE TABLE storage_events (
  id           uuid PRIMARY KEY,                  -- client-generated
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id    text REFERENCES courses(id) ON DELETE SET NULL,
  pack_version integer,
  event_type   text NOT NULL CHECK (event_type IN
                 ('downloaded', 'archived', 'restored', 'cleanup_warned', 'kept', 'deleted')),
  occurred_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────── Scholarships & career ───────────────────────
CREATE TABLE scholarships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  provider          text NOT NULL,
  description       text,
  amount_text       text,                         -- "Up to ₹50,000 / year"
  eligibility_rules jsonb NOT NULL,               -- see §17
  deadline          date,
  apply_url         text NOT NULL,
  source_url        text NOT NULL,
  last_verified_at  timestamptz NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE career_paths (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  description     text NOT NULL,
  course_sequence text[] NOT NULL,                -- ordered course ids
  skills          text[] NOT NULL DEFAULT '{}',
  interest_tags   text[] NOT NULL DEFAULT '{}',
  outcomes        text
);

-- ─────────────────────────── AI audit log ───────────────────────────
CREATE TABLE ai_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  course_id     text,
  question      text NOT NULL,
  answer        text,
  confidence    text,
  grounded      boolean,
  sources       jsonb NOT NULL DEFAULT '[]',
  model         text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
