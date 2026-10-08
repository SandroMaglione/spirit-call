# Enemies

How enemies fight: the rules behind the execution layer of
`docs/vision.md` (dodging, positioning, timing). Like the vision, this
records intentions and rules, not implementation; numbers live in
`src/content/enemies.ts` and `src/config/tuning.ts` (`crowd`, `paths`,
`fairness`, `breaking`, `perfectDodge`, `waves`, `elites`, `hazards`), where
they are live-tunable; arenas are `src/content/arena.ts`. What enemies are weak to, and the
elements they attack with, are in `docs/elements.md`.

## Principles

- **A new enemy asks a question** of the player's preparation or skill
  (`docs/vision.md`). Its moveset is the question: what it punishes
  (standing still, keeping just out of reach, running in a straight line,
  hugging it) and what answers it.
- **Every hit is avoidable with perfect play.** Every attack is
  telegraphed with exactly the area it will hit, and its aim stops moving
  at least `fairness.minTelegraph` (0.3 s) before it lands: the fairness
  floor, checked by `validateContent`. Nothing that makes enemies harder
  (a hardcore tier, a modifier) may go below it.
- **Pressure comes from enemies working together**, not from unreadable
  attacks: more of them engaging at once, attacks covering each other's
  escape routes, elements that combine. The crowd's rhythm keeps it
  readable (below).

## Movesets

- An enemy has one or more **attacks**. When it may attack, it picks one
  of those that can start: the target within the attack's range (a
  minimum and a maximum distance) and, for shots, in sight (a bomb is
  lobbed over walls). It
  picks at random by the attacks' weights (from the run's seeded random
  numbers, so a run replays exactly).
