# Game vision

What this game is meant to be, for anyone (human or agent) designing or
building it. It records intentions and constraints, not implementation. When
a design choice is unclear, decide it against the pillars and non-goals
below; when it is still unclear, it is an open question (listed at the end):
ask, do not guess.

## In one paragraph

A top-down action game for the phone, in short runs of about four minutes.
You pick a team of characters, each with her own kit and effects, and face a
known set of enemies: part of the challenge is preparing the right strategy
(which characters, which effects, against which enemies), and part is
executing it well (dodging out of a bad spot and striking back with a chain of
moves). You collect characters with the excitement of a gacha game, but skill
is always enough: nothing requires the newest character or the best aspect.
It is a personal project, not a commercial one.

## Pillars

1. **Every hit feels good.** Combat is the heart of the game: responsive
   controls, weight on every blow (hit-stop, recoil, knockback), and moves
   that chain into each other. The best moment is escaping a dangerous
   situation with a dodge and turning it into a counterattack built from a
   combination: a grenade knocks enemies back, a four-hit combo follows, a
   dash repositions, a finisher ends it. New content should make moments like
   this possible, not just add numbers.
2. **Short, sharp challenges.** A run lasts around four minutes (one minute is
   too short). Each challenge is built around a clear idea and a known set of
   enemies, playable in a spare moment on a phone, and instantly retried.
3. **Characters you want to master and collect.** Each character plays
   differently: her own kit and mechanics to discover. Getting a new
   character should feel like getting a new way to play, and the joy of
   discovering what she is strong at, which teams suit her, and which enemies
   she handles well or badly.

## Two layers of depth

- **Preparation (strategy).** Before a hard quest you know what you will face
  and choose a team, kits, and effects to counter it. Characters apply
  effects to enemies (elements, statuses) and to the team (healing, buffs),
  and enemies have strengths and weaknesses worth planning around.
- **Execution (skill).** In the fight: dodging, positioning, timing attacks,
  and chaining moves and effects into combinations. Skill must be able to
  make up for a weaker team.

## Non-goals

- **No power creep.** A skilled player can clear everything, including the
  hardest content, with early characters and plain aspects, even at a low
  level (in the extreme, by avoiding every attack for a long time). Newer or
  rarer things bring new options and playstyles, not a requirement to keep
  up.
- **No damage races (DPS checks).** Nothing fails you for not dealing damage
  fast enough: no clear-within-a-time goals, no enrage or healing timers, no
  shields that must be broken in a window, no enemies spawning on a timer
  regardless of how fast you kill them, and no rewards or records for
  clearing fast. These turn difficulty into a numbers requirement, which is
  power creep. Surviving a timer is not a goal either: clearing a challenge
  requires fighting, rather than escaping until time runs out.
- **No story focus.** The game is about dungeons, swarms of enemies, and
  beating challenges. Attachment to characters comes from how they play,
  look, and feel (the excitement of getting one, as in gacha games), not
  from narrative.
- **No collection for its own sake.** Little emphasis on equipment, items,
  and extras that do not directly change the strategy or how a fight plays.
  If it does not change a decision you make or how you play, it probably
  does not belong.
- **No commercial goals.** No monetization, no pressure mechanics, no large
  server infrastructure. It is an exploration for its own enjoyment; the code
  still stays clean and well built.

## Platform and controls

- **Phone first.** The touch controls (a stick on the left; attack, special,
  dash, and ultimate buttons on the right, laid out and sized as Genshin's,
  with icons rather than words; the team's party list above them) are the
  reference; keyboard and
  mouse are supported too. A mechanic that does not fit the touch layout
  needs a very good reason.
- Runs are around four minutes; menus and preparation should be quick on a
  phone as well.

## Characters

- **Each character owns her kit**: her element, her class, her special and
  her ultimate, and her own mechanics. Kits are designed as a whole; they
  are not assembled from a shared pool of skills.
- **Discovery is the fun**, for players and for development alike: what is
  she strong at, what are her mechanics, which teams and matchups suit her.
- **Effects define strategy.** A character applies something (an element, a
  status) to enemies, or something to the team (healing, buffs), and that is
  what a strategy is built from.
- **Her basic attack is her class's, shaped by an aspect** (the rules are in
  `docs/aspects.md`). A class (Blade, Gun, Disc, Staff) is a way of fighting
  with its own range and rhythm, shared by every character of it. An aspect
  is one way of using that class (its combo, charged attack, dash strike,
  and one passive), owned by the account and equipped on one character of
  its class per team: it changes how she plays, never how strong she is.
  Characters appear as spirits that hold nothing, so an aspect is how she
  fights, not an item in her hands.

## Elements

