-- ───────────── Duration-based, goal-aware packs ─────────────
-- The day plan itself lives in the pack content (it is versioned with it);
-- these columns are for listing and for reusing a matching pack.
ALTER TABLE generated_packs
  ADD COLUMN duration_days smallint CHECK (duration_days BETWEEN 1 AND 180),
  ADD COLUMN daily_minutes smallint CHECK (daily_minutes BETWEEN 10 AND 480),
  ADD COLUMN goal text,
  ADD COLUMN depth text CHECK (depth IN ('foundation', 'intermediate', 'advanced', 'professional'));
CREATE INDEX generated_packs_reuse_idx ON generated_packs (subject_key, level, duration_days, daily_minutes) WHERE is_public;

-- ───────────── Student data (via /v1/sync) ─────────────
-- Resume position per video. Videos are identified by the id inside the pack content.
CREATE TABLE pack_video_progress (
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id           uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  video_id          text NOT NULL,
  position_sec      real NOT NULL DEFAULT 0,
  duration_sec      real,
  completed_at      timestamptz,              -- earliest wins
  client_updated_at timestamptz NOT NULL,     -- position: last write wins
  received_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id, video_id)
);

-- Study time per calendar day (the student's local date), for streaks and weekly activity.
CREATE TABLE study_days (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  seconds     integer NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

-- Latest AI career guidance per student. Regenerated only when the learning evidence changes.
CREATE TABLE career_guidance (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  evidence_hash text NOT NULL,
  guidance      jsonb NOT NULL,
  model         text,
  generated_at  timestamptz NOT NULL DEFAULT now()
);
