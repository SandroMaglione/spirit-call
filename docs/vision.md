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
moves). You earn characters one at a time, in the order you choose, each
in an audition that teaches her kit, and skill is always enough: nothing
requires the newest character or the best aspect. It is a personal project, not a commercial one, and it
ships **complete**: every character, element, and challenge is in the
release, free, with nothing bought, nothing random, and nothing added
later. Everything can be owned in about 55 hours of play, and every
character taken to the top level in about 100.

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
  look, and feel (the excitement of earning one), not from narrative.
- **No collection for its own sake.** Little emphasis on equipment, items,
  and extras that do not directly change the strategy or how a fight plays.
  If it does not change a decision you make or how you play, it probably
  does not belong.
- **No commercial goals.** No monetization, no pressure mechanics, no large
  server infrastructure. It is an exploration for its own enjoyment; the code
  still stays clean and well built.
- **No live service.** No gacha, no banners, no events, no temporary
  content, no updates to wait for: the game is finished when it is
  released, and it runs on its own afterwards (see `playtest.md`,
  "Releasing").
- **The game runs on the device.** The account is a save on the player's
  device (see `saves.md`): no login, no account on a server, and nothing
  that needs a network, on the web and in a phone app alike. Until the
  release, playtest builds send what is played to one small Worker and
  database (Cloudflare), so play can be measured (see `playtest.md`); a
  release build sends nothing. (Until October 2026 the account lived on
  that server, behind a login.)

## Platform and controls