The rules are in `docs/elements.md`; in short:

- **Works alone, better together.** Every element does its whole job on its
  own; two together do more, in any pair, and none ever needs another.
- **One rule, not a table**, so the elements can grow to many: every element
  leaves its **state** on what it hits (one state per body), and a
  different element **bursts** that state, paying it out at once, then
  leaves its own. Each element defines only its state and its burst.
- **Designed around enemies.** Each element does a job against a kind of
  enemy situation (fire for packs, water for fast enemies, thunder for
  spread-out groups, wind to scatter or group, rock for tanky enemies), and
  each state changes something different about a fight.
- **An element belongs to a character**, applied through her skills and one
  moment of her aspect.
- **Ground effects** (fire pools, puddles) affect everyone standing in them,
  the player included.
- **Enemies are weak to, resist, or are immune to elements.** Immunity
  cancels the effect, never the damage, and every enemy has at least two
  answers, so no element is ever required. A quest shows its enemies and
  their traits before you enter.

## Teams

- **Three characters, switching** between them during a fight; one is on the
  field at a time. Each brings her own effects, so a team mixes them (for
  example one applies an element, another heals). A team can be smaller
  (an early account owns only one or two characters).
- **Switching is immediate**, with a short wait between switches (a
  second), and gives no protection: dodging is the dash's job. On touch,
  a party list as Genshin's: a row per character on the right, above the
  other buttons, and a tap on her row switches to her; once her ultimate is
  ready its icon shows beside her row, and a tap on it switches her in and
  uses it at once. 1, 2, 3 on the keyboard. No entrance attack, for now.
- A switch **interrupts** what the character was doing (an attack, a combo,
  a charge); not possible mid-dash. What she already released finishes on
  its own (a grenade lands, a disc keeps cutting, a totem keeps zapping); a disc on its way back
  disappears if its thrower is no longer on the field.
- The incoming character appears where the last one stood, facing the same
  way, with none of her push.
- **Each character keeps her own** health, skill cooldowns, ultimate
  energy, and state (see `docs/elements.md`). Cooldowns run on the bench;
  benched characters gain a share of the energy the one on the field earns.
  An aspect's passive works only while its character is on the field.
- **Falling.** When the character on the field falls, the next one in order
  comes in, with a moment of protection (she did not choose the moment). The
  fall is seen (she goes down before the next one appears), but the switch
  itself is immediate. The
  run is lost when the whole team has fallen. Reviving is for later.
- **One team is saved**, set up in the menu (its order is the 1, 2, 3 and
  who starts); several saved teams may come later.

## Structure

The game has two areas, and Extras for practice.

- **Quests**: where you gather resources and improve your kit, preparing for
  what is harder. A **main quest** line, plus **secondary quests** that can
  be temporary and take various formats, while keeping the quest shape
  (chapters, a clear end). Each chapter ends with a **champion**: one of the
  game's own enemies, much tougher, that stays through several waves (see
  "Champions, not bosses" below).
- **Hardcore**: combat waves, champions, and the more grinding challenges. These are the goals you
  are aiming to beat, where preparation and skill are tested fully. It is
  organized in **tiers** of mostly the same kind of content, each harder in
  every way (enemy levels, modifiers, and attack patterns), so lower tiers
  are within reach of a low-level team. A tier's resources are given the
  first time it is cleared; a **periodic reset** makes them available again,
  possibly in a different format. One track, **Until Fall**, never ends:
  every wave is stronger than the last, a goal wave clears the tier, and
  how far the team got is kept as its best.
- **Extras**, for practice: a Training Ground (dummies that never fall,
  one that breaks, one that swings to dodge, fire to push them into) and
  Enemy Practice (the enemies picked, all on the field together and coming
  back a few seconds after they fall, until the team falls; with elites, and
  a champion, when asked). Played at the team's own level, they record nothing: no
  experience, gold, or discoveries, so they are never the place to farm.
- **Champions, not bosses.** The game is fast and crowded, and its
  elements push, pull, and hold bodies around: a slow, scripted boss with
  its own model, phases, and entrances fits neither, and costs a model used
  a few times. Instead, a challenge's hardest enemy is a **champion**: one
  of the game's enemies made bigger, much tougher, stronger, and faster
  (its telegraphs never shorter), carrying an element like an elite, with
  its own mark. It has no phases or scripted moments: it fights as its kind
  does. It stays across waves (the next wave comes while it stands), so it
  takes several waves' worth of fighting to bring down, and the challenge
  is cleared only once it has fallen too. Nothing about it is timed.
- **Nothing is missable.** Temporary content rotates back later, and
  periodic resets only restock rewards: anything skipped can be had another
  time, so there is never pressure to log in.
