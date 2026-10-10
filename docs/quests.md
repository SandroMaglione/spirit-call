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
soon), then a character more at the end of chapters 1 and 3. Auditions
(see `collection.md`) open after chapters 2, 4, 5, and 6, but the line
never counts on them: chapter 3 is written for two, and every chapter
after for the three the quests give. Each chapter ends with a champion, a
different kind each time, and unlocks one thing at most: a character at
the end of chapters 1 and 3, an aspect at the end of 2, 4, and 6. Relics
are smaller: the first comes with chapter 2's first quest (Echo, as relics
open after chapter one), and one with the first side quest (Momentum).

| Chapter | Team | Enemy levels | Each quest's new thing | At its end |
|---|---|---|---|---|
| 1 · First Blood | Swordsman | 1–5 | Chasers · Shooters · champion Chaser | the Tidecaller; relics open |
| 2 · Embers | + Tidecaller | 6–10 | Swarmers · fire floors · Guardians · champion Guardian | an aspect (Duelist); the Gunner's audition |
| 3 · Gathering Storm | 2 | 11–16 | fire and water elites · Snipers · Brutes · champion Brute | Bastion |
| 4 · Rising Tide | 3 | 17–22 | water floors · Firebombers · shields · champion Swarmer | an aspect (Whirlpool); the Stormcaller's audition |
| 5 · The Long Night | 3 | 23–28 | Stalkers · Wardens · thunder elites · champion Stalker | Sparkfist's audition |
| 6 · Iron and Stone | 3 | 29–34 | Juggernauts · Volatiles · Gale Casters · champion Juggernaut | an aspect (Riptide); Tidewarden's audition; rank II |

A quest's material is an element the team owns by then (wind in chapter 1),
so early clears pay for the characters the player has.

**Side quests** bring nothing new: each opens after a chapter's last quest
and mixes what the main line has brought, at most a few levels above it.
Their first clears pay a little less gold than a main quest's.
**Hardcore tiers** open the same way: each tier after a main quest (and the
tier before it), with its own waves, so a track's first tier is an early
mix and its last the whole roster.

## Stars

Every quest has **three stars**, each a goal **on top of the clear**: a
clear alone earns none, so a run can win with no star. They go from easy to
hard:

1. **A decent run**: a loose hit budget, "nobody falls", or ending with some
   health left.
2. **The quest's idea**: break enemies (Guardians, the Brute), dodge
   perfectly (snipers, firebombers), chain perfect dodges, or use ultimates
   (swarms).
3. **A clean run**: a tight hit budget, or ending with most of the health.

Stars are earned across runs (each one once, in any run that clears) and
kept for good. The results screen shows each goal with what the run
counted toward it.

**A perfect clear** is all three stars in one run. It is kept per quest
and rank (`perfectAt`), shown on the results screen and as a glow around
the quest's stars in the list. It pays once per quest and rank: the
quest's relic on the rank that unlocks it, and that relic's next tiers on
the ranks above it (see `collection.md`); a perfect clear with nothing
written is its own goal. Stars earned across runs never add up to one.

**The numbers come from measured runs** (the bot, in `test/bot.ts`, on two
seeds, with the team a new account has, from `pnpm progression`): the
skilled bot earns all three, and the learning bot usually earns the first
and often the second. A player takes more hits than the skilled bot, so a
clean run's budget (2–4 hits) is hard for a person. `pnpm lab` prints each
challenge's hits beside its hit budgets.

**Any team can earn every star.** A goal never names a character, an
element, or a class, never asks for speed or a time, and counts the team as
a whole: health is a share of the whole team's (fallen members count none).
"Nobody falls" is free for a solo team (her fall loses the run), so it is
not used in chapter 1, where the Swordsman is alone. Goals are built from a
short list of **tallies** the arena counts for any team, and
`validateContent` accepts only those, with bounds no clear meets on its own
and all three met together by one run:

| Tally | Counts |
|---|---|
| `hitsTaken` | Blows that landed on the team (burns not counted) |
| `falls` | Members of the team who fell |
| `healthLeft` | The team's health at the end, in whole percent of all of it |
| `perfectDodges` | Perfect dodges |
| `longestChain` | The longest chain of perfect dodges (at most 3) |
| `breaks` | Enemies broken |
| `ultimates` | Ultimates used |

A goal is a tally with a bound (`at least` or `at most`). A new kind of goal
is a new tally: one system that counts it in the run, and an entry here.

**Chests.** Stars open chests: in a chapter **one every 3 stars** (3, 6,
9, and 12 in a chapter of four quests, its rewards spread evenly over
them), and in the side quests **one every 6** (6 to 24 for eight), so their
row stays short as side quests are added; the last is the reward for every
side quest at three stars. Chests give gold and essence: at rank I the
essence of their quests' elements (a chapter's, or the side quests'), at
rank II Refined Essence, at rank III Core Essence. They are the milestone
rewards that pay for playing well. Other elements' essence comes from
their own quests and trials, where it is farmed. The side quests' chests came every 6 stars, then
every 3, then every 6 again, holding the same in all; migrations 0006 and
0007 kept each account's count in step, so none is paid twice.

## Ranks

Every quest is played again at higher **ranks** (`rankRules` in
`content/quests.ts`): the main line and the side quests replayed, harder,
each rank a pass with its **own first clears, stars, and chests**. The
quest list has a rank switcher above the chapters. They are the game's
second and third acts (`collection.md`).

