-- Relics, looks, and dust (2026-10): relics owned at a tier and equipped
-- per team member and slot, looks owned and worn per character, the Spirit
-- Call's new results (a relic at the tier it reached, with the dust a
-- duplicate past its last tier turned into, in `call_amounts`; a look), and
-- its count since the last relic. Aspects lost their passives at the same
-- time. A one-time reset of every account comes with it (the game is in
-- active development): players keep their logins and sessions, and each
-- account starts over as a new one the next time it is read (see
-- `Accounts`). Run logs and events are kept.

DELETE FROM call_amounts;
DELETE FROM calls;
DELETE FROM call_focus;
DELETE FROM chests;
DELETE FROM discoveries;
DELETE FROM tiers;
DELETE FROM quest_stars;
DELETE FROM quests;
DELETE FROM team_members;
DELETE FROM aspects;
DELETE FROM characters;
DELETE FROM balances;
DELETE FROM accounts;

ALTER TABLE accounts ADD COLUMN calls_since_relic INTEGER NOT NULL DEFAULT 0;

-- The last calls, newest first (`place` 0), and what each brought: a
-- character, an aspect, a look, or a relic (`item`, and the relic's `tier`),
-- or a supply bundle (`call_amounts`, which also holds a relic's dust).
DROP TABLE calls;
CREATE TABLE calls (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  at INTEGER NOT NULL,
  banner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('character', 'aspect', 'cosmetic', 'relic', 'supply')),
  item TEXT,
  tier INTEGER CHECK (tier BETWEEN 1 AND 3),
  PRIMARY KEY (user_id, place)
);

-- Relics owned, each at a tier.
CREATE TABLE relics (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  relic TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
  PRIMARY KEY (user_id, relic)
);

-- The relics equipped on the team's members, by slot.
CREATE TABLE team_relics (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  slot TEXT NOT NULL,
  relic TEXT NOT NULL,
  PRIMARY KEY (user_id, character, slot)
);

-- Looks owned.
CREATE TABLE cosmetics (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cosmetic TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, cosmetic)
);

-- The looks each character wears, by kind.
CREATE TABLE worn_cosmetics (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  kind TEXT NOT NULL,
  cosmetic TEXT NOT NULL,
  PRIMARY KEY (user_id, character, kind)
);

-- Who played a run: her relics then too (`slot:relic:tier`, comma-separated; null: none).
ALTER TABLE run_members ADD COLUMN relics TEXT;