- **Replay value comes from rising difficulty**: lasting longer, or enemies
  hitting harder and coming in greater numbers. It never comes from
  mechanics that push toward power creep.

## What makes "skill is enough" work

- Every hit in hard content is avoidable with perfect play: readable
  warnings, a fair way out, no unavoidable damage.
- Stats scale within a narrow band: the strongest build is a few times
  stronger than the weakest, not orders of magnitude, so a skilled low-level
  clear is long but possible. The band's size is a deliberate number.
- New content follows the same stat curves as old content of its rarity and
  level; it differs in effects and playstyle, not in numbers.
- Enemy levels are fixed per quest or tier (Until Fall's rise by the same
  amount each wave, for everyone); they never scale to the player.

## Progression

Decided so far (the rest is in the open questions):

- **Two kinds of level.** The **account level** rises by playing, in every
  mode, and paces the game: later quests **require** an account level. The
  gate is there to encourage trying the other modes rather than grinding
  quests one after another; it is about progress, not power, so it never
  checks the characters' levels (a skilled player can enter with a
  low-level team). Each **character has her own level**, which gives stats.
- **Characters grow by resources spent on them**, not by fighting with
  them (as in Genshin): nobody falls behind for sitting on the bench, and a
  new character catches up the same way. Playing earns the resources, and
  account experience.
- **The stat band is to be set later**: roughly 4x between level 1 and the
  maximum sounds right, to confirm once there is content to measure it on.
- **Growth stays simple:** character levels, and nothing else gives stats.
  Aspects change how she plays and have no levels. A closed set of
  accessories may come later, only if the collecting side gets dull.
- **Two currencies:** one for pulls (crystals), one for upgrades (gold,
  for leveling characters), so it is always clear where each
  comes from.
- **Gold comes from every run.** A clear pays by its enemies' level, so
  the best place to earn is at the edge of what you can beat: rising
  difficulty is the reason to replay, and a skilled player taking a
  weaker team into harder content earns more. A loss pays its share of the
  progress made (waves cleared), up to half of a clear, so
  trying is never wasted. Nothing pays for kills or for speed. No stamina,
  no daily tasks, no weekly caps: play as much or as little as you like.
- **Crystals come from milestones only**, never from repeating content: a
  quest's first clear, a hardcore tier once per period, account levels, a
  short list of **discoveries** (the first clear with each character, with
  a full team, the first burst of each element's state), and later
  duplicates. New characters come at the pace of progress, not of grinding.
  Discoveries stay few, and each one points at something worth trying.
- First clears and hardcore tiers also give gold worth several runs: goals
  on top of the steady income.
- **Pacing is slow, as in Genshin, but every step shows.** Maxing one
  character takes on the order of 200 runs (about 15 hours)
  at content of her level, and a whole team several times that. The first
  levels take a run or less each, the last ones several runs; every level
  adds stats, so each run moves something forward.

## The gacha

- **Every pull is meaningful.** The opposite of pools where most results
  are thrown away: fewer results per pull (even a single one), but each one
  worth having. The pool holds only things that matter, and a result you
  already own still turns into progress (see duplicates).
- **What it can give:** characters (the main excitement: a new way to play),
  aspects, resources, and cosmetics.
- **Duplicates never add raw power.** Direction (details to settle): a
  duplicate character unlocks a skin, a duplicate aspect a variant of its
  look, and further ones convert into currency.
- It sits inside the stat band like everything else: pulls help reach the
  cap sooner and bring new playstyles, never a higher ceiling.

## Rules of thumb for design and implementation

- A new character, aspect, or effect must be beatable content's peer, never
  its requirement: check the hardest content stays clearable without it.
- Prefer new options over bigger numbers (horizontal over vertical).
- Prefer mechanics that create combinations with others (knockback into a
  combo, a status another character exploits) over isolated effects.
- A new enemy should ask a question of the player's preparation or skill.
- Keep everything playable with the touch controls.
- Content is data (see `src/content/`); new kinds of effects, conditions, or
  objectives are small additions to the shared vocabulary, which is kept
  small and readable.

## Open questions

Decided directions are above; these are not decided yet.

1. **Progression details**, to settle while building: the stat band (about
   4x), how generous pulls are (a pull's price in crystals) and how bad
   luck is protected (a guarantee after a number of pulls, or a way to get a
   specific thing directly), the exact duplicate rewards, the formats of
   secondary quests, and how pulls stay meaningful once a player owns most
   things.
2. **Element details**: the open questions at the end of `docs/elements.md`.
3. **Team details**, for later: reviving a fallen character, several saved
   teams, and whether off-field characters contribute more than energy.
