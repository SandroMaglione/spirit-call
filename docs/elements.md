# Elements

How effects work: the rules behind the preparation layer of
`docs/vision.md` (which characters, which effects, against which enemies).
Like the vision, this records intentions and rules, not implementation;
numbers live in `src/content/`, where they are live-tunable. Anything not
settled here is in the open questions at the end: ask, do not guess.

## Principles

- **Designed around enemies.** Each element does a job against a kind of
  enemy situation (packs, fast enemies, tanky ones, enemies at range). A
  strategy is matching the team's elements to the enemies you will face.
- **An element belongs to a character, through her skills.** Her special and
  ultimate apply it; her basic attacks do not, for now (a skill may later
  lend its element to basic attacks for a while). Weapons do not carry
  elements: they change how she plays.
- **Interactions follow intuition.** Two elements interact only when
  real-world intuition predicts it (water conducts thunder, water puts out
  fire). If it would need a table to learn, it does not exist.
- **Behavior first, numbers second.** An interaction changes what happens
  (thunder reaches further, fire does not catch); a modest damage bonus or
  penalty comes on top, never a multiplier that a team must chase.
- **Some teams are weaker together, none is locked out.** Choosing elements
  that work against each other, or against the enemies, makes a challenge
  harder; it never makes it impossible (see immunities below).
- **Readable at a glance.** States show on bodies and on the ground, and
  every interaction is visible as it happens (steam, sparks, a gust).

## The elements

| Element | What it does | Answers | On the ground |
|---|---|---|---|
| **Fire** | Burns over time; spreads between bodies that touch | Dense packs | Fire pools |
| **Water** | Soaks and slows | Fast enemies | Puddles |
| **Thunder** | Instant damage that jumps between nearby bodies | Spread-out groups, enemies at range | None; electrifies puddles |
| **Wind** | Pushes or pulls (each character's kit decides which) | Groups to scatter or to bunch up | None; blows pools along |
| **Rock** | Breaks guard and staggers; raises pillars | Tanky enemies | Pillars that block shots and paths |

Fire and thunder both reach many enemies, in different ways: fire is slow
and spreads by contact, for packs pressed together; thunder is instant and
jumps gaps, for groups spread apart. Rock is about controlling the big
enemies (guard, stagger, terrain), not about damage on a single target:
that would be a damage race.

The first three, one per character: **Wind** for the Swordsman (the Blade
Wave already drives enemies back), **Fire** for the Gunner (the grenade
leaves a fire pool), and **Water** for the Tidecaller (a disc thrower at
middle range). Thunder and Rock come with later characters.

## States

- Only **water and fire last**: a body is **Soaked** (slowed) or **Burning**
  (damage over time, spreading to bodies it touches) for a visible
  duration. Applying the same state again refreshes it; states do not stack.
- Since water and fire cancel each other, a body has at most one state.
- **Thunder, wind, and rock act at once**: they leave no state of their own,
  and react with whatever state is already there.

## Interactions

- **Water against fire.** Water puts out Burning bodies and fire pools (with
  a puff of steam); a Soaked body does not catch fire, and fire deals less
  damage to it.
- **Thunder through water.** Thunder jumps further through Soaked bodies and
  deals more damage to them; on a puddle, it shocks everyone standing in it.
- **Wind carries states.** Bodies pushed into each other share their state,
  and wind drives a fire pool along its direction.
- **Wind into rock.** Bodies pushed by wind into a wall or a rock pillar are
  stunned.
- **Every other pair does nothing special.** Fire on a thundered enemy, rock
  on a soaked one: each simply does its own job.

## Ground effects

- Some skills leave an area of their element on the ground: the grenade
  leaves a fire pool, the Tidecaller leaves puddles.
- **They affect everyone standing in them**, enemies and the player alike,
  including the character who made them: a fire pool burns her too, a
  puddle soaks and slows her too. Player-made areas appear where she aims, so
  they are a known risk to place well, not a surprise.
- They react like bodies do: water puts out a fire pool, thunder shocks a
  puddle, wind blows a pool along. A Burning character can step into a
  puddle to put herself out.
- Enemy ground effects are attacks like any other: warned before they can
  hurt, always avoidable (see "skill is enough" in the vision).

## The player

- The player takes states too: Burning hurts her over time, Soaked slows
  her. The HUD shows her current state.

## Enemies

- Each enemy kind can be **weak** to an element (more damage, and a
  stronger effect), **resist** it (less damage, a weaker effect), or be
  **immune** to it. **Immunity cancels the effect, never the damage**: a
  fire-immune enemy does not burn, but the hit still lands. This keeps skill
  enough with any team.
- Enemies can **carry an element**: a soaked enemy is a ready setup for
  thunder; a burning one leaves fire behind for the player to avoid.
- **Every enemy has at least two answers**, so no single element (or
  character) is required for a challenge.
- A quest shows the enemies it holds, with their weaknesses and immunities,
  before you enter.

A first sketch for the current enemies, to settle while building:

| Enemy | Answers |
|---|---|
| Swarmer (packs) | Fire spreading through the pack; thunder |
| Chaser (runs at you) | Water to slow it; wind to scatter |
| Charger (charges down a lane) | Water to slow it; a rock pillar to charge into |
| Shooter, Sniper (keep their distance) | Wind to pull them in; thunder to reach them; rock pillars to block their shots |
| Brute (slow, heavy) | Rock to stagger it; immune to being pushed by wind |
| Guardian (frontal shield) | Ground effects (the shield blocks projectiles, not the floor); rock to break its guard |

## Numbers

- Damage from interactions and weaknesses is modest: tens of percent, so
  the best case (an interaction on a weak enemy) stays well under twice the
  damage. Strategy should feel worth it without becoming a requirement.
- Everything is live-tunable in `src/content/`.

## Open questions

1. **States and switching.** Does a character's state (Burning, Soaked)
   stay with her when she is switched out? To decide with the team rules.
2. **Elements on basic attacks.** Which skills, if any, lend their element
   to basic attacks, and for how long.
3. **Ultimates.** Ultimates are shared for now (the Nova, with no element);
   each character's own ultimate, with her element, comes with her kit.
4. **Reach of spreading.** How far fire spreads between bodies, and how
   strongly wind has to push for bodies to share a state or be stunned.
