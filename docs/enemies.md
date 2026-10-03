# Enemies

How enemies fight: the rules behind the execution layer of
`docs/vision.md` (dodging, positioning, timing). Like the vision, this
records intentions and rules, not implementation; numbers live in
`src/content/enemies.ts` and `src/config/tuning.ts` (`crowd`, `paths`,
`fairness`, `breaking`, `perfectDodge`, `waves`, `elites`, `hazards`), where
they are live-tunable; arenas are `src/content/arena.ts`. What enemies are weak to, and the
elements they attack with, are in `docs/elements.md`.

## Principles

- **A new enemy asks a question** of the player's preparation or skill
  (`docs/vision.md`). Its moveset is the question: what it punishes
  (standing still, keeping just out of reach, running in a straight line,
  hugging it) and what answers it.
- **Every hit is avoidable with perfect play.** Every attack is
  telegraphed with exactly the area it will hit, and its aim stops moving
  at least `fairness.minTelegraph` (0.3 s) before it lands: the fairness
  floor, checked by `validateContent`. Nothing that makes enemies harder
  (a hardcore tier, a modifier) may go below it.
- **Pressure comes from enemies working together**, not from unreadable
  attacks: more of them engaging at once, attacks covering each other's
  escape routes, elements that combine. The crowd's rhythm keeps it
  readable (below).

## Movesets

- An enemy has one or more **attacks**. When it may attack, it picks one
  of those that can start: the target within the attack's range (a
  minimum and a maximum distance) and, for shots, in sight (a bomb is
  lobbed over walls). It
  picks at random by the attacks' weights (from the run's seeded random
  numbers, so a run replays exactly).
