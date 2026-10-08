-- ───────────── Background tasks ─────────────
-- A generic record of long-running, non-interactive work so the app can show progress
-- and let a student keep using the AI tutor/navigator while it runs, instead of an HTTP
-- request blocking until the work finishes. Runs in-process (no separate worker/queue
-- infra — this is a single Node process); this table is the durable source of truth for
-- status/progress, so it survives a server restart and multiple tabs/devices see the
-- same state (unlike an in-memory-only tracker).
--
-- Learning pack generation already had its own non-blocking flow (generated_pack_versions
-- tracks modules_done/modules_total); this table doesn't replace that, it adds a task row
-- alongside it so pack generation shows up in the same "my background work" list as other
-- job types (career guidance refresh, etc).

CREATE TABLE tasks (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           text NOT NULL,                      -- e.g. 'LEARNING_PACK_GENERATION', 'CAREER_GUIDANCE'
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload        jsonb NOT NULL DEFAULT '{}',         -- inputs needed to (re)run the job
  progress_done  integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 1,
  progress_label text,                                -- e.g. "Generating lessons"
  result         jsonb,                               -- small pointer to the outcome (ids), not the full content
  error          text,
  retry_count    integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  completed_at   timestamptz
);
CREATE INDEX tasks_user_idx ON tasks (user_id, created_at DESC);
CREATE INDEX tasks_active_idx ON tasks (status) WHERE status IN ('queued', 'running');
