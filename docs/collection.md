# The collection

How everything is owned, beyond `docs/vision.md` ("Progression"). The game
ships complete: every character, aspect, relic, and look is in it, and
each comes from one place, written on the card that gives it. Nothing is
random and nothing is bought. The numbers live in `src/content/`; this is
the reasoning they follow.

## The shape of it

- **About 55 hours to own everything**, and about 100 to take all ten
  characters to level 60. A main team reaches 60 well before that (about
  hour 65). What remains after the collection is power, never anything new.
- **Something new every few hours.** A character, an aspect, or a relic
  arrives about every three to five hours of play, and the level cap rises
  only as the player reaches the next part of the game.
- **One place each.** `collectionSources` (`content/collection.ts`) lists
  where every item comes from, and `validateContent` checks that each item
  has exactly one source, and that a relic's tiers come after the relic.
  The Collection screen shows the same list: every item, the card that
  gives it, and whether that card is open yet.

## The game in three acts

| Act | Hours | What is played | What comes |
|---|---|---|---|
| The main line | 0–12 | chapters 1–6, side quests, the first trials and hardcore tiers | 3 quest characters, 4 auditions, the first relics, element essence (cap 40) |
| Rank II | 12–25 | every quest again, harder | 2 auditions, tier II relics, Refined essence (cap 50) |
| Rank III | 25–40 | every quest at its hardest | the last audition, mastery auditions, Core essence (cap 60) |
| Hardcore | 40–55 | the rulesets, Until Fall | trails, the last relic tiers |
| Mastery | 55–100 | anything | levels, up to 60 for everyone |

## Characters

Three come from the main line, and seven from **auditions**.

| Character | How | Opens after |
|---|---|---|
| Swordsman | a new account | |
| Tidecaller | the main line | chapter 1's finale (the Pack Leader) |
| Gunner | audition | chapter 2's finale (the Bulwark) |
| Bastion | the main line | chapter 3's finale (the Brute King) |
| Stormcaller | audition | chapter 4's finale (the Swarm Mother) |
| Sparkfist | audition | chapter 5's finale (the Warlord) |
| Tidewarden | audition | chapter 6's finale (the Colossus) |
| Hearth | audition | the Brute King at rank II |
| Windwall | audition | the Warlord at rank II |
| Quarry | audition | the Bulwark at rank III |

**An audition is three quests** played as that character alone: no team,
no aspect but her class's plain one, no relics, at a fixed level (the
enemies' own, so no gap either way). The first two are written around
her kit (what she is good at, then what she must answer), and the third
ends on a champion, fought as a boss. The quests open in order, and
clearing the third makes her the account's, at the audition's level (her
gold and ascension steps up to it come with her). Losing costs nothing,
and an audition can be tried as often as wanted. The player's own levels
never help, so an audition is won by learning the kit; it may take a few
tries, and that is its point (the one place the game is a wall).

Auditions are tracks (`content/hardcore.ts`, kind `audition`), so they are
played and kept like a hardcore track's tiers.

**A mastery audition** is a fourth tier of each character's audition: her
champion fight again at level 50, with rank III's twists (elite leaders
carrying shields), still alone and lent. It opens with rank III (the Pack
Leader at rank III) and gives her tint. The three quest characters have a
track with this tier only.

## Aspects

Every class's plain aspect comes with its first character. The twelve
named aspects (two per class) are each a first-clear reward:

| Where | Aspects |
|---|---|
| The main line: chapters 2, 4, 6 | Duelist, Whirlpool, Riptide |
| An audition's last quest, when it brings a class's first character | Marksman (Gunner), Arc (Stormcaller), Flurry (Sparkfist), Furrow (Hearth) |
| Rank II's finales: chapters 2, 4, 6 | Gathering Edge, Scattergun, Lightning Rod |
| Rank III's finales: chapters 3, 5 | Grapple, Tremor |

An aspect is owned once: there are no copies and no duplicates.

## Relics

- **Unlocked by perfect clears**, as before (`relics.md`): one quest's,
  at one rank, all three stars in one run.
- **A relic grows with its quest.** Its tier II comes with the perfect
  clear of the same quest one rank up, and tier III two ranks up. A relic
  unlocked at rank II takes tier III from a hardcore tier; one unlocked at
  rank III takes both from hardcore tiers. Every tier is written on its
  card (a quest's `perfect` rewards, a tier's `unlocks`).
- **Every perfect clear pays**, once per quest and rank, on top of any
  relic: gold worth four runs at its level and two trial clears' worth of
  its rank's essence (`perfectRules`), so chasing all three stars in one
  run is always worth it.

## Looks

| Kind | How many | From |
|---|---|---|
| Tint | one per character | her mastery audition |
| Trail | seven, anyone's | hardcore tiers, written on them |

## Resources

Two things are earned, and both only level characters:

- **Gold**, from every run (by its enemies' level; a loss its share of
  the progress), and on top from first clears, chests, and feats.
- **Essence**, for the ascension steps between a character's phases of
  ten levels, in three grades:

  | Steps | Essence | From |
  |---|---|---|
  | 10, 20, 30 | her element's essence | rank I first clears and chests, trial ranks opened by the main line |
  | 40 | Refined Essence (anyone's) | rank II first clears and chests, trial ranks opened by rank II, rank II hardcore tiers |
  | 50 | Core Essence (anyone's) | rank III first clears and chests, trial ranks opened by rank III, rank III hardcore tiers |

  So a character can be taken only as far as the part of the game the
  player has reached: the top trial ranks pay Core Essence on every
  clear, the one place to farm the last levels, and they open last.

There is no account level, no shop, and no reset: a hardcore tier pays
once, on its first clear, like a quest.

## Measuring it

`pnpm progression` plays a new account through the game on its own rules
(the main line, auditions, ranks II and III, the hardcore tiers, and the
trials to farm), at a number of runs an hour, and reports the hour each
character, aspect, and relic arrives, when the collection is complete,
when the main team reaches 60, and when all ten do. Run it after changing
rewards, costs, or what opens when. Measured on October 10, 2026, at 15
runs an hour:

| Player | Everything owned | All ten at 60 |
|---|---|---|
| Skilled (no run lost) | 44 h | 75 h |
| The one the pace is for (a quarter of runs lost) | 55 h | 92 h |
| Struggling (two runs in five lost) | 62 h | 105 h |

Every character's level costs the same gold, whoever she is. What keeps
the last characters from taking as long as the first is the gold a run
pays: `50 + 10 × level + 2 × level²` (`progression.gold`), so a run of the
endgame pays several times a run of the main line, and the characters
taken up last are taken up at the endgame's pace.

The model plays an audition's part twice (the second a clear) and a
perfect clear that gives something three times; a player who needs more
takes longer, which the hours above do not count. `test/new-account.test.ts`
keeps the middle row near its targets.
