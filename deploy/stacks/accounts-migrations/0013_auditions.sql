-- Auditions opened with an invitation (see docs/collection.md): the player
-- chooses which character auditions next, and the order sets each
-- audition's place (`slot`, 1 the first), its level and twist. Invitations
-- are a currency, in `balances` like gold.
CREATE TABLE auditions (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character TEXT NOT NULL,
  slot INTEGER NOT NULL,
  opened_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, character)
);

-- Accounts from before invitations keep their way: an audition already
-- played is opened (in the order its first part was cleared), and the
-- invitations the milestones they cleared would have given, less one for
-- each audition character already opened or owned, are added.
INSERT INTO auditions (user_id, character, slot, opened_at)
SELECT user_id, character, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY cleared IS NULL, cleared, character), COALESCE(cleared, 0)
FROM (
  SELECT user_id, REPLACE(track, 'Audition', '') AS character, MIN(first_cleared_at) AS cleared
  FROM tiers
  WHERE track IN ('gunnerAudition', 'stormcallerAudition', 'sparkfistAudition', 'tidewardenAudition', 'hearthAudition', 'windwallAudition', 'quarryAudition') AND tier <= 3
  GROUP BY user_id, track
);

INSERT INTO balances (user_id, resource, amount)
SELECT user_id, 'invitations', given - taken
FROM (
  SELECT
    accounts.user_id AS user_id,
    (SELECT COUNT(*) FROM quests WHERE quests.user_id = accounts.user_id AND quests.first_cleared_at IS NOT NULL AND (
      (quest = 'bulwark' AND rank IN (1, 3)) OR (quest = 'swarmMother' AND rank = 1) OR (quest = 'theWarlord' AND rank IN (1, 2))
      OR (quest = 'colossus' AND rank = 1) OR (quest = 'bruteKing' AND rank = 2)
    )) AS given,
    (SELECT COUNT(*) FROM (
      SELECT character FROM auditions WHERE auditions.user_id = accounts.user_id
      UNION
      SELECT character FROM characters WHERE characters.user_id = accounts.user_id AND character IN ('gunner', 'stormcaller', 'sparkfist', 'tidewarden', 'hearth', 'windwall', 'quarry')
    )) AS taken
  FROM accounts
)
WHERE given > taken;
