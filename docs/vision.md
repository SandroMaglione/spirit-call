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
is always enough: nothing requires the newest character or the best weapon.
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
  hardest content, with early characters and basic weapons. Newer or rarer
  things bring new options and playstyles, not a requirement to keep up.
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
  dash, and ultimate buttons on the right) are the reference; keyboard and
  mouse are supported too. A mechanic that does not fit the touch layout
  needs a very good reason.
- Runs are around four minutes; menus and preparation should be quick on a
  phone as well.

## Characters

- **Each character owns her kit**: her moveset, special, ultimate, and her own
  mechanics. Kits are designed as a whole; they are not assembled from a
  shared pool of skills.
- **Discovery is the fun**, for players and for development alike: what is
  she strong at, what are her mechanics, which teams and matchups suit her.
- **Effects define strategy.** A character applies something (an element, a
  status) to enemies, or something to the team (healing, buffs), and that is
  what a strategy is built from.
- Weapons belong to a character's type and change how she plays (their
  special effects), not just her numbers.

## Teams

- **Three characters, switching** between them during a fight; one is on the
  field at a time. Each brings her own effects, so a team mixes them (for
  example one applies an element, another heals).
- No entrance attack when switching in, for now.

## Structure

- **Quests** (grouped in chapters or not) are where you gather resources and
  improve your kit, preparing for what is harder.
- **Core challenges** are the hardcore sections: the goals you are aiming to
  beat, where preparation and skill are tested fully.
- **Currency** exists, at least for the gacha.
- **Replay value comes from rising difficulty**: lasting longer, or enemies
  hitting harder and coming in greater numbers. It never comes from
  mechanics that push toward power creep.

## Rules of thumb for design and implementation

- A new character, weapon, or effect must be beatable content's peer, never
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

1. **Progression without power creep.** What does "improving your kit" mean
   if power must not creep? Candidates: unlocks only (new characters,
   weapons, kit options), bounded growth (levels up to a cap that the hardest
   content assumes), or growth that the hardest content normalizes.
2. **Elements and statuses.** Which elements or statuses exist, what each
   does, and whether they combine (reactions) or stay independent.
3. **Enemy strengths and weaknesses.** How enemies resist or suffer effects,
   and how a quest tells you what you will face before you enter.
4. **Team rules.** How switching works on the touch controls, whether health
   is per character, what happens when one falls, and how off-field
   characters contribute (if at all).
5. **What the gacha gives and how.** What is obtained randomly versus
   earned directly, and what a duplicate gives, without adding power creep.
6. **What currencies and resources exist,** what each is for, and where each
   comes from.
7. **The shape of the core challenges**: a tower, boss fights, endless
   survival with rising difficulty, or a mix.
