-- Players, their sessions, and their accounts (see docs/server.md).
-- Content ids (characters, quests, currencies, ...) are TEXT: content lives in
-- code, and the server checks every id it reads against it. Times are epoch
-- milliseconds. Migrations only ever add (tables, nullable columns).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A session is a random token kept in a cookie; only its hash is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_user ON sessions (user_id);

-- One row per account: its numbers, the Spirit Call's draws, and what the
-- menu starts from (a quest at a rank, or a hardcore track's tier).
CREATE TABLE accounts (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  experience INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  clears INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  seconds_played REAL NOT NULL,
  call_seed INTEGER NOT NULL,
  calls_since_character INTEGER NOT NULL,
  calls_since_aspect INTEGER NOT NULL,
  first_character_called INTEGER NOT NULL,
  play_kind TEXT NOT NULL CHECK (play_kind IN ('quest', 'tier')),
  play_quest TEXT,
  play_rank INTEGER,
  play_track TEXT,
  play_tier INTEGER
);

-- Currencies and materials held.
CREATE TABLE balances (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (user_id, resource)
);

CREATE TABLE characters (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  experience INTEGER NOT NULL,
  ascension INTEGER NOT NULL,
  PRIMARY KEY (user_id, character)
);

CREATE TABLE aspects (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  aspect TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  copies INTEGER NOT NULL,
  PRIMARY KEY (user_id, aspect)
);

-- The team the menu starts from, in order, with the aspect equipped on each
-- (none: her class's plain one).
CREATE TABLE team_members (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  character TEXT NOT NULL,
  aspect TEXT,
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE quests (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  clears INTEGER NOT NULL,
  first_cleared_at INTEGER,
  PRIMARY KEY (user_id, quest)
);

-- Each star earned, by its place in the quest's stars.
CREATE TABLE quest_stars (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  quest TEXT NOT NULL,
  star INTEGER NOT NULL,
  PRIMARY KEY (user_id, quest, star)
);

CREATE TABLE tiers (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  tier INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  clears INTEGER NOT NULL,
  first_cleared_at INTEGER,
  rewarded_period INTEGER,
  best_wave INTEGER,
  PRIMARY KEY (user_id, track, tier)
);

CREATE TABLE discoveries (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  discovery TEXT NOT NULL,
  made_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, discovery)
);

-- How many of each star group's chests are open.
CREATE TABLE chests (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  star_group TEXT NOT NULL,
  opened INTEGER NOT NULL,
  PRIMARY KEY (user_id, star_group)
);

-- The character focused on each banner.
CREATE TABLE call_focus (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  banner TEXT NOT NULL,
  character TEXT NOT NULL,
  PRIMARY KEY (user_id, banner)
);

-- The last calls, newest first (`place` 0), and what each brought: a
-- character or an aspect (`item`), or a supply bundle (`call_amounts`).
CREATE TABLE calls (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  at INTEGER NOT NULL,
  banner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('character', 'aspect', 'supply')),
  item TEXT,
  PRIMARY KEY (user_id, place)
);

CREATE TABLE call_amounts (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  resource TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (user_id, place, resource)
);
