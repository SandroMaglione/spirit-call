-- Perfect clears and the shop's stock (2026-10, see docs/relics.md): a
-- quest cleared with all three stars in one run is kept per rank (its
-- relic's tier came with it), and the shop sells a few relic tiers a
-- period, so the account keeps the period of its last purchase and how
-- many it made in it.
ALTER TABLE quests ADD COLUMN perfect_at INTEGER;
ALTER TABLE accounts ADD COLUMN shop_period INTEGER;
ALTER TABLE accounts ADD COLUMN shop_bought INTEGER NOT NULL DEFAULT 0;
