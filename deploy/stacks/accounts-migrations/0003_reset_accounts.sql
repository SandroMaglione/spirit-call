-- A one-time reset of every account (2026-10): the main line was rebuilt
-- into six chapters, so old quest progress no longer fits. Players keep
-- their logins and sessions; each account starts over as a new one the next
-- time it is read (see `Accounts`). Run logs and events are kept.
-- Otherwise migrations only ever add (tables, nullable columns).

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