- An attack can name a **follow-up**: the attack that starts right after
  its recovery, with no cooldown, if it can start then. That is a combo
  (the Chaser's swipe into a slash). An attack with no weight is only ever
  a follow-up.
- An attack's **aim follows the target** from the start of its windup until
  it locks (`aimLock` before it lands; at the start by default). The
  telegraph is dim while it follows and bright once it locks: the moment to
  move. An attack can **lead** a running target, aiming where her run would
  take her by the time it lands (at most at her running speed: a dash does
  not throw it off), so running in a straight line is not a defense.
- Enemies **stand their ground** while attacking, unmoved by the crowd, so
  the attack lands where its telegraph showed. A blow can still push them,
  and what they committed to goes with them: a swing or a lane starts from
  where they stand, a slam comes back within reach, and a swing already out
  moves with them. Pushing an attacker away is a defense.
- **Enemies attack from where they stand**: a swipe, a slam, a shot, a
  lobbed bomb. None dashes along a lane at the player (the playtests found
  a telegraphed slide unpleasant to face); the `charge` and `beam` attack
  kinds stay in the vocabulary, unused. Ranged attacks are things in
  flight the player can see coming and step out of: the Sniper fires a fast
  bullet, the Firebomber lobs bombs whose landing ring shows from the
  windup until they burst.

- **Some enemies change the fight around them** rather than hit harder:
  - **The Warden wards an ally** (the one nearest the player): a tether
    that forms over a moment, after which that ally takes only a share of
    its damage. Crossing the tether (a dash through it too) or striking the
    Warden cuts it; it reaches out again after a while. It asks which enemy
    first, never how fast: a ward cuts damage, it never heals, so it is no
    damage race.
  - **The Stalker blinks from afar**: its mark fills the floor where the
    player stood when its aim locked, then it appears in the mark's middle
    and strikes it, and stands there through its recovery, the moment to
    strike back. Keeping one's distance is no refuge. It never slides along
    the floor: it fades out and appears.
  - **The Volatile bursts where it falls**: a ring shows for its fuse
    (at least the fairness floor), then blasts every body in it, enemies as
    much as the player. Where it falls is the question: knocked into a crowd
    before the last blow, or stepped back from.
  - **The Gale Caster blows a cone of wind** (telegraphed like any attack):
    little damage, a hard push, and its own side is blown along too (pushed
    and driven by the wind, so a wall slams them, unhurt). Where it blows the
    player is the danger (a pool, a wall, the others); baited, it blows them.
  - **The Juggernaut is armored until broken**: it takes a share of the
    damage and cannot be pushed until its break bar fills (by the blows as
    dealt: heavy blows, reactions, and perfect dodges break it soonest);
    broken, its armor is down for the whole stun. A weaker team takes
    longer; nothing runs out.

## Behaviors

How an enemy moves when it is not attacking (`features/behaviors.ts`):

- **Chase**: straight at the target, to a distance.
- **Kite**: keep between two distances, strafing.
- **Skirmish**: circle the target until given one of the few engagement
  slots (`crowd.engagers`, nearest first), close in and attack, then back
  off once the attack (and its follow-ups) is over, and circle again. A
  skirmisher attacks only while it holds a slot, so a gap-closer is never
  thrown from the circle.

Enemies find their **way around walls**: with no clear line to the player,
they follow a flow field over the arena (`physics/paths.ts`) instead of
pressing against the wall in between. Enemies that circle or keep their
distance come around too while a wall hides the player, rather than holding
their place around her through it. One still pressed against walls without
getting anywhere (a concave corner, a walled pool's edge) follows the wall
out for a moment, the side that leads toward the player (`unstick`).

## The crowd's rhythm

- Only a few attacks **wind up at once** across the arena
  (`crowd.windups`); the nearest enemies go first, the others wait their
  turn. Follow-ups are not held back: a combo is one attack.
- Skirmishers **take turns** closing in (`crowd.engagers`).

These two numbers are what makes a big wave dangerous without making it
unreadable; hardcore modifiers may raise them, never the readability floor.

## Pacing at low levels

Low levels breathe: an enemy of level 1 waits a quarter longer between its
attacks than its kind does (`Tuning.pacing`), easing to its kind's own wait
by level 10, the end of chapter 2. Only the waits change: windups, reach,
health, and damage are its kind's at every level, so a new player has time
to dodge and strike back without enemies going down any faster.

The Guardian winds up longer than it used to and waits longer after a
swipe, so a blow landed on it can be followed by a dodge; its thrust reaches
less far. The heaviest enemies' areas (the Brute's slam and stomp, the
Juggernaut's sweep and quake) were brought in a little, after playtests
found them reaching too far.

## Waves

- **Enemies come in by their job.** Each wave has a front, a direction from
  the player (toward the side of the arena with the most room). Enemies that
  keep their distance come in far along it; the others come in closer, from
  the flanks and behind. Backing away from one side walks into the other.
- **Reinforcements come as a wave thins out**: once most of it has fallen
  (`waves.reinforceShare`, about 70%, and always at least one enemy), the
  next wave starts arriving. A share rather than a count, so a wave of two is
  fought before the next comes. Kills bring it, never a timer, so there is no
  damage race.
- Every spawn is warned on the floor before the enemy appears.
- **A run lasts three to four minutes.** A quest's waves add up to that for
  the lab's quick player (sum its seconds to clear). Goals require defeating
  enemies; lasting for a timer never clears a challenge. Fewer, bigger waves rather than many small ones: a run of
  eight to ten waves leaves room for a build-up and a last, hardest wave.
- **Lasting until the team falls** (the `endure` objective, the Until Fall
  track): the waves never end, and every wave's enemies come in
  `levelPerWave` levels above the last. Reaching the goal wave clears the
  tier; going past it is the score (each tier keeps its best wave).

## Elites

A wave entry can be an **elite**: the first enemy of its group is bigger and
tougher, immune to its element, and every blow it deals carries that
element. Its element shows as a ring under its feet and a glow on its body.

- **Fire** leaves fire on the ground behind it as it moves: it burns its own
  side too.
- **Water** leaves puddles: they slow and soak the player as much as the
  enemies standing in them.
- **Thunder** discharges around itself now and then, a ring telegraphed
  where it stood: it charges what it strikes, and bursts the state a body
  already holds.

Wind and rock make no elites: neither has anything of its own to leave
behind or set off around an enemy, so an elite of either would be a plain
one with a color.

Elites make the elements part of the fight on the enemies' side, ready to be
turned against them. Endless waves make elites of a growing share of their
slots.

## Shields

A wave entry can carry a **shield** (`shielded` in `content/challenges.ts`):
the first enemy of its group holds a frontal shield that turns toward the
player (`Tuning.shields`) and stops shots, discs, and other projectiles
hitting it from the front; blows up close, bursts, slams, and anything from
behind land as usual. It belongs to no kind: any enemy can carry one, so it
comes into the main line as its own new thing (chapter 4), and a Shooter
behind a shield asks a different question than a bare one.

## Champions

A wave entry can be a **champion** (see "Champions" in
`docs/vision.md`): an elite pushed further, the hardest enemy of a
challenge. It is one of the game's enemies, with its kind's model, and no
entrance, cutscene, or timer. A champion whose kind has its **own
moveset** (`content/champions.ts`) fights like a boss: see "Champions'
own movesets" below; the others fight with their kind's moveset.

- **Bigger, much tougher, stronger, faster**: several times an elite's
  health (it survives a few waves), more damage, quicker on its feet, and
  shorter waits between attacks. It **grows along the main line**
  (`Tuning.champions.early`, `championPower`): chapter one's is a first
  taste (four times its kind's health, a little more damage, its kind's
  waits), and champions reach their full numbers by about level 30. Its **telegraphs never get shorter**, so
  every attack stays as fair as its kind's (the fairness test holds
  champions to it).
- **Elemental, like an elite**: immune to its element, every blow carrying
  it, and a thunder champion discharges around itself. It leaves no trail:
  staying for waves, it would flood the floor. States and bursts land on it
  as on any enemy; over its long life they add up.
- **Harder to move**: pushed less than its kind (a Gale or a wall slam
  still counts), and its break bar is a smaller share of its health than
  its kind's, so it breaks a few times in a fight, each a window.
- **Its own mark**: a crest under its feet and a stronger glow in its
  element's color, a larger health bar, and its name and health across
  the top of the screen (marked where its phases begin), so it reads in a
  crowd. Broken, it **stays down longer** than anything else
  (`Tuning.champions.broken`): the opening its fight builds to.
- **It stays across waves.** It does not count toward clearing the wave it
  came in: the next wave comes once the others are down, with it still
  standing. The challenge is cleared only when the last wave is down and
  every champion has fallen. Bringing it down early is a good plan; leaving
  it means fighting every wave with it on the field.

Each chapter of the main line ends with a champion, a different kind each
time (a Chaser, a Guardian, a Brute, a Swarmer, a Stalker, a Juggernaut):
each kind's champion is that chapter's new thing. Melee and area kinds make
good champions; ones that keep their distance (a Sniper, a Firebomber) would
hide at the edge for waves, and are kept out. Enemy Practice can add a
champion to the field once the player has met one.

### Champions' own movesets

The fight is the champion, not the crowd around it: a champion with its
own moveset has the attacks of a boss, made of the same pieces as any
enemy's (telegraphs, combos, aiming ahead of a runner), so every hit stays
avoidable and the fairness test checks every phase.

- **It reads the player.** An attack can answer what she is doing
  (`read`): running away (`away`), standing still (`still`), out of sight
  behind a wall (`covered`), or open (`open`, see `readPlayer`). While she
  does it, the attacks answering it are picked first; otherwise those
  answering nothing in particular. Backing away from the Brute King draws
  a charge down a lane; hiding behind a wall, a burning rock heaved over it.
- **It fights in phases by its health.** Its moveset lists where each phase
  begins (`phases`: 60%, then 25%), and each attack the first phase it is
  made in. As a phase begins it roars (`Roused`): its phase's opening
  attack (`opens`, a shockwave pushing the team back) comes as soon as it is
  free, then the phase's attacks join the others, with shorter rests.
- **Patterns that ask for a dodge, not distance alone**: combos aimed anew
  at each blow (two slams, charges one after another), a blow held up long
  while it tracks her (a dodge made as it is raised is spent before it
  falls), and **shockwaves** (`wave`): a ring running out along the floor
  from where it stands, as far as its reach, hitting what it passes. Out of
  its reach, or dash through the ring as it passes.
- **Never waits for the crowd**: a champion attacks whenever its own rest
  allows, past the crowd's windups (see `crowd.windups`); the waves around
  it are light.

The Brute King is the first (chapter three's finale); the other chapters'
champions follow once its fight is right.

## What the player meets, and when

The main line brings the roster in one thing at a time (see
`docs/quests.md`, "Chapters"), and nothing else shows an enemy, an elite
element, a shield, a champion, or a floor before it does: side quests,
ranks, hardcore tiers (each with its own waves), Until Fall's endless waves
(drawn from what the main line has brought by the tier's quest), and Enemy
Practice's picks (what the player has met). `validateContent` checks the
content against it (`content/novelties.ts`).

Each element is resisted by a few enemies the main line has brought by the
time its trial opens (see `docs/quests.md`), so no element is welcome
everywhere: Wind by the Swarmer, the Guardian, the Brute (immune), the
Juggernaut, and the Gale Caster (immune); Fire by the Brute, the Firebomber,
the Stalker, and the Volatile (immune); Water by the Shooter and the
Warden; Thunder by the Sniper; Rock by the Swarmer, the Stalker, and the
Gale Caster. Elites and champions are immune to the element they carry.

## Arenas

Each challenge is fought in an arena (`content/arena.ts`): its pillars (tall,
fading in front of the player), low walls (cover that blocks movement and
shots without hiding anyone), props (what furnishes it, a throne or a
crate: they block like pillars, and stand flush against a wall or leave
room to pass), and hazards. Hazards are permanent pools laid
into the floor's tiles, level with it, that affect everyone, enemies
included: **fire trenches** burn (water puts one out for a while, then it
burns again), and **basins** of water soak. An arena's look comes from an environment kit, by the same id
(`presentation/looks.ts`); hazards are drawn flat, in few tones, like the
rest of the game.

**Enemies keep out of harm's way.** They find their way around the arena's
hazards as around walls, slide along the edge of any pool they would take
harm from instead of stepping in (fire anywhere, the player's included),
and walk straight out of one they were pushed into. Only force puts them
there: a whirl's pull, a push. An enemy immune to an element ignores
its pools.

Pools are few and small (at most two in an arena, of at most four tiles),
and each carries low walls along two of its edges, one of each pair: it is
open on the other two sides only, so it is stepped into on purpose or
pushed into, never drifted into while dodging. Keep a pool short across the
way enemies come in: one long enough to stand behind lets ranged enemies
shoot over it out of reach, and a run drags on (the lab shows it as a wave
that takes minutes). `test/arenas.test.ts` keeps every gap between what
blocks wide enough to pass.

## Breaking

Pressing an attack has a payoff. Every enemy that can break (`poise`
above 0, a share of its health; Swarmers and training dummies never do)
has a bar under its health:

- Blows fill it by the damage they deal, heavy ones (finishers, charged
  attacks) more, burns a little; a burst on it (see `docs/elements.md`) or
  a wall slam fills a share of it at once, a Shatter (rock's burst) a
  large one. A cracked enemy's bar fills faster from everything.
- It **drains** once the enemy has taken nothing for a moment, so chipping
  at it from afar never breaks it.
- Full, the enemy **breaks**: its attack is cut off, it is stunned for a
  while and takes more damage (a modest bonus: breaking is a window, never
  a requirement), with a heavy pause and a burst. Its bar fills again only
  once it has recovered.

## Perfect dodges

Reading an attack is rewarded over running from it. A dash started at
most `perfectDodge.window` seconds before a blow lands where she stood (or
on her, through the dash's invulnerability) is **perfect**; an earlier one
is a plain dodge. It rewards once per dash: the **enemies slow down** for a
moment while the team keeps its pace (their moves, windups, shots, and
bombs), the attacker's break bar fills, a dash charge comes back, a little
energy, a full magazine, and a moment more of invulnerability. Every
reward is a number, and any can be turned off.

## Reading the player

Enemies read the player (`Tuning.reading`), so a fight has a give and take:

- **She is open** while a long move recovers (a finisher, a charged
  attack), while she reloads, or with no dash charge left. Melee enemies
  then take their turn at once, a touch faster, and their attacks come
  round sooner; their telegraphs never get shorter. Enemies keeping their
  distance keep their rhythm.
- **She is a threat** to a melee enemy her ready attack is aimed at, within
  her reach: it keeps just out of that reach, circling, until it runs out
  of patience and commits anyway. Enemies behind her do not hesitate.

## Measuring difficulty

A bot plays through the touch controls (`test/bot.ts`), reading only what
is on screen.

- **Fairness** (`test/fairness.test.ts`): against every enemy that attacks,
  a bot reacting at once takes no hit. A new enemy whose attacks cannot be
  dodged fails it.
- **The lab** (`pnpm lab`): every wave of every challenge, fought with the
  Swordsman by a quick player (reacting to a telegraph after 0.25 s) and
  one still learning (0.4 s). It reports hits per minute, seconds to clear,
  dashes per minute (how often the fight forces the dash), and pressure
  (the share of the time standing still would get hit). Use it to compare
  tunings; a bot is not a human, so feel is checked by playing. It fights
  as a player does: one enemy at a time (kept until another comes much
  nearer), however far that one backs off; it dashes in when the way is
  clear and it holds a spare charge; and fire on the floor is a cost to
  step through, not a wall (an elite's fire trail would otherwise keep it
  away for good). A wave that does not clear in the lab is a finding: an
  enemy a player cannot reach either, or a gap in the bot.

## Open questions

1. **More hazards.** Hazards that act on their own (vents that flare on a
   rhythm, currents that push), and arenas that change during a run.
