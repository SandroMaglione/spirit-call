-- A one-time reset of every account (2026-10): the release roster changed
-- where characters come from (the Tidecaller and Bastion from the quests,
-- the Gunner from the Spirit Call), renamed the Stonekeeper to Bastion, and
-- reordered the trials, so old progress no longer fits. The game has no
-- players yet (docs/server.md, "The database"): players keep their logins
-- and sessions, and each account starts over as a new one the next time it
-- is read (see `Accounts`). Run logs and events are kept.

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
