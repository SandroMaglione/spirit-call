-- What players do, for measuring play (see docs/server.md): every run with
-- its log, and every change to an account with what it gained and spent.

-- A run that ended: what was played (a quest at a rank, a hardcore tier, or
-- nothing: a dev quick start), against what, and how it went.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  play_kind TEXT CHECK (play_kind IN ('quest', 'tier')),
  quest TEXT,
  rank INTEGER,
  track TEXT,
  tier INTEGER,
  challenge TEXT NOT NULL,
  enemy_level INTEGER NOT NULL,
  cleared INTEGER NOT NULL,
  progress REAL NOT NULL,
  wave INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  seconds REAL NOT NULL,
  hits_taken INTEGER NOT NULL,
  perfect_dodges INTEGER NOT NULL,
  breaks INTEGER NOT NULL,
  dashes INTEGER NOT NULL,
  switches INTEGER NOT NULL
);
CREATE INDEX runs_by_user ON runs (user_id, at);

-- Who played it, in order: her level and aspect then, and what she did.
CREATE TABLE run_members (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  character TEXT NOT NULL,
  level INTEGER NOT NULL,
  aspect TEXT,
  damage_dealt REAL NOT NULL,
  damage_taken REAL NOT NULL,
  kills INTEGER NOT NULL,
  PRIMARY KEY (run_id, slot)
);

-- Each wave reached: when it began, and the blows and damage taken in it.
CREATE TABLE run_waves (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  wave INTEGER NOT NULL,
  started_at REAL NOT NULL,
  hits_taken INTEGER NOT NULL,
  damage_taken REAL NOT NULL,
  PRIMARY KEY (run_id, wave)
);

-- What hurt the team: an enemy's attack, or (enemy and attack empty)
-- anything else (a burn, the ground, a burst).
CREATE TABLE run_hurts (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  enemy TEXT,
  attack TEXT,
  hits INTEGER NOT NULL,
  damage REAL NOT NULL,
  PRIMARY KEY (run_id, place)
);

CREATE TABLE run_skills (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  skill TEXT NOT NULL,
  uses INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  damage REAL NOT NULL,
  PRIMARY KEY (run_id, character, skill)
);

-- Each member falling: when, in which wave, and what dealt the blow.
CREATE TABLE run_knockouts (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  place INTEGER NOT NULL,
  character TEXT NOT NULL,
  at REAL NOT NULL,
  wave INTEGER NOT NULL,
  enemy TEXT,
  attack TEXT,
  PRIMARY KEY (run_id, place)
);

-- Every change to an account: which action, on what (a character, a
-- material, a banner, a run), and what it gained or spent of each resource.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  action TEXT NOT NULL,
  subject TEXT
);
CREATE INDEX events_by_user ON events (user_id, at);

CREATE TABLE event_amounts (
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  change INTEGER NOT NULL,
  PRIMARY KEY (event_id, resource)
);
