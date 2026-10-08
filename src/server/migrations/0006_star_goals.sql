-- Stars as goals on top of the clear (2026-10): a run counts more for them
-- (members who fell, the team's health left at the end in whole percent,
-- the longest chain of perfect dodges, ultimates used). Runs kept from
-- before count 0 of each.
ALTER TABLE runs ADD COLUMN falls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN health_left INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN longest_chain INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN ultimates INTEGER NOT NULL DEFAULT 0;

-- The side quests' chests come every 3 stars instead of every 6, the same
-- rewards in all: what an account opened at 6, 12, and 18 stars are now
-- the chests at 3 and 6, ..., 15 and 18 (two for each it had), so none is
-- paid twice (see `chests` in src/content/quests.ts).
UPDATE chests SET opened = opened * 2 WHERE star_group = 'secondary';
