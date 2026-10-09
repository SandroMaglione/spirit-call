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
soon), then a character more at the end of chapters 1 and 3; the Spirit
Call (open from the end of chapter 1) brings its first character around
chapter 5 (see `calls.md`), so chapter 3 is written for two. Each chapter ends with a
champion, a different kind each time, and unlocks one thing at most: a
character at the end of chapters 1 and 3, an aspect at the end of 2, 4,
and 6. Relics are smaller: the first comes with chapter 2's first quest
(Echo, as relics open with the Call), and one with the first side quest
(Momentum).

| Chapter | Team | Enemy levels | Each quest's new thing | At its end |
|---|---|---|---|---|
| 1 · First Blood | Swordsman | 1–5 | Chasers · Shooters · champion Chaser | the Gunner; the Spirit Call opens |
| 2 · Embers | + Gunner | 6–10 | Swarmers · fire floors · Guardians · champion Guardian | an aspect (Duelist) |
| 3 · Gathering Storm | 2 | 11–16 | fire and water elites · Snipers · Brutes · champion Brute | the Tidecaller |
| 4 · Rising Tide | 3 | 17–22 | water floors · Firebombers · shields · champion Swarmer | an aspect (Marksman) |
| 5 · The Long Night | 3 | 23–28 | Stalkers · Wardens · thunder elites · champion Stalker | |
| 6 · Iron and Stone | 3 | 29–34 | Juggernauts · Volatiles · Gale Casters · champion Juggernaut | an aspect (Riptide) |

A quest's material is an element the team owns by then (wind in chapter 1),
so early clears pay for the characters the player has.

**Side quests** bring nothing new: each opens after a chapter's last quest
and mixes what the main line has brought, at most a few levels above it.
Their first clears pay dust on top (and a little less gold than a main
quest's); a main quest's first clear pays none.
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
kept for good. Only a quest's first rank (its own enemy level) has stars.
The results screen shows each goal with what the run counted toward it.

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

**Chests.** Stars open chests, **one every 3 stars** in every group: a
chapter's (3, 6, 9, and 12 in a chapter of four quests, its rewards spread
evenly over them), and the side quests' (3 to 21). Chests give crystals,
gold, and the material of their quests' elements (a chapter's, or the side
quests'): the milestone rewards that pay for playing well. Other elements'
material comes from their own quests and trials, where it is farmed. The
side quests' chests also hold **dust** (see `relics.md`), with a little
less gold: dust comes from off the main line. The side quests' chests came
every 6 stars before; they hold the same in all, and an account that had
opened some counts two for each (migration 0006).

## Ranks

Every quest is played again at higher **ranks** (`rankRules` in
`content/quests.ts`): the main line and the side quests replayed, harder,
each rank a pass with its **own first clears, stars, and chests**. The
quest list has a rank switcher above the chapters.

| | Rank I | Rank II | Rank III |
|---|---|---|---|
| Enemy levels | the quest's own (1–34) | +12 (13–46) | +24 (25–58) |
| Twist | none | elite leaders | elite leaders and shields |
| First clear | as written | 40% of the crystals, gold worth 2 runs at its level, a clear's worth of material, 30 dust | same |
| Chests | as written | 40% of the crystals, 90% of the gold at its level, no material, 40 dust | same |

- **When a rank opens.** A chapter's rank r opens once the main line is
  `(r − 1) × 2` chapters further on (rank II of chapter 1 with the end of
  chapter 3), and each quest after the one before it at that rank. Where
  the main line has no such chapter yet, the replay goes on in its own
  order once the main line is done. Side quests open after their main
  quest at the same rank.
- **Twists** are written once and apply to every quest of a rank: from
  the second wave, each wave's first enemy leads it as an elite of the
  quest's element (wind and rock, which make no elites, stand in as water
  and fire); at rank III each leader also carries a shield. They only use
  what the main line has brought by the time the rank opens:
  `validateContent` follows the gates.
- **Stars** are the same goals at every rank: harder at the higher level
  with the twist.
- Ranks are where the late levels come from: characters go to level 60,
  and enemy stats follow the same curve past 40 (see `StatCurve`).

## Materials and ascension

- **One material per element** (Fire Essence, Water Essence, ...), its
  amounts on one curve: what a clear at enemy level n is worth
  (`worthAt`) doubles every six levels.
- **Where it comes from**, and nowhere else:
  - a quest's **first clear**, once: a few clears' worth of its element
    at its level (a quest's element is one the team owns by then);
  - a **hardcore tier's** weekly reward: a couple of clears' worth;
  - its element's **trial**, on every clear (see below);
  - a Spirit Call supply, for the focused character's element.

  A higher rank's first clear pays one clear's worth. Replaying a quest
  pays gold only: an old quest beaten again by a strong team pays no
  materials.
- **Ascension.** A character's levels come in phases of ten, up to 60.
  Gold buys levels within a phase; crossing to the next costs gold and her
  element's material: about six clears of the trial rank of its time for
  the first steps (36 at level 10, 120 at 20, 384 at 30), more for the
  last two, which the ranks' replays reach (3,000 at 40, 10,000 at 50).
  Ascending gives no stats: it opens the next ten levels.

## Trials

One trial per element, the place to farm its material. Each is built from
what its element struggles against: enemies that resist it (the content
check makes sure some do), and elites carrying it, which are immune to it.
A trial is as long as a quest; playing well and fast is how to farm more.

- **They open with the main line**: wind after chapter 2, fire after 3,
  water after 4, thunder after 5, rock after 6. A character can be farmed
  for only once her element's chapter is behind the player.
- **Ranks** at fixed enemy levels (11, 17, 23, 29, 35, then 41 to 59 with
  the main line's own ranks), each opening with a chapter's last quest and showing only what the main line has brought by
  then. Every rank pays, on the same curve: the top rank open takes about
  six clears for a step, the one below about twice as many, the first rank
  of a late step dozens. So farming means the edge of what the player can
  beat, with no cap and no timer.
- `pnpm progression` plays a new account through the main line on the
  account's own rules: where the team stands at each quest, how much it had
  to farm (for gold, or in a trial for a step's material), and how many
  clears of each trial rank a step takes.
