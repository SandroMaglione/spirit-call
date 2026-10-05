# Quests, stars, and materials

How quests are built and what they give, beyond `docs/vision.md`
("Structure" and "Progression"). The numbers live in `src/content/` and are
live-tunable; this is the reasoning they follow.

## A quest is a question

A main quest brings in **one new thing**: an enemy, an arena hazard, or a
rule. Its card names it in one line ("New: the Warden"), and the quests
after it mix what came before. The player knows what she will face before
she enters: the enemies and their traits, and which of her characters suit
them.

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
Rank 2 opens after chapter 2, rank 3 after chapter 3. Ranks give no first
clear rewards and no stars; they pay what any run pays at their level
(gold, and materials of a higher grade). They are why an old quest stays
worth playing, and why every element has a place to earn its highest
grade.

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
