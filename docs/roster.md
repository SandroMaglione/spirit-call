# The roster

Who the game's characters are, and how a new one is chosen: the release
roster agreed in October 2026, and the rules that keep it, and the
characters after it, apart. Like the vision, this records intentions;
each character's numbers live in `src/content/characters.ts`, her kit in
`src/content/skills.ts`. The elements are in `elements.md`, the classes and
aspects in `aspects.md`.

## Three choices

Every character is three choices, made apart:

- **Her element**: what her blows leave on an enemy (`elements.md`).
- **Her class**: her range and rhythm (`aspects.md`).
- **Her role**: what her kit does for the team. An **Attacker** fights; a
  **Healer** keeps the team's health up; a **Guardian** stops blows before
  they land. (In code: `attacker`, `healer`, `guardian`.)

No element is tied to a role or a range, and no class to an element. **Two
characters who share an element or a class always differ in role**: a
second wind Blade who guards the team is a new way to play, a second wind
Blade who fights the same is not.

**An element is a direction, not a role.** Water's characters may lean to
looking after the team, fire's to damage, as Genshin's do, but nothing
forces it: healing and guarding come from a character's kit, never from
an element's state. So every element stays open to every role, and every
pair of characters still combines.

## Support is set up

A heal, a guard, or a buff is earned by something the player does in the
fight: a combo, a hit, a skill placed well, a blow timed. It never comes
from switching out, standing by, or simply having her on the team. Healers
differ in what their healing asks, guardians in what they stop:

| | Asks | Stops |
|---|---|---|
| Healer by hitting (the Tidecaller) | hitting the enemies she marked | |
| Healer by standing (the Stormcaller) | fighting by her totem | |
| Healer by burning (Hearth) | enemies kept burning, then her special | |
| Guardian by plates (Bastion) | raising them in a quiet moment | any blow, a few times |
| Guardian by bracing (Tidewarden) | the moment of a blow | one heavy blow |
| Guardian by barriers (Windwall) | where her wall stands | shots |

Health restored a minute is held about equal across healers, and blows
stopped a minute across guardians (`kitAudit`, see `balance.md`).

## The release roster

Ten characters, two of each element, always in different roles. Names
marked * are working names.

| Element | Character | Role | Class | How she plays |
|---|---|---|---|---|
| Wind | Swordsman | Attacker | Blade | a steady bruiser; the Gust throws a crowd off, the Cyclone draws it in |
| Wind | Windwall* | Guardian | Staff | wind walls that stop shots and push back what comes through |
| Fire | Gunner | Attacker | Gun | a glass cannon who kites |
| Fire | Hearth* | Healer | Hammer | keeps enemies burning, then turns their burns into the team's health |
| Water | Tidecaller | Healer | Disc | marks enemies, and heals by hitting them; her ultimate heals more for each one soaked |
| Water | Tidewarden* | Guardian | Blade | a brace that takes one blow whole and splashes the attacker |
| Thunder | Sparkfist* | Attacker | Gauntlets | the fast one: the Spark Step darts her through a line of enemies, charging them; the Storm Flurry hops her from one to the next |
| Thunder | Stormcaller | Healer | Staff | a totem to fight by, and a thunderclap that heals by what it strikes |
| Rock | Quarry* | Attacker | Hammer | the slow heavy hitter |
| Rock | Bastion | Guardian | Disc | the slow defender: stone plates |

Four attackers (wind, fire, thunder, rock), three healers (water, thunder,
fire), three guardians (rock, water, wind). Every body keeps to the one
budget (`bodyRules`): her role's share times her class's range's.

### Where they come from

The quests give one of each role, in an order that teaches the game:

| When | Who | Why |
|---|---|---|
| A new account | Swordsman (attacker) | chapter one alone teaches dodging and combos |
| End of chapter one (`packLeader`) | Tidecaller (healer) | chapter two teaches switching; healing softens fire floors and the Bulwark |
| End of chapter three (`bruteKing`) | Bastion (guardian) | chapter four brings Firebombers and shields |

The Spirit Call gives the other seven, the Gunner and the Stormcaller
among them. The quests' other rewards follow this team: their aspects are
Blade's and Disc's, and the trials open with its elements (wind, water,
rock), the others after. How the banners pair them, and how often a
character comes, is decided after the roster is in (see `calls.md`).

## Building it

One step at a time (a plan, approved, then a pull request), each measured
before and after (`pnpm lab`, `pnpm balance --matrix`, `pnpm expected`,
`pnpm progression`). New characters start with placeholder looks; their
models come separately (`models.md`, `spirits.md`).

1. **Measures**: the healer and guardian measures in `kitAudit`; the roles
   shown as Attacker, Healer, Guardian.
2. **Touch aiming**: no move aimed at a point on the floor (`aspects.md`).
3. **Water reworked**: its state moves from speed to how hard an enemy
   hits (`elements.md`, "The map").
4. **The quest team**: the Tidecaller a healer, Bastion from the quests
   and the Gunner from the Call, the quests' rewards to match, and every
   account reset (`server.md`).
5. **Gauntlets and Sparkfist.**
6. **Tidewarden** (a brace).
7. **Hammer and Quarry.**
8. **Hearth** (burns into health), and the Thunderclap reworked with her.
9. **Windwall** (barriers).
