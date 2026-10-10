-- Running unattended (see docs/server.md, "Looking after players").
-- A recovery code per player, given once at sign-up and kept only as a
-- salted hash, to set a new password without anyone's help (null for
-- players from before it, who sign up again if they forget).
ALTER TABLE users ADD COLUMN recovery_hash TEXT;
ALTER TABLE users ADD COLUMN recovery_salt TEXT;

-- Attempts at signing up, logging in, and recovering, by what was tried
-- and from where, counted in windows of time: too many are refused.
CREATE TABLE attempts (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Expired sessions are swept as sessions open.
CREATE INDEX sessions_by_expiry ON sessions (expires_at);
