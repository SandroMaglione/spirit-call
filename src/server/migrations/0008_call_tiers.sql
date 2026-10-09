-- The Spirit Call in three tiers (2026-10, see docs/calls.md): a character,
-- a rare thing (an aspect or a look), or sigils, the Call's own token for
-- its exchange (a currency, so a row of `balances`: no column needed).
-- Relics and supplies no longer come from calls, so the history forgets
-- the calls that brought them (what they gave stays owned and in the
-- wallet), and the one count since the last rare thing takes over from the
-- counts since the last aspect and since the last relic. The calls' table
-- is rebuilt for the kinds there are now, keeping the calls that remain.
ALTER TABLE accounts RENAME COLUMN calls_since_aspect TO calls_since_rare;
ALTER TABLE accounts DROP COLUMN calls_since_relic;

DELETE FROM call_amounts WHERE (user_id, place) IN (SELECT user_id, place FROM calls WHERE kind IN ('relic', 'supply'));
DELETE FROM calls WHERE kind IN ('relic', 'supply');

CREATE TABLE calls_new (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  at INTEGER NOT NULL,
  banner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('character', 'aspect', 'cosmetic', 'sigils')),
  item TEXT,
  PRIMARY KEY (user_id, place)
);
INSERT INTO calls_new (user_id, place, at, banner, kind, item) SELECT user_id, place, at, banner, kind, item FROM calls;
DROP TABLE calls;
ALTER TABLE calls_new RENAME TO calls;