| | Rank I | Rank II | Rank III |
|---|---|---|---|
| Enemy levels | the quest's own (1–34) | +12 (13–46) | +24 (25–58) |
| Twist | none | elite leaders | elite leaders and shields |
| First clear | as written | gold worth 2 runs at its level, a clear's worth of Refined Essence, what is written for the rank | the same in Core Essence |
| Chests | as written | 90% of the gold at its level, Refined Essence | the same, Core Essence |

- **When a rank opens.** Rank II opens once the main line is done (its
  finale, the Colossus, cleared), and rank III once rank II's is. Within a
  rank, each main quest opens after the one before it at that rank, and
  side quests open after their main quest at the same rank.
- **Twists** are written once and apply to every quest of a rank: from
  the second wave, each wave's first enemy leads it as an elite of the
  quest's element (wind and rock, which make no elites, stand in as water
  and fire); at rank III each leader also carries a shield. They only use
  what the main line has brought by the time the rank opens:
  `validateContent` follows the gates.
- **Stars** are the same goals at every rank: harder at the higher level
  with the twist.
- **What a rank gives.** Its first clears and chests pay gold and its
  grade of essence; some first clears carry an aspect (rank II's chapter
  finales, two of rank III's), and perfect clears carry relics and their
  tiers, written on the quest (`collection.md`).
- Ranks are where the late levels come from: characters go to level 60,
  and enemy stats follow the same curve past 40 (see `StatCurve`).

## Hardcore rulesets

Every hardcore tier is a **ruleset** (`content/hardcore.ts`): its own waves
(no tier replays the one below at a higher level) and a twist on them,
from one vocabulary shared with the ranks (`RankTwist`): a **leader** (an
enemy of a kind at the head of every wave), **elite leaders** of an element
(from the second wave), and **shields** on the leaders. A twist only uses
what the main line has brought by the time the tier opens
(`validateContent`), and the brief shows it as "Ruleset" where a quest's new
thing would be. Each tier pays once, on its first clear (`collection.md`).

| Track | Tiers (enemy level: twist) |
|---|---|
| Until Fall | 3 · 10 guardian leaders · 16 fire elites · 22 firebomber leaders · 28 shields · 34 gale caster leaders · 40 sniper leaders (harbor) · 46 shields (kilnworks) · 52 stalker leaders (cistern) · 58 thunder elites, shields (citadel) |
| Gauntlet | 10 swarmer leaders · 22 shields · 34 water elites · 46 warden leaders (necropolis) · 58 juggernaut leaders, thunder elites, shields (harbor, champion juggernaut) |
| Brute Siege | 16 sniper leaders · 28 fire elites · 36 volatile leaders · 46 shields (kilnworks, champion juggernaut) · 58 stalker leaders, thunder elites (cistern) |
| The Keep | 30 shields · 36 firebomber leaders · 46 water elites (monastery, champion guardian) · 58 sniper leaders, fire elites, shields (citadel, champion juggernaut) |

Until Fall's tiers are its milestones: each is the endless track's goal
wave at a higher level, paying once, its best wave kept as the score.

## Materials and ascension

- **Three grades of essence.** Each element has its own (Fire Essence,
  Water Essence, ...), for a character's first three steps; **Refined
  Essence** and **Core Essence** are anyone's, for the steps at 40 and 50.
  Amounts follow one curve: what a clear at enemy level n is worth
  (`worthAt`) doubles every six levels.
- **Where it comes from**, and nowhere else:
  - a quest's **first clear**, once: a few clears' worth of its element at
    rank I, one clear's worth of the rank's grade above;
  - **chests**, by their rank's grade;
  - a **hardcore tier's** first clear, of the grade its gate's rank opens;
  - the **trials**, on every clear (see below).

  Replaying a quest pays gold only: an old quest beaten again by a strong
  team pays no essence.
- **Ascension.** A character's levels come in phases of ten, up to 60.
  Gold buys levels within a phase; crossing to the next costs gold and
  essence: her element's at 10, 20, and 30, Refined at 40, Core at 50.
  Because each grade comes from its own act, a character's cap follows
  the part of the game the player has reached. Ascending gives no stats:
  it opens the next ten levels.

## Trials

One trial per element, the place to farm its material. Each is built from
what its element struggles against: enemies that resist it (the content
check makes sure some do), and elites carrying it, which are immune to it.
A trial is as long as a quest; playing well and fast is how to farm more.

- **They open with the main line**, the quest team's elements first: wind
  after chapter 2, water after 3, rock after 4, fire after 5, thunder
  after 6. A character can be farmed
  for only once her element's chapter is behind the player.
- **Ranks** at fixed enemy levels (11, 17, 23, 29, 35, then 41 to 59 with
  the main line's own ranks), each opening with a chapter's last quest and showing only what the main line has brought by
  then. A rank pays the grade of the rank that opens it: its element's
  essence with the main line, Refined Essence from 41 and 47 (opened by
  rank II), Core Essence from 53 and 59 (opened by rank III). Every rank
  pays on the same curve, so farming means the edge of what the player
  can beat, with no cap and no timer.
- `pnpm progression` plays a new account through the whole game on the
  account's own rules: where the team stands at each quest, how much it had
  to farm (for gold, or in a trial for a step's essence), and the hour
  each thing arrives (see `collection.md`, "Measuring it").
