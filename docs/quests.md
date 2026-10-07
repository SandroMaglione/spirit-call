# Quests, stars, and materials

How quests are built and what they give, beyond `docs/vision.md`
("Structure" and "Progression"). The numbers live in `src/content/` and are
live-tunable; this is the reasoning they follow.

## A quest is a question

A main quest brings in **one new thing**: an enemy, a kind of floor (fire,
water), elites of an element, a kind's champion, or an ability any enemy can
carry (a shield). Its card shows it first, with its picture, and the quests
after it mix what came before. The player knows what she will face before
she enters: the enemies and their traits, and which of her characters suit
them.

Nothing shows a thing before the main line brings it: the quest's waves,
the side quests, ranks, and hardcore tiers that open after it (each tier
with its own waves), Until Fall's endless waves, and Enemy Practice's
picks. `validateContent` checks it (`content/novelties.ts`): a main quest
brings something no quest before it did, its waves show it, and nothing else
new; anything that opens after a quest shows only what the main line has
brought up to it, with enemies at most `aheadOfLine` (4) levels above it.

## Chapters

The main line is written for the team a new account has by then: chapter 1
for the Swordsman alone (three quests, so the second character comes
soon), then a character more at the end of chapters 1 and 3, and whoever
the Spirit Call brings from the end of chapter 1. Each chapter ends with a
champion, a different kind each time.

| Chapter | Team | Enemy levels | Each quest's new thing | At its end |
|---|---|---|---|---|
| 1 · First Blood | Swordsman | 1–5 | Chasers · Shooters · champion Chaser | the Gunner; the Spirit Call opens |
| 2 · Embers | + Gunner | 6–10 | Swarmers · fire floors · Guardians · champion Guardian | |
| 3 · Gathering Storm | 2 + calls | 11–16 | fire and water elites · Snipers · Brutes · champion Brute | the Tidecaller |
| 4 · Rising Tide | 3 | 17–22 | water floors · Firebombers · shields · champion Swarmer | |
| 5 · The Long Night | 3 | 23–28 | Stalkers · Wardens · thunder elites · champion Stalker | |
| 6 · Iron and Stone | 3 | 29–34 | Juggernauts · Volatiles · Gale Casters · champion Juggernaut | |

A quest's material is an element the team owns by then (wind in chapter 1),
so early clears pay for the characters the player has.

**Side quests** bring nothing new: each opens after a chapter's last quest
and mixes what the main line has brought, at most a few levels above it.
**Hardcore tiers** open the same way: each tier after a main quest (and the
tier before it), with its own waves, so a track's first tier is an early
mix and its last the whole roster.

## Stars

Every quest has **three stars**, each a goal met in a cleared run:

1. Clear it.
2. A goal about the quest's idea (break the Brute, dodge the snipers).
3. A hit budget: take at most so many hits. `pnpm lab` prints each
   challenge's hits over a whole run beside its budget; a budget sits
   between the quick bot's and the learning bot's.

Stars are earned across runs (each one once, in any run that clears) and
kept for good. Only a quest's first rank (its own enemy level) has stars.

**Any team can earn every star.** A goal never names a character, an
element, or a class, never asks for speed or a time, and never depends on
how many characters the team has (a solo character cannot fall without
losing, so "nobody falls" would be free for her: the hit budget asks the
same of everyone). Goals are built from a short list of **tallies** the
arena counts for any team, and `validateContent` accepts only those:

| Tally | Counts |
|---|---|
| `hitsTaken` | Blows that landed on the team (burns not counted) |
| `perfectDodges` | Perfect dodges |
| `breaks` | Enemies broken |

A goal is a tally with a bound (`at least` or `at most`). A new kind of goal
is a new tally: one system that counts it in the run, and an entry here.

**Chests.** A chapter's stars open its chests (at 3, 6, and 9 stars), and
the secondary quests' stars open theirs. Chests give crystals, gold, and
materials: the milestone rewards that pay for playing well.

## Ranks

After the main line moves on, a quest opens again at higher **ranks**:
the same quest at a fixed, higher enemy level (never scaled to the player).
A rank opens with a later chapter's last quest, at about its level: rank 2
two chapters on, rank 3 four chapters on (chapters 5 and 6 get theirs as
the main line grows). Ranks give no first clear rewards and no stars; they
pay what any run pays at their level (gold, and materials of a higher
grade). They are why an old quest stays worth playing, and why every element
has a place to earn its highest grade.

## Materials and ascension

- **One material per element, in three grades** (Shard, Core, Heart).
- **Every clear pays its element's material**, at the grade its enemy level
  sets (grade 1 below level 15, grade 2 below 30, grade 3 from 30), more
  when the challenge has a champion. A loss pays none (only its share of
  gold). Each quest and hardcore track has an element; the first clear of a
  quest pays a lump of it too.
- **Ascension.** A character's levels come in phases of ten. Gold buys
  levels within a phase; crossing to the next costs gold and her element's
  material of that step's grade (10→ grade 1, 20→ grade 2, 30→ grade 3).
  Ascending gives no stats: it opens the next ten levels.
- **Combining.** Three of a grade and some gold make one of the next grade,
  so no single quest is ever a wall.
- **Farming low quests** is allowed and harmless: a low quest pays low
  grades, which only serve the first steps (or combine up at a loss). It is
  how a newly pulled character catches up, never how one reaches the top.
- Amounts are fixed, never random: the quest card says what a clear gives.
