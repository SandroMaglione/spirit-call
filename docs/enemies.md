# Enemies

How enemies fight: the rules behind the execution layer of
`docs/vision.md` (dodging, positioning, timing). Like the vision, this
records intentions and rules, not implementation; numbers live in
`src/content/enemies.ts` and `src/config/tuning.ts` (`crowd`, `paths`,
`fairness`, `breaking`, `perfectDodge`), where they are live-tunable. What enemies are weak to, and the
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
  the attack lands where its telegraph showed. A blow can still push them.
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
bombs), the attacker's break bar fills, the dash comes back, a little
energy, a full magazine, and a moment more of invulnerability. Every
reward is a number, and any can be turned off.

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

1. **Waves.** Where each enemy comes in (by its job: ranged across the
   arena, melee from the flanks), reinforcements arriving as the last ones
   fall, elite enemies, and arena hazards.
