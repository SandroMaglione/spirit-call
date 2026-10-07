-- Ranks (2026-10): every quest is played again at higher ranks, each with
-- its own first clear, stars, and chests, so quest progress and chests are
-- kept per rank. A one-time reset of every account comes with it (the game
-- is not open yet): players keep their logins and sessions, and each
-- account starts over as a new one the next time it is read (see
-- `Accounts`). Run logs and events are kept.

DELETE FROM call_amounts;
DELETE FROM calls;
DELETE FROM call_focus;
DELETE FROM discoveries;
DELETE FROM tiers;
DELETE FROM team_members;
DELETE FROM aspects;
DELETE FROM characters;
DELETE FROM balances;
DELETE FROM accounts;

DROP TABLE quest_stars;
DROP TABLE quests;
DROP TABLE chests;

-- Each quest attempted, at each rank.
CREATE TABLE quests (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  attempts INTEGER NOT NULL,
  clears INTEGER NOT NULL,
  first_cleared_at INTEGER,
  PRIMARY KEY (user_id, quest, rank)
);

-- Each star earned, by its place in the quest's stars, at each rank.
CREATE TABLE quest_stars (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  star INTEGER NOT NULL,
  PRIMARY KEY (user_id, quest, rank, star)
);

-- How many of each star group's chests are open, at each rank.
CREATE TABLE chests (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  star_group TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  opened INTEGER NOT NULL,
  PRIMARY KEY (user_id, star_group, rank)
);
