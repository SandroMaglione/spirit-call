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
| **Aspect** | the account, equipped on one character of its class per team | her combo, charged attack, dash strike, and what they set off |
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
| **Gauntlets** | very close | fast strings built around the dash | a landed blow takes time off her dash's recharge (once a move, however many it hits), and her dash strike keeps the combo's place: dash out of a blow, dash back in, finish the string |
| **Hammer** | close, reaching to middle | slow, heavy blows | every blow of the combo and the charged attack (not the dash strike) winds up, then comes down on a wide circle a little way ahead of her, where she aimed as she swung: she strikes where the crowd will be, and is open while it falls |

A class handles the same for every character of it (how long a combo
waits for the next press, how she slows while attacking, how long the
charged attack holds), so knowing a class is knowing how a new character
of it moves.

(The roster first gave the Gauntlets "a dash cancels the combo's
recovery": every class's dash already does, so the Gauntlets weave
instead. Their dash strike stays everyone's.)

Characters who share a class always differ in role (`roster.md`, "Three
choices"): the Tidecaller and Bastion both throw discs, one to heal the
team, the other to guard it and break the toughest enemies, and the Disc
aspects go to whichever of them the team gives them to.

### Aiming on touch

**A basic attack never asks for a point on the floor.** On touch the
attack button is tapped and held, never dragged: it gives a direction (the
stick's, or the enemy the aim assist picked), not a place. So every move of
an aspect (its combo, charged attack, and dash strike) is aimed by its
direction: what flies goes that way, and what arcs lands at a set distance
along it, or on the enemy the assist picked. A mouse may still place it
where it points. Skills are different: their buttons are dragged, with
what they will cover drawn on the floor, so a skill may be placed. A class
whose basic attack needs a point to play well does not fit the touch
layout (`vision.md`, "Platform and controls").

## Aspects

An aspect is one whole way of using a class: its combo moves, its charged
attack, its dash strike, and **what its moves also set off**, when that is
part of the pattern (Whirlpool's finisher pushing back what is around her,
Lightning Rod's charged attack planting a rod). Every class has a **plain
aspect**, the one every character of it fights with when nothing else is
equipped: it is part of the class, not something to collect.

**The dash strike's shape is the aspect's, its damage everyone's.** An
attack during a dash (or just after it) is the aspect's own move (a lunge,
a spread, a bolt), but every dash strike deals one target the same
`dashStrikePower` (10% ATK, about one combo hit, split among a spread's
shots; a disc hits going and coming back), held by `validateContent`: it is
worth the recovery it cuts short, not its damage, so dashing to attack never
beats the combo. It is a rule of dashing, not a skill: the character screen
does not list it.

**An aspect is a pattern, never a bonus.** It has no passive: more damage
to enemies in a state, a counter that hits harder, a dash back on a kill
are relics' (see `relics.md`), chosen apart from the aspect. So an aspect
is only how she fights, and a player picks the one whose rhythm she likes.

**It gives one moment to her element**: one move (a combo move, the
finisher, the charged attack, the dash strike, the last round) or one thing
a move sets off carries her element. It puts her state on what it hits, or
bursts the state already there. One moment, never more: elements stay the
business of her skills.

It never names an element. On a character of another element the same
aspect plays the same, with her element in that moment: this is the only
way an aspect varies by element, and it needs nothing written for any
element.

Some aspects play on states (Riptide's discs bounce on between enemies in
one): every element leaves a state, so those are hers to make, and her
teammates' states count too.

### Rules

- **Different, never stronger.** Every aspect of a class deals about the
  same damage over a fight as its plain aspect, moved by its reach: one
  fighting closer (the Scattergun at 300 beside the Sidearm at 660) may
  deal more, one fighting further less (`reachShare`: the whole budget up
  to 150, falling in a line to 60% at 800). `validateContent` checks it from
  the numbers, within 15%; what changes is range, rhythm, risk, and what it
  is good against. The plain aspect clears everything.
- **No levels.** A character's level gives all her stats; an aspect has
  none to raise, and comes once.
- **No bonuses.** What a move sets off is part of its pattern; a bonus is a
  relic's.

## Owning and equipping

- The account **owns** aspects, one of each, each a first-clear reward:
  the main line's, an audition's, or a rank's finale (see
  `collection.md`). Owning one is enough for every character of its class.
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
  a blow is a heavy lunge that carries her element. For elites and
  armored enemies, weaker against a crowd.
- **Gathering Edge**: two slashes, then a spin that draws enemies in
  instead of throwing them out, carrying her element. Charged: a wide sweep
  that draws in. Keeps a pack together for the next combo, and for a
  teammate's skill.

### Gun

- **Sidearm** (plain): two quick shots and a spread, six rounds. Charged: a
  grenade lobbed over walls.
- **Scattergun**: short, wide spreads that knock back, four rounds.
  Charged: a point-blank blast carrying her element. In the middle of the
  pack.
- **Marksman**: slow shots that pierce, three rounds. Charged: a rail shot
  through every enemy in a line. Her last round carries her element. From
  afar, against enemies at range.

### Disc

- **Ring** (plain): two throws that cut there and back, then a pair in a
  V. Charged: a disc that hovers where it is aimed, spinning.
- **Riptide**: her discs bounce on between enemies in a state; the pair in
  a V carries her element. Feeds on states, hers or her team's.
- **Whirlpool**: every disc hovers a moment at the end of its throw.
  Charged: a disc that hovers long and draws enemies in, carrying her
  element. Her finisher pushes back what is around her. Holds ground.

### Gauntlets

- **Jab** (plain): a jab, another, a cross, and an uppercut that pops
  enemies away. Charged: a rushing straight. Dash strike: a straight.
- **Flurry**: four quick light blows, then a heavier one carrying her
  element. Charged: a spinning burst of blows all around her. More moves,
  so it feeds the dash most often. For a crowd up close.
- **Grapple**: two jabs, then a reaching grab that yanks what is in a line
  ahead to her, carrying her element. Charged: a slam where she stands.
  Dash strike: a grab that pulls in. Picks one enemy out of its group
  (Gathering Edge draws a whole pack in instead).

### Hammer

- **Quake** (plain): two overhead blows and a great one, each landing
  ahead of her. Charged: the greatest, widest blow. Dash strike: a
  shoulder charge.
- **Furrow**: narrower blows, each landing farther down her aim than the
  last; the last carries her element. Charged: a blow landing farthest.
  For a line of enemies, or one kept at a distance.
- **Tremor**: short, wide blows right in front of her; the last carries
  her element. Charged: the widest. For a crowd pressing in close.

Like every class's, a Hammer's opening blow never fells the smallest enemy
alone (`feel.test.ts`): its weight is in the later blows.

### Staff

- **Spark** (plain): two sparks that pierce the first enemy, then a pair
  in a V. Charged: a slow orb through a line of enemies.
- **Arc**: her bolts jump on to one more enemy nearby, with 60% of the
  damage; the pair in a V carries her element. For spread-out groups.
- **Lightning Rod**: her charged attack plants a rod that zaps the
  nearest enemy around it for a few seconds, carrying her element. A place
  to fight from.

## Adding

- **An aspect**: an entry in `content/aspects.ts` (its class, moves, what
  they set off, elemental moment), its id in `test/content-ids.json`, and a
  line here. What a move sets off is any skill effect (see
  `content/skills.ts`); no other aspect changes. Adding aspects is cheap:
  the work is a rhythm worth playing, within the damage budget.
- **A class**: an entry in `content/classes.ts` with its plain aspect, and
  its move shapes if they are new.
- **A character**: her element and class; every aspect of her class is
  hers to equip from the start.
