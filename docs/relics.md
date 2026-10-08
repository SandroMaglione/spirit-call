# Relics

Small additions to how a character plays: the middle reward between a new
character or aspect and gold or materials. Like the vision and
`aspects.md`, this records intentions and rules; the relics themselves are
in `src/content/relics.ts`, where they are live-tunable.

## What a relic is

| | Changes | Never |
|---|---|---|
| **Aspect** (`aspects.md`) | the moves: her combo, charged attack, dash strike, and what they set off | a bonus |
| **Relic** | what happens around her moves: a reaction to something she does | a stat, or a move |

**An aspect changes the pattern, a relic reacts to an event.** A relic
reads something that happened (a blow landing on an enemy in a state, a
kill, a dash, a perfect dodge, a break, a move of her combo) and adds a
small effect: a ring that throws enemies back, a whirl, a puddle, a dash
given back, a little more damage on the blows it is about. It never
replaces a move, and it never gives HP, ATK, DEF, or speed: those are her
level's.

Relics are allowed a little power (a ring hurts a little; a bonus adds a
little), never much: **a relic changes how a fight plays, barely how
much damage it deals**. `validateContent` holds every tier to one budget
(`relicBudget`): damage bonuses that add up to 30% at most, effects that
deal 12% of her ATK at most, and anything set off by something frequent (a
kill, a move, a dash) at most once every half second. Content is balanced
with no relics at all, and the plain aspects with no relics clear
everything.

## Slots

Each character has one relic per slot, so a relic only competes with the
others of its slot: two Strike relics never stack.

| Slot | Reacts to | Names an element |
|---|---|---|
| **Strike** | her blows: their targets (in a state, stunned or broken, wounded, unhurt), her combo's moves, her counter, kills | no: what it sets off carries none, or hers at its top tier |
| **Dash** | her dashes, her perfect dodges, kills and breaks that give a dash back | no, the same |
| **Element** | anything, with her element's own trick | yes: **its own element**; only characters of it equip it |
| **Survival** | (later, opened by a main quest in the middle of the line) healing, a fall prevented | — |

**Healing is the Survival slot's alone**: no Strike, Dash, or Element relic
heals.

The Element slot is where an element gets what only it does: fire spreads
from what falls, water leaves puddles, wind throws gusts and gathers,
thunder passes on its charge, rock raises stone. An element with no pool
(rock, wind, thunder) gets a trick of its own instead of a trail.

## Tiers

A relic has three tiers. **Each tier keeps what the one before did and adds
something to see while playing**: a second trigger, a new effect, the
element at the top. Tiers add little power; they are three versions to
balance, not a curve. A later tier may also go off more often (Momentum III).

| Example: Echo (Strike) | |
|---|---|
| I | The last move of her combo sends out a ring that throws enemies back. |
| II | Her charged attack sends it out too. |
| III | The ring carries her element. |

## In a team

- The account **owns** relics, each at a tier.
- **In a team, a relic is on one character only**, like aspects: choosing
  who gets Momentum is part of the plan. It is equipped in the team (each
  build holds its own), so saved teams never compete for one.
- A relic works only while its character is on the field (a kill by
  something she left behind still counts: a totem, a disc on its way).
- What enters the arena goes through `withValidRelics` (each relic in a
  slot it fits, and on one member): quick-start links too
  (`?play&character=tidecaller&relics=echo:3,undertow`).

## Where relics come from

- **They open with the Spirit Call** (the end of chapter one,
  `relicRules.opensAfter`). Chapter one has none.
- **Quests** give the first ones: Echo with chapter two's first quest, and
  Momentum with the first side quest.
- **The Spirit Call** brings them often (its blue light, see `calls.md`):
  any relic, new at tier I, owned one tier up, and at tier III turned into
  dust (`relicRules.dustPerDuplicate`).
- **The shop** sells a relic the account owns one tier up, for dust
  (`relicRules.prices`): bad luck never keeps a tier out of reach.
- The **Survival** slot opens later, with its relics (`survivalOpensAfter`
  stays `null` until there are some).

## Dust

Dust is the shop's currency (`content/currencies.ts`), from **milestones
off the main line**: side quests' first clears and chests, ranks' first
clears and chests, hardcore tiers and trials once a period, and relics
called past tier III. A main quest's first clear pays none, and no run
pays it by itself, so dust follows progress and the Call stays the quick
way. Where dust comes in, a little gold (and no material) goes out.

## Looks

How a spirit shows, never how she fights (`content/cosmetics.ts`): a
**tint** recolors one character's spirit; a **trail** changes what any
spirit sheds as she moves. Each character wears one of each kind, in every
team. Each look comes from one place:

- **the shop**, for dust;
- **the Spirit Call**, as its own rose light, never twice;
- **a hard goal**: a few hardcore tiers give one with their first
  rewards (Until Fall's third tier, Brute Siege's second).

What a look looks like (its colors) is `presentation/looks.ts`, keyed by
its id.

## The relics

**Strike**

- **Opportunist**: more damage to enemies in a state; then to stunned or
  broken ones; then a kill among them throws the others back.
- **Echo**: the end of her combo sends out a ring that throws enemies back;
  then her charged attack too; then the ring carries her element.
- **Counterpoint**: her counter (the dash strike right after a perfect
  dodge) deals more; then sends a slash ahead; then the slash carries her
  element.

**Dash**

- **Repel**: a dash throws back what is around where she dashed from; then
  clears enemy shots there too; then carries her element.
- **Momentum**: a kill gives a dash back (once every few seconds); then a
  break too; then kills more often.
- **Afterimage**: a perfect dodge leaves a whirl where she stood, pulling
  enemies in; then the whirl strikes; then it carries her element.

**Element**

- **Ember Heart** (fire): burning enemies she kills burst into flame; then
  leave fire on the ground; then her perfect dodges burst too.
- **Undertow** (water): her dashes leave puddles; then soaked enemies she
  kills splash; then a perfect dodge leaves a whirlpool.
- **Tailwind** (wind): a perfect dodge throws a gust; then swept enemies she
  kills leave a gathering whirl; then her dashes gust too.
- **Static Charge** (thunder): charged enemies she kills discharge into the
  two nearest; then the strikes jump on; then breaks discharge too, stunning.
- **Bedrock** (rock): a break raises a rock by the enemy; then cracked enemies
  she kills shatter, cracking those around; then a break raises three.

## Adding

- **A relic**: an entry in `content/relics.ts` (its slot, element for the
  Element slot, three tiers of passives), its id in
  `test/content-ids.json`, and a line here. `validateContent` checks its
  slot, element, budget, and tiers. It joins the Call at once.
- **A look**: an entry in `content/cosmetics.ts` (its kind, whose, where
  it comes from), its colors in `presentation/looks.ts`, and its id in
  `test/content-ids.json`.
- **A new kind of trigger, condition, or effect**: one case in
  `content/passives.ts`, where it is carried out
  (`features/passives.ts`), its words in `ui/describe.ts`, and its check in
  `validateContent`. Aspects use the same vocabulary for what their moves
  set off.
