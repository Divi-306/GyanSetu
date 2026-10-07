-- ───────────── Pack-native quizzes ─────────────
-- A quiz is generated on demand (any subject/topics/difficulty/count already in the
-- pack's own content) and only persists if the student taps "Save to Learning Pack" —
-- that save and every attempt sync through /v1/sync like the rest of pack data, so a
-- saved quiz (and its attempts) is available offline on any device.

CREATE TABLE pack_quizzes (
  id            uuid PRIMARY KEY,                   -- client-generated
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id       uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  pack_version  integer NOT NULL,
  subject       text NOT NULL,
  difficulty    text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topic_ids     jsonb NOT NULL DEFAULT '[]',         -- [] means "all topics"
  questions     jsonb NOT NULL,                      -- [{id, topicId, question, options, correctIndex, explanation, difficulty}]
  source        text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'offline')),
  created_at    timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pack_quizzes_user_pack_idx ON pack_quizzes (user_id, pack_id, created_at);

-- Append-only, like pack_answers: one row per attempt, score/weak-topics derive from it.
CREATE TABLE pack_quiz_attempts (
  id               uuid PRIMARY KEY,                 -- client-generated
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id          uuid NOT NULL REFERENCES pack_quizzes(id) ON DELETE CASCADE,
  pack_id          uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  answers          jsonb NOT NULL,                    -- [{questionId, selectedIndex}]
  score            smallint NOT NULL,
  total            smallint NOT NULL,
  correct_count    smallint NOT NULL,
  wrong_count      smallint NOT NULL,
  weak_topic_ids   jsonb NOT NULL DEFAULT '[]',
  time_taken_sec   integer NOT NULL DEFAULT 0,
  started_at       timestamptz,
  submitted_at     timestamptz NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pack_quiz_attempts_user_pack_idx ON pack_quiz_attempts (user_id, pack_id, submitted_at);
