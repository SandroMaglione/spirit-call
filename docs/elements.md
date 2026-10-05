# Elements

How effects work: the rules behind the preparation layer of
`docs/vision.md` (which characters, which effects, against which enemies).
Like the vision, this records intentions and rules, not implementation;
numbers live in `src/content/`, where they are live-tunable. Anything not
settled here is in the open questions at the end: ask, do not guess.

## Principles

- **Works alone, better together.** Every element does its whole job on
  its own: a team of one element is never missing a piece. Two elements
  together do more than either alone, in any pair and in either order, and
  no element ever needs another to work.
- **One rule, not a table.** How elements meet is a single rule that holds
  for every pair (see "The rule"). Nothing is written for a pair of
  elements, so a new element is two definitions, never one per element
  already in the game, and the player learns one rule, not a matrix.
- **Designed around enemies.** Each element does a job against a kind of
  enemy situation (packs, fast enemies, spread-out groups, tanky ones). A
  strategy is matching the team's elements to the enemies you will face.
- **An element belongs to a character**: her special and ultimate apply
  it, and her aspect may give one moment of her basic attack to it (see
  `docs/aspects.md`). Aspects never name an element.
- **Each state changes something different about a fight** (damage over
  time, speed, spreading, position, the break bar, ...). Two elements whose
  states do the same thing are one element: this is what keeps a long list
  of elements distinct.
- **Readable at a glance.** A state shows on the body that holds it, as a
  ring and an icon in its color, and a burst is seen as it happens. What
  you see on an enemy tells you what hitting it will do.

## The rule

1. **Every element leaves its state.** A blow carrying an element puts its
   state on the body it hits. A body holds **one state at a time**; the
   same element again refreshes it.
2. **A different element bursts it.** A blow carrying another element on a
   body in a state sets that state off at once (its **burst**), which spends
   it; then the new element leaves its own state.

So every element defines exactly two things: **its state** (what it does
alone, its job) and **its burst** (that state, paid out at once). The burst
belongs to the state on the body, never to the element that set it off:
the player reads it from what she sees.

Bursts never chain: what a burst deals carries no element, so it sets off
no other burst and leaves no state.

## The elements

| Element | Job | Its state (alone) | Its burst |
|---|---|---|---|
| **Fire** | Dense packs | **Burning**: damage over time, spreading to the bodies it touches | **Flare**: the burn left, dealt at once, to it and the bodies around it |
| **Water** | Fast enemies | **Soaked**: slowed | **Splash**: it and the bodies around it stop for a moment |
| **Thunder** | Spread-out groups, enemies at range | **Charged**: a blow on it arcs on to the nearest body of its side, with a share of the damage, charging it | **Discharge**: thunder strikes the bodies around it |
| **Wind** | Groups to scatter or bunch up | **Swept**: light, pushed further and gliding; slammed into a wall, stunned | **Gale**: it is launched along the blow, the bodies around it thrown away from it, all stunned a moment |
| **Rock** (later) | Tanky enemies | **Cracked**: its break bar fills faster | **Shatter**: a large share of its break bar at once |

Wind's push or pull is the kit's choice (a Gust throws out, a Cyclone
draws in): Swept only makes a body light. Thunder's strikes jump between
bodies as far as a skill says, on top of Charged.

Every character applies her own element: each one can build on her own
state alone, and each pair of characters gets bursts on top. For example,
the Stormcaller charges a spread-out group, and her blows arc between them;
with the Tidecaller, thunder on soaked enemies splashes the whole group to
a stop, and leaves it charged.

### Adding an element

A new element brings:

1. **Its job**: the enemy situation it answers, not already answered the
   same way.
2. **Its state**: what it does alone, changing something no other state
   changes.
3. **Its burst**: that state, paid out at once, around the body.
4. Its color and icon, and the enemies weak to it, resisting, or immune.

Nothing already in the game changes: every aspect, skill, and element
works with it from the start.

## Healing

The Stormcaller heals through her kit, and healing always costs something:

- **Her Spark Totem** is planted at her feet and zaps once a second for a
  few seconds, within one reach for healing and striking alike. A zap heals
  the character on the field when she is within that reach and hurt;
  otherwise it strikes the nearest enemy within it. Staying by the totem
  heals and costs its damage; stepping out lets it fight. An enemy
  stepping into its reach is zapped and thrown back out, so it is also a
  ring to fight from.
- **It keeps going off the field**: switched out, the Stormcaller's totem
  keeps zapping for whoever is on the field (what a character released
  finishes on its own).
- **Her Thunderclap** heals the whole team, the bench included, so the
  health of the characters waiting is worth looking after.

## Ground

- Some skills leave their element on the ground where they land (a fire
  pool, a puddle), and arenas have pools of their own laid into the floor
  (fire trenches, water basins) that never run out.
- **A pool holds its state for whoever stands in it**, either side, the
  player included (her own fire pool burns her too): it gives its state to
  a body in none, and refreshes it on a body already in it. It never bursts
  a state: only blows do. A dash carries a body through unharmed.
- **The newer pool wins**: a pool of another element laid over one puts it
  out where they meet (an arena's pool goes out for a while, then comes
  back). Arena pools never put each other out.
- Enemy pools are attacks like any other: warned before they can hurt,
  always avoidable (see "skill is enough" in the vision).

## The player

- **The player takes states too**, from enemy blows and pools: Burning
  hurts her over time, Soaked slows her, Swept makes her light (pushed
  further), and Charged has no one of her side to arc to.
- **Bursts on her deal their damage, never take control**: she is never
  stopped, stunned, or launched by one. Control stays with the player.
- **A state stays with the character** when she is switched out, and runs
  down on the bench: a character switched out burning keeps burning, and
  can fall there. Her switch button shows it.

## Enemies

- Each enemy kind can be **weak** to an element (more damage, and its state
  lasts longer), **resist** it (less damage, a shorter state), or be
  **immune** to it. **Immunity cancels the state, never the damage**: a
  fire-immune enemy does not burn, but the hit still lands, and no burst
  takes control of it. This keeps skill enough with any team.
- Enemies can **attack with an element**, putting its state on the player
  like any blow, and bursting the one she holds: the Shooter's close-range
  spray soaks her, the Sniper's bullet is thunder, the Firebomber's bombs
  set her burning and leave fire on the ground. Telegraphs and bolts are
  drawn in the element's color, and a quest lists the elements its enemies
  attack with.
- **Bursts fill break bars**: a burst on an enemy fills a share of its
  bar at once, like a wall slam.
- **Every enemy has at least two answers**, so no single element (or
  character) is required for a challenge.
- A quest shows the enemies it holds, with their weaknesses and immunities,
  before you enter.

## Numbers

- A burst is worth about the same for every state at the same moment:
  fire's leans to damage, water's and wind's to control, thunder's to
  reach. The lab measures them side by side.
- Weaknesses are modest: tens of percent, so the best case stays well
  under twice the damage. Strategy should feel worth it without becoming a
  requirement.
- Everything is live-tunable in `src/content/`.

## Open questions

1. **Tough enemies.** Whether elites and champions take a few elemental blows
   before a state holds (shown on the break bar's ring), rather than one.
2. **Reach.** How far fire spreads between bodies, and how far a charge
   arcs.
