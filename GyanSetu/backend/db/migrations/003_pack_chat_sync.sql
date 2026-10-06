-- Tutor chat history per learning pack, synced across the student's devices.
CREATE TABLE pack_chat_messages (
  id          uuid PRIMARY KEY,                  -- client-generated
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id     uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'tutor')),
  text        text NOT NULL,
  meta        jsonb,                             -- mode, quick replies, sources, grounded
  created_at  timestamptz NOT NULL,              -- client time; orders the conversation
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pack_chat_user_idx ON pack_chat_messages (user_id, received_at);
CREATE INDEX pack_chat_pack_idx ON pack_chat_messages (user_id, pack_id, created_at);

-- "New conversation": everything up to cleared_at is gone, on every device. Latest clear wins.
CREATE TABLE pack_chat_clears (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id     uuid NOT NULL REFERENCES generated_packs(id) ON DELETE CASCADE,
  cleared_at  timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_id)
);
