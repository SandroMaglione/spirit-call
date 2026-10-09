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
level's. It may change her traits (her dash, her weight, the energy she
gains), and a **trade-off** relic gives more at a price: blows on her hurt
more, her dashes come back slower, each dash is shorter.

Relics are allowed a little power (a ring hurts a little; a bonus adds a
little), never much: **a relic changes how a fight plays, barely how
much damage it deals**. `validateContent` holds every tier to one budget
(`relicBudget`), its **worth** (`relicWorth`) at most 20% of her damage:

- a damage bonus counts by how often it holds (always: all of it; on
  enemies in a state: 60%; on stunned or broken ones: 30%; while she is
  below half her health: 35%; on her counter: 10%);
- a cost counts against it (blows on her dealing 20% more take 20);
- a trait counts as a body's traits do (`bodyRules.personality`: a quarter
  of her dash and weight together), and energy at half.

So a trade-off can give more because it costs something: Glass Edge's 20%
more damage is worth nothing once blows on her deal 20% more too. On top,
damage bonuses add up to 40% at most, effects deal 12% of her ATK at most,
anything set off by something frequent (a kill, a move, a dash) goes off at
most once every half second, and a heal gives 5% at most, once a second at
most. Content is balanced with no relics at all, and the plain aspects with
no relics clear everything.

## Slots

Each character has one relic per slot, so a relic only competes with the
others of its slot: two Strike relics never stack.

| Slot | Reacts to | Names an element |
|---|---|---|
| **Strike** | her blows: their targets (in a state, stunned or broken, wounded, unhurt), her combo's moves, her counter, kills | no: what it sets off carries none, or hers at its top tier |
| **Dash** | her dashes, her perfect dodges, kills and breaks that give a dash back | no, the same |
| **Element** | anything, with her element's own trick | yes: **its own element**; only characters of it equip it |
| **Survival** | (opens after the Brute King, the end of chapter 3) healing, a fall prevented | — |

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
- The **Survival** slot opens after the Brute King (`survivalOpensAfter`),
  the middle of the main line, with its relics.

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

What a look looks like is `presentation/looks.ts` (`cosmeticLooks`), keyed
by its id: a tint turns every color of the spirit round the color wheel
(her vertex colors, her glow from within, her halo, and her drops, on a
copy of her own), a trail is a set of drop colors and kind. The account's
looks are handed to the presentation as they change (`wearLooks`), so the
arena and the menu's models draw her as she wears them.

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
- **Featherstep** (a trade-off): one dash more, each 25% shorter; then they
  come back faster; then a perfect dodge sends out a ring.
- **Anchor** (a trade-off): 80% heavier, her dashes come back 30% slower;
  then blows on her deal 10% less; then a perfect dodge stamps the ground,
  throwing enemies far back.

- **Glass Edge** (a trade-off): blows deal 20% more, and blows on her 20%
  more too; then 15% more to stunned or broken enemies; then a kill of an
  enemy in a state sends out a ring.
- **Last Stand**: below half her health, her blows deal 25% more; then 15%
  more below a quarter; then a kill gives a dash back.
- **Overflow** (a trade-off): 25% more energy, and blows on her deal 15%
  more; then more energy at each tier.

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

**Survival**

- **Second Wind**: once a run, a blow that would fell her leaves her at 20%
  health, untouchable a moment; then a perfect dodge heals 2%; then the
  second wind leaves her at 40%.
- **Mending Step**: a perfect dodge heals 3%; then a kill heals 1%; then a
  perfect dodge heals 2% more.

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
