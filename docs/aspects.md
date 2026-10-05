# Classes and aspects

How a character's basic attack is built: her **class** (fixed), and the
**aspect** she fights with (chosen before a run). Like the vision, this
records intentions and rules; numbers live in `src/content/`
(`classes.ts`, `aspects.ts`), where they are live-tunable.

## What is whose

| | Owned by | Decides |
|---|---|---|
| **Character** | herself | her element, her class, her special and ultimate (no one else has them) |
| **Class** | every character of it | range, rhythm, handling, and one mechanic of its own |
| **Aspect** | the account, equipped on one character of its class per team | her combo, charged attack, dash strike, and one passive |
| **Element** | the character | what her skills apply, and what her aspect's elemental moment carries (see `docs/elements.md`) |

Characters appear in the arena as spirits that hold nothing: an aspect is
not an item in her hands, it is how she fights. Its look is the shape of
her attacks (a crescent, a spread, a ring), in her element's color.

## Classes

A class is a way of fighting with its own rhythm and range; a new one
comes only for a new rhythm, never for a new look. **A class's own
mechanic names no element**: it plays the same in every element.

| Class | Range | Rhythm | Its own mechanic |
|---|---|---|---|
| **Blade** | close | a four-move combo that lunges in | closes the distance; the finisher launches; breaks soonest |
| **Gun** | long | quick shots | a magazine: the charged attack spends what is left, then a reload |
| **Disc** | middle | throws that come back | a disc hits on the way out and again on the way back |
| **Staff** | middle to long | slower bolts | bolts pierce a line; the charged bolt goes through many |

A class handles the same for every character of it (how long a combo
waits for the next press, how she slows while attacking, how long the
charged attack holds), so knowing a class is knowing how a new character
of it moves. Candidates for later classes: a lob (arcing blasts over
walls) and gauntlets (very close and fast, around the dash).

One character per class and element, unless her role is clearly
different (a second wind Blade who supports the team is a new way to play;
a second wind Blade who fights the same is not).

## Aspects

An aspect is one whole way of using a class: its combo moves, its charged
attack, its dash strike, and **one passive**. Every class has a **plain
aspect**, the one every character of it fights with when nothing else is
equipped: it has no passive, and it is part of the class, not something
to collect.

**An aspect does only two things beyond its moves:**

1. **It reads facts that belong to no element**: the target is in a state
   (any one, whoever set it), is stunned, broken, or wounded; she just
   made a perfect dodge; it is the last round of the magazine; which move
   of the combo this is; a kill.
2. **It gives one moment to her element**: one move (a combo move, the
   finisher, the charged attack, the dash strike, the last round) or one
   thing its passive sets off carries her element. It puts her state on
   what it hits, or bursts the state already there. One moment, never
   more: elements stay the business of her skills.

It never names an element. On a character of another element the same
aspect plays the same, with her element in that moment: this is the only
way an aspect varies by element, and it needs nothing written for any
element.

Every character can feed an aspect alone: every element leaves a state, so
"enemies in a state" are hers to make, and her teammates' states count too.

### Rules

- **Different, never stronger.** Every aspect of a class deals about the
  same damage over a fight as its plain aspect (`validateContent` checks it
  from the numbers); what changes is range, rhythm, risk, and what it is
  good against. The plain aspect clears everything.
- **No levels.** A character's level gives all her stats; an aspect has
  none to raise, and a duplicate never adds power.
- **Its passive is effective only while she is on the field.**

## Owning and equipping

- The account **owns** aspects, one of each: quests unlock them (and the
  gacha, later). Owning one is enough for every character of its class.
- **In a team, an aspect is on one character only**: no fight has the same
  aspect twice. It is equipped in the team (each build holds its own), so
  saved teams never compete for one.
- One check (`teamProblems`, in `account/account.ts`) holds these rules:
  the aspect is owned, of her class, and once in the team. Equipping, a
  save loaded, and every start of a run (quick-start links too) go
  through it.

## The aspects

### Blade

- **Edge** (plain): a slash, a backhand, a thrust, and a spin that
  launches. Charged: a lunging stab. Dash strike: a lunging thrust.
- **Duelist**: three thrusts, each harder than the last. Charged: a long
  lunge. **Counter**: her dash strike out of a dash that perfectly dodged
  a blow is a heavy blow that deals double, and carries her element. For
  elites and armored enemies, weaker against a crowd.
- **Gathering Edge**: two slashes, then a spin that draws enemies in
  instead of throwing them out, carrying her element. Charged: a wide sweep
  that draws in. Her blows deal more to enemies in a state. Keeps a pack
  together for the next combo, and for a teammate's skill.

### Gun

- **Sidearm** (plain): two quick shots and a spread, six rounds. Charged: a
  grenade lobbed over walls.
- **Scattergun**: short, wide spreads that knock back, four rounds.
  Charged: a point-blank blast carrying her element. Each kill heals her a
  little. In the middle of the pack.
- **Marksman**: slow shots that pierce, three rounds. Charged: a rail shot
  through every enemy in a line. Her last round carries her element; her
  shots deal more to the wounded. From afar, against enemies at range.

### Disc

- **Ring** (plain): two throws that cut there and back, then a pair in a
  V. Charged: a disc that hovers where it is aimed, spinning.
- **Riptide**: her discs bounce on between enemies in a state, and deal
  more to them; the pair in a V carries her element. Feeds on states,
  hers or her team's.
- **Whirlpool**: every disc hovers a moment at the end of its throw.
  Charged: a disc that hovers long and draws enemies in, carrying her
  element. Her finisher pushes back what is around her. Holds ground.

### Staff

- **Spark** (plain): two sparks that pierce the first enemy, then a pair
  in a V. Charged: a slow orb through a line of enemies.
- **Arc**: her bolts jump on to one more enemy nearby, with 60% of the
  damage; the pair in a V carries her element. For spread-out groups.
- **Lightning Rod**: her charged attack plants a rod that zaps the
  nearest enemy around it for a few seconds, carrying her element; her
  sparks deal more to enemies in a state. A place to fight from.

## Adding

- **An aspect**: an entry in `content/aspects.ts` (its class, moves,
  passive, elemental moment), its id in `test/content-ids.json`, and its
  icon. A new kind of fact or effect for passives is one new case in
  `content/passives.ts` and the system that carries it out; no other
  aspect changes.
- **A class**: an entry in `content/classes.ts` with its plain aspect, and
  its move shapes if they are new.
- **A character**: her element and class; every aspect of her class is
  hers to equip from the start.
