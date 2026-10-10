-- Playtest runs (see docs/playtest.md): every run a playtest build sends,
-- with who played it (a device, and the name its tester gave), which build
-- of the game, and everything the run carries, since there is no account
-- on the server to read it from.

-- A run that ended: what was played (a quest at a rank, a hardcore tier, or
-- nothing: a dev quick start), against what, how it went, and what it
-- earned (`earned`: the account's `Earned`, as JSON).
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  device TEXT NOT NULL,
  tester TEXT NOT NULL,
  build TEXT NOT NULL,
  at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
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
  falls INTEGER NOT NULL,
  health_left INTEGER NOT NULL,
  longest_chain INTEGER NOT NULL,
  ultimates INTEGER NOT NULL,
  dashes INTEGER NOT NULL,
  switches INTEGER NOT NULL,
  earned TEXT NOT NULL
);
CREATE INDEX runs_by_device ON runs (device, at);
CREATE INDEX runs_by_tester ON runs (tester, at);
CREATE INDEX runs_by_build ON runs (build, at);

-- Who played it, in order: her level, aspect, and relics then
-- (`slot:relic:tier`, comma-separated; null: none), and what she did.
CREATE TABLE run_members (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  character TEXT NOT NULL,
  level INTEGER NOT NULL,
  aspect TEXT,
  relics TEXT,
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
