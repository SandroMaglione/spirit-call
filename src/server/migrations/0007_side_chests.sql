-- The side quests' chests come every 6 stars again (6 to 24, with an eighth
-- side quest), so their row stays short as quests are added; the first
-- three each hold what two of the every-3 chests did, and the last what the
-- 21-star one did. An account's count follows: one for every two opened,
-- and all seven opened count all four (see `chests` in
-- src/content/quests.ts), so none is paid twice.
UPDATE chests SET opened = CASE WHEN opened >= 7 THEN 4 ELSE opened / 2 END WHERE star_group = 'secondary';
