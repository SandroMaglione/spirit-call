# Enemies

How enemies fight: the rules behind the execution layer of
`docs/vision.md` (dodging, positioning, timing). Like the vision, this
records intentions and rules, not implementation; numbers live in
`src/content/enemies.ts` and `src/config/tuning.ts` (`crowd`, `paths`,
`fairness`), where they are live-tunable. What enemies are weak to, and the
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
  minimum and a maximum distance) and, for shots and lanes, in sight. It
  picks at random by the attacks' weights (from the run's seeded random
  numbers, so a run replays exactly).
- An attack can name a **follow-up**: the attack that starts right after
  its recovery, with no cooldown, if it can start then. That is a combo
  (the Chaser's lunge into a swipe into a slash; the Charger's charge and
  its return). An attack with no weight is only ever a follow-up.
- An attack's **aim follows the target** from the start of its windup until
  it locks (`aimLock` before it lands; at the start by default). The
  telegraph is dim while it follows and bright once it locks: the moment to
  move. An attack can **lead** a running target, aiming where her run would
  take her by the time it lands (at most at her running speed: a dash does
  not throw it off), so running in a straight line is not a defense.
- Enemies **stand their ground** while attacking, unmoved by the crowd, so
  the attack lands where its telegraph showed. A blow can still push them;
  a charge's lane moves with its charger.

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

1. **Commitment on the player's side.** Characters move at full speed while
   attacking, so a player can swing and walk away at once, which takes
   much of the danger out of melee range. Whether attacking should slow
   or root her (and how much, per move) is a question about characters,
   not enemies.
