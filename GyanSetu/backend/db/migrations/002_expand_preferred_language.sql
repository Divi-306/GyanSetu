ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_preferred_language_check;

ALTER TABLE users
  ADD CONSTRAINT users_preferred_language_check
  CHECK (preferred_language IN ('en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu'));