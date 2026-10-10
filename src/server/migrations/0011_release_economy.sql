-- A one-time reset of every account (2026-10): the game became a complete
-- release (docs/collection.md). The Spirit Call, crystals, sigils, dust,
-- the shop, the account level, and the weekly reset are gone; characters
-- come from auditions, and essence comes in three grades. The game has no
-- players yet (docs/server.md, "The database"): players keep their logins
-- and sessions, and each account starts over as a new one the next time it
-- is read (see `Accounts`). Run logs and events are kept. The Call's tables
-- are left empty and unused (migrations only add).

DELETE FROM call_amounts;
DELETE FROM calls;
DELETE FROM call_focus;
DELETE FROM worn_cosmetics;
DELETE FROM cosmetics;
DELETE FROM team_relics;
DELETE FROM relics;
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

-- Teams saved to load in a tap (up to three), each member in order with her
-- aspect, and the relics equipped on each.
CREATE TABLE saved_team_members (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  team INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  character TEXT NOT NULL,
  aspect TEXT,
  PRIMARY KEY (user_id, team, slot)
);

CREATE TABLE saved_team_relics (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  team INTEGER NOT NULL,
  character TEXT NOT NULL,
  slot TEXT NOT NULL,
  relic TEXT NOT NULL,
  PRIMARY KEY (user_id, team, character, slot)
);