- An attack can name a **follow-up**: the attack that starts right after
  its recovery, with no cooldown, if it can start then. That is a combo
  (the Chaser's swipe into a slash). An attack with no weight is only ever
  a follow-up.
- An attack's **aim follows the target** from the start of its windup until
  it locks (`aimLock` before it lands; at the start by default). The
  telegraph is dim while it follows and bright once it locks: the moment to
  move. An attack can **lead** a running target, aiming where her run would
  take her by the time it lands (at most at her running speed: a dash does
  not throw it off), so running in a straight line is not a defense.
- Enemies **stand their ground** while attacking, unmoved by the crowd, so
  the attack lands where its telegraph showed. A blow can still push them,
  and what they committed to goes with them: a swing or a lane starts from
  where they stand, a slam comes back within reach, and a swing already out
  moves with them. Pushing an attacker away is a defense.
- **Enemies attack from where they stand**: a swipe, a slam, a shot, a
  lobbed bomb. None dashes along a lane at the player (the playtests found
  a telegraphed slide unpleasant to face); the `charge` and `beam` attack
  kinds stay in the vocabulary, unused. Ranged attacks are things in
  flight the player can see coming and step out of: the Sniper fires a fast
  bullet, the Firebomber lobs bombs whose landing ring shows from the
  windup until they burst.

## Behaviors

How an enemy moves when it is not attacking (`features/behaviors.ts`):

- **Chase**: straight at the target, to a distance.
- **Kite**: keep between two distances, strafing.
- **Skirmish**: circle the target until given one of the few engagement
  slots (`crowd.engagers`, nearest first), close in and attack, then back
  off once the attack (and its follow-ups) is over, and circle again. A
  skirmisher attacks only while it holds a slot, so a gap-closer is never
  thrown from the circle.

Enemies find their **way around walls**: with no clear line to the player,
they follow a flow field over the arena (`physics/paths.ts`) instead of
pressing against the wall in between.

## The crowd's rhythm

- Only a few attacks **wind up at once** across the arena
  (`crowd.windups`); the nearest enemies go first, the others wait their
  turn. Follow-ups are not held back: a combo is one attack.
- Skirmishers **take turns** closing in (`crowd.engagers`).

These two numbers are what makes a big wave dangerous without making it
unreadable; hardcore modifiers may raise them, never the readability floor.

## Waves

- **Enemies come in by their job.** Each wave has a front, a direction from
  the player (toward the side of the arena with the most room). Enemies that
  keep their distance come in far along it; the others come in closer, from
  the flanks and behind. Backing away from one side walks into the other.
- **Reinforcements come as a wave thins out**: once only a few of its
  enemies are left (`waves.reinforceAt`), the next wave starts arriving.
  Kills bring it, never a timer, so there is no damage race.
- Every spawn is warned on the floor before the enemy appears.
- **A run lasts three to four minutes.** A quest's waves add up to that for
  the lab's quick player (sum its seconds to clear); survive challenges run
  180 to 210 s. Fewer, bigger waves rather than many small ones: a run of
  eight to ten waves leaves room for a build-up and a last, hardest wave.
- **Lasting until the team falls** (the `endure` objective, the Until Fall
  track): the waves never end, and every wave's enemies come in
  `levelPerWave` levels above the last. Reaching the goal wave clears the
  tier; going past it is the score (each tier keeps its best wave).

## Elites

A wave entry can be an **elite**: the first enemy of its group is bigger and
tougher, immune to its element, and every blow it deals carries that
element. Its element shows as a ring under its feet and a glow on its body.

- **Fire** leaves fire on the ground behind it as it moves: it burns its own
  side too, and a wind whirl takes it in.
- **Water** leaves puddles: they slow and soak (the player as much as the
  enemies standing in them), and carry thunder.
- **Thunder** discharges around itself now and then, a ring telegraphed
  where it stood: the soaked are shocked.

Elites make the elements part of the fight on the enemies' side, ready to be
turned against them. Endless waves make elites of a growing share of their
slots.

## Arenas

Each challenge is fought in an arena (`content/arena.ts`): its pillars (tall,
fading in front of the player), low walls (cover that blocks movement and
shots without hiding anyone), and hazards. Hazards are permanent pools laid
into the floor's tiles, level with it, that affect everyone, enemies
included: **fire trenches** burn (water puts one out for a while, then it
burns again), and **basins** of water soak and carry thunder. Both feed a
wind whirl. An arena's look comes from an environment kit, by the same id
(`presentation/looks.ts`); hazards are drawn flat, in few tones, like the
rest of the game.

**Enemies keep out of harm's way.** They find their way around the arena's
hazards as around walls, slide along the edge of any pool they would take
harm from instead of stepping in (fire anywhere, the player's included),
and walk straight out of one they were pushed into. Only force puts them
there: a wind whirl's pull, a push. An enemy immune to an element ignores
its pools.

Pools are few and small (at most two in an arena, of at most four tiles),
and each carries low walls along two of its edges, one of each pair: it is
open on the other two sides only, so it is stepped into on purpose or
pushed into, never drifted into while dodging. Keep a pool short across the
way enemies come in: one long enough to stand behind lets ranged enemies
shoot over it out of reach, and a run drags on (the lab shows it as a wave
that takes minutes). `test/arenas.test.ts` keeps every gap between what
blocks wide enough to pass.

## Breaking

Pressing an attack has a payoff. Every enemy that can break (`poise`
above 0, a share of its health; Swarmers and training dummies never do)
has a bar under its health:

- Blows fill it by the damage they deal, heavy ones (finishers, charged
  attacks) more, burns a little; a reaction on it (a body catching fire, a
  shock, a wall slam above all) fills a share of it at once.
- It **drains** once the enemy has taken nothing for a moment, so chipping
  at it from afar never breaks it.
- Full, the enemy **breaks**: its attack is cut off, it is stunned for a
  while and takes more damage (a modest bonus: breaking is a window, never
  a requirement), with a heavy pause and a burst. Its bar fills again only
  once it has recovered.

## Perfect dodges

Reading an attack is rewarded over running from it. A dash started at
most `perfectDodge.window` seconds before a blow lands where she stood (or
on her, through the dash's invulnerability) is **perfect**; an earlier one
is a plain dodge. It rewards once per dash: the **enemies slow down** for a
moment while the team keeps its pace (their moves, windups, shots, and
bombs), the attacker's break bar fills, a dash charge comes back, a little
energy, a full magazine, and a moment more of invulnerability. Every
reward is a number, and any can be turned off.

## Reading the player

Enemies read the player (`Tuning.reading`), so a fight has a give and take:

- **She is open** while a long move recovers (a finisher, a charged
  attack), while she reloads, or with no dash charge left. Melee enemies
  then take their turn at once, a touch faster, and their attacks come
  round sooner; their telegraphs never get shorter. Enemies keeping their
  distance keep their rhythm.
- **She is a threat** to a melee enemy her ready weapon is aimed at, within
  her reach: it keeps just out of that reach, circling, until it runs out
  of patience and commits anyway. Enemies behind her do not hesitate.

## Measuring difficulty

A bot plays through the touch controls (`test/bot.ts`), reading only what
is on screen.

- **Fairness** (`test/fairness.test.ts`): against every enemy that attacks,
  a bot reacting at once takes no hit. A new enemy whose attacks cannot be
  dodged fails it.
- **The lab** (`pnpm lab`): every wave of every challenge, fought with the
  Swordsman by a quick player (reacting to a telegraph after 0.25 s) and
  one still learning (0.4 s). It reports hits per minute, seconds to clear,
  dashes per minute (how often the fight forces the dash), and pressure
  (the share of the time standing still would get hit). Use it to compare
  tunings; a bot is not a human, so feel is checked by playing.

## Open questions

1. **More hazards.** Hazards that act on their own (vents that flare on a
   rhythm, currents that push), and arenas that change during a run.