- **Phone first.** The touch controls (a stick on the left; attack, special,
  dash, and ultimate buttons on the right, laid out and sized as Genshin's,
  with icons rather than words; the team's party list above them) are the
  reference; keyboard and
  mouse are supported too. A mechanic that does not fit the touch layout
  needs a very good reason. A basic attack never asks for a point on the
  floor: it goes the way she aims (see `docs/aspects.md`, "Aiming on
  touch").
- Runs are around four minutes; menus and preparation should be quick on a
  phone as well.

## Characters

- **Each character owns her kit**: her element, her class, her special and
  her ultimate, and her own mechanics. Kits are designed as a whole; they
  are not assembled from a shared pool of skills.
- **Her body is hers too**: bulky or quick, hard-hitting or frail, so each
  one feels different to play, and all of them equally strong overall. Her
  stats spend one budget (see `docs/balance.md`, "Bodies"), set by her role
  (an attacker, a healer, a guardian: a healer's or a guardian's kit does
  part of what her stats would) and her class's range.
- **Three choices make her** (the rules are in `docs/roster.md`): her
  element, her class, and her role. None is tied to another, and two
  characters who share an element or a class always differ in role. An
  element is a direction, not a role: healing and guarding come from kits.
- **Support is set up.** A heal, a guard, or a buff is earned by something
  the player does in the fight (a combo, a hit, a skill placed, a blow
  timed), never by switching out, standing by, or having her on the team.
- **Discovery is the fun**, for players and for development alike: what is
  she strong at, what are her mechanics, which teams and matchups suit her.
- **Effects define strategy.** A character applies something (an element, a
  status) to enemies, or something to the team (healing, buffs), and that is
  what a strategy is built from.
- **Her basic attack is her class's, shaped by an aspect** (the rules are in
  `docs/aspects.md`). A class (Blade, Gun, Disc, Staff, and Gauntlets and
  Hammer with the release roster) is a way of fighting
  with its own range and rhythm, shared by every character of it. An aspect
  is one way of using that class (its combo, charged attack, and dash
  strike), owned by the account and equipped on one character of its class
  per team: it changes how she plays, never how strong she is.
  Characters appear as spirits that hold nothing, so an aspect is how she
  fights, not an item in her hands.
- **Relics add to how she plays** (the rules are in `docs/relics.md`): one
  per slot (Strike, Dash, Element, and Survival), each a reaction to
  something she does (a kill, a dash, a perfect dodge, a break) rather than
  a stat, in three tiers that each add something to see. An aspect is the
  pattern; a relic, a twist on it. Each relic is on one member per team.

## Elements

The rules are in `docs/elements.md`; in short:

- **Works alone, better together.** Every element does its whole job on its
  own; two together do more, in any pair, and none ever needs another.
- **One rule, not a table**, so the elements can grow to many: every element
  leaves its **state** on what it hits (one state per body), and a
  different element **bursts** that state, paying it out at once, then
  leaves its own. Each element defines only its state and its burst.
- **Designed around enemies.** Each element does a job against a kind of
  enemy situation (fire for packs, water for heavy hitters, thunder for
  spread-out groups, wind to scatter or group, rock for tanky enemies), and
  each state changes a different part of a fight. **A map** of those parts
  (`docs/elements.md`) holds the five elements, each on its own part:
  water, which slowed, now weakens what it soaks. The release has these
  five and no more.
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
  A relic works only while its character is on the field.
- **Falling.** When the character on the field falls, the next one in order
  comes in, with a moment of protection (she did not choose the moment). The
  fall is a beat of its own (about a second): the world nearly stops (the
  enemies crawl) and darkens at its edges, she comes apart into her
  element's light, and the next one stands held until she steps in; her protection
  counts from then. The run is lost when the whole team has fallen.
  There is no reviving.
- **The team is set up in the menu** (its order is the 1, 2, 3 and who
  starts), and **three more can be saved** and loaded in a tap, each with
  its aspects and relics.

## Structure

The game has two areas, and Extras for practice.

- **Quests**: where you gather resources and improve your kit, preparing for
  what is harder. A **main quest** line, plus **secondary quests** that mix
  what the main line has brought. Each chapter ends with a **champion**: one of the
  game's own enemies, much tougher, that stays through several waves (see
  "Champions" below). The rules are in `docs/quests.md`; in
  short:
  - **Each quest is a question.** A main quest brings in one new thing (an
    enemy, a hazard, elites, a champion, or an ability like a shield), shown
    first on its card, and later quests mix what came before. Nothing
    anywhere else (side quests, ranks, hardcore, practice) shows a thing
    before the main line brings it, but an audition, where meeting it
    first is the player's choice. You know what you will face before you
    enter.
  - **The main line is paced for the team you have**: chapter 1 is short
    and for the first character alone, and each chapter after brings its
    enemies to the team a new account has by then. The game grows by
    chapters; the roster is spread across them, not shown at once.
  - **Three stars** per quest, each a goal on top of the clear (a clear
    alone earns none), from a decent run to a clean one: never for speed,
    and never for bringing a character, an element, or a class (any team
    can earn every star). Every 3 stars open a **chest**.
  - **Ranks.** The main line and the side quests are replayed at higher
    ranks once the main line is done (rank II after its finale, rank III
    after rank II's): higher enemy levels and a twist on the waves, with
    their own first clears, stars, and chests, so the game is played
    again, harder, for rewards again. They are the game's second and third
    acts (see `docs/collection.md`).
  - The main line opens in order; nothing else gates it.
- **Hardcore**: combat waves, champions, and the more grinding challenges. These are the goals you
  are aiming to beat, where preparation and skill are tested fully. It is
  organized in **tiers** of mostly the same kind of content, each harder in
  every way (enemy levels, modifiers, and attack patterns), so lower tiers
  are within reach of a low-level team. Each tier opens along the main
  line, a few levels above the quest that opens it. **Every tier is a
  ruleset**: its own waves, a set of enemies, and a twist (burning floors,
  rock elites, Gunners leading every wave), so each is a new preparation
  puzzle rather than the tier below at a higher level. A tier's rewards
  are given once, the first time it is cleared. One track, **Until
  Fall**, never ends: every wave is stronger than the last, a goal wave
  clears the tier, and how far the team got is kept as its best.
- **Auditions**: how a character joins. Three quests played as her alone,
  at a fixed level, the last against a champion; winning makes her the
  account's (see `docs/collection.md`). The player chooses who comes
  next: milestones give invitations, and each opens the audition of the
  character it is given to. A harder fourth, her mastery, gives her tint.
- **Extras**, for practice: a Training Ground (dummies that never fall,
  one that breaks, one that swings to dodge, fire to push them into) and
  Enemy Practice (the enemies picked, all on the field together and coming
  back a few seconds after they fall, until the team falls; with elites,
  shields, and a champion, when asked, among what the player has met). Played at the team's own level, they record nothing: no
  experience, gold, or discoveries, so they are never the place to farm.
- **Champions: fought like bosses, built from the game's enemies.** Harder
  enemies with patterns to learn, not ever more of the swarm. A
  challenge's hardest enemy is a **champion**: one of the game's enemies
  made bigger, much tougher, stronger, and faster (its telegraphs never
  shorter), carrying an element like an elite, with its own mark. It
  fights like a boss: **its own attack patterns**, picked by **reading what
  the player does** (backing away, hiding behind a wall, standing still),
  and **phases by its health**, each opening with a roar and bringing new
  patterns. It keeps its kind's model (no model used a few times), and has
  no entrance or cutscene: the game stays fast. It stays across waves (the
  waves around it are light, and worn down to too little support it calls
  its own), and the challenge is cleared only once it has fallen too. Nothing about it is timed, and every hit stays
  avoidable. (Until October 2026 champions had no phases and fought as
  their kind did; the playtest found a focused fight more fun.)
- **Nothing is missable or timed.** There is no temporary content and no
  reset: everything stays where it is until it is played, so there is
  never pressure to log in.
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
  level, and the same body budget; it differs in effects and playstyle, not
  in numbers.
- Enemy levels are fixed per quest or tier (Until Fall's rise by the same
  amount each wave, for everyone); they never scale to the player.

## Progression

How everything is owned is in `docs/collection.md`; in short:

- **Each character has her own level**, which gives stats. There is no
  account level.
- **Characters grow by resources spent on them**, not by fighting with
  them (as in Genshin): nobody falls behind for sitting on the bench, and a
  new character catches up the same way.
- **The stat band**: 4x between level 1 and level 40, going on the same
  way to the cap of 60 (about 5.5x), the levels the ranks' replays reach.
- **Levels matter: the level gap.** On top of the stat band, a team below
  the enemies' level deals less and takes more for each level it is under
  (`progression.gap`, within bounds): ten levels under, every enemy takes
  about twice as long to fall and hits half as hard again. Under-levelled
  is a real struggle, never a wall: nothing is timed and every hit stays
  avoidable, so a skilled player still clears it, long and tense. Over the
  enemies' level gives only a little (no power creep, no trivial clears).
- **Fewer, tougher enemies.** Enemies have more health and hit harder than
  their kinds' numbers (`progression.enemies`), and only a few stand on
  the field at once (`waves.most`): pressure comes from harder enemies and
  champions, not floods. The first quests stay a place to learn: their
  enemies hit softer than their kinds, and their windups and waits run longer.
- **Growth stays simple:** character levels, and nothing else gives stats.
  Aspects change how she plays and have no levels. Relics (a closed set,
  slot by slot) add small reactions, not stats; their tiers add behavior,
  with a little power at most, held to one budget.
- **Two resources, both for levels.** **Gold** buys levels, from every run:
  a clear pays by its enemies' level, so the best place to earn is at the
  edge of what you can beat, and a loss pays its share of the progress
  (up to half a clear), so trying is never wasted. **Essence** pays the
  ascension steps between phases of ten levels, in three grades that
  follow the acts (her element's, then Refined, then Core), so a character
  goes only as far as the part of the game the player has reached. Nothing
  pays for kills or for speed. No stamina, no daily tasks, no weekly caps.
- **Everything else is a reward written on a card**: a character on an
  audition's last quest, an aspect on a first clear, a relic and its tiers
  on perfect clears, a look on a mastery audition, a rank, or a hardcore
  tier. Each comes from one place, shown before it is played, and never at
  random.
- **Pacing.** About 55 hours to own everything, about 100 to take all ten
  characters to 60; something new every three to five hours. Every level
  adds stats, so each run moves something forward.

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

## Settled for the release

What was open or "for later" before the game became a finished release,
and where it went:

| | |
|---|---|
| Hardcore rulesets | in the release: fixed, one per tier |
| Character trials | in the release, as auditions |
| Several saved teams | in the release: three |
| Reviving, temporary side quests, new elements, duplicates, off-field power beyond energy | never |
| The pace of pulls, gacha banners, duplicate rewards | gone with the gacha |
| Element details | as `docs/elements.md` has them |
