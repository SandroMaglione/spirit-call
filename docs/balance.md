# Combat balance audit

The October 2026 audit starts from a concrete problem: levels buy too little
room for mistakes, and crowd damage fuels frequent ultimates. Low-level
clears can demand perfect play. Upgrades should noticeably improve safety
and the pace of a fight. No clear timer or character-level entry gate is needed.

## The Gauntlets and Sparkfist (2026-10-10)

The roster's fifth class and first new character (`docs/roster.md`).
Sparkfist is a glass cannon up close (68 HP, 121 ATK, 330 speed, on a
close attacker's budget of 1.05; her dashes come back in 1 s rather than
the quick 0.8 s first sketched, paying for the Gauntlets' refunds). The
matrix:

| | Clears (skilled / learning) | Time (skilled) |
|---|---|---|
| Sparkfist | 45 / 10 of 48 | 0.66, the fastest |
| Swordsman | 47 / 24 | 0.74 |
| Gunner | 24 / 0 | 1.27 |
| Tidecaller (healer) | 47 / 17 | 1.22 |

Skilled, she clears the quickest of anyone; learning, she falls often, as
the other frail bodies do (between the Gunner and the Tidecaller): her
dashes, fed by her blows, are her defense, and the learning bot dodges
poorly. Of her aspects, Grapple holds up best for the learning bot (6 of
16, against 2 for Jab and Flurry). On paper her Spark Step dealt the most
of any special per second of cooldown (24% ATK every 5 s), so it went to
20%. For playtests: whether her frailty is fair for someone learning, as
with the Gunner. CI's audit gains her energy cadence (a row per level and
wave); its report is the baseline.

## The quest team: one of each role (2026-10-10)

The quests now give the Tidecaller (a healer) at the end of chapter one and
Bastion (a guardian) at the end of chapter three; the Gunner and the
Stormcaller come from the Call. Quest materials, chests, and trials follow
that team (water from chapter two, rock from the Brute King; trials open
wind, water, rock, fire, thunder), and Whirlpool replaces Marksman as
chapter four's aspect. Against main:

| | Before | After |
|---|---|---|
| `pnpm expected` (the team a new account has), cleared on every seed | 140 of 152 | 142 of 152 |
| `pnpm expected`, quest runs perfect on some seed | 83 of 93 | 93 of 93 |
| `pnpm progression`, runs to the end of rank III | 372 | 368 |
| `pnpm progression`, quests where the team stops to farm | 11 | 10 |
| `pnpm calls`, first character from the Call | chapter 5 | chapter 5 |

Every main quest is cleared on both seeds by the quest team, and nothing
was lost on any seed; what is left are Until Fall's tiers running out of
time. No ascension waits on a trial that is not open: the Brute King pays
rock as Bastion arrives (as it paid water when it brought the Tidecaller).

## The Tidecaller as a healer (2026-10-10)

The quest team's healer (`docs/roster.md`): her Tidal Wave marks what it
hits for 5 s, and a blow of the team on a marked enemy heals the one on the
field 2% of her health, at most once a second across the team; her Tide
heals the whole team 4%, and 3% more for each enemy around already soaked
(16% at most), dealing 50% ATK instead of 65%. Her body moved to a healer's
budget (74 HP, 88 ATK, 305 speed: 0.83 of 0.85). The matrix with the mark's
wait at 0.9 s:

| | Clears (skilled / learning) | Health restored a minute (skilled / learning) |
|---|---|---|
| Tidecaller as an attacker (before) | 46 / 8 of 48 | 0% / 0% |
| Tidecaller as a healer | 47 / 20 of 48 | 13% / 48% |
| Stormcaller (the reference) | 46 / 21 of 48 | 11% / 41% |

She sits beside the Stormcaller, a little above on healing, so the mark's
wait went to 1 s (about a tenth less healing); the learning bot's clears
went from the bottom of the roster to the Stormcaller's.
CI's audit (its team runs bring the Tidecaller) moved 21 numbers and one
outcome (the Warlord's team with skills on seed 42 fell instead of timing
out); its report is the baseline.

## Water weakens, and its burst disarms (2026-10-10)

Water moved to its part of the element map (`docs/elements.md`): a soaked
body's blows deal 30% less (it no longer slows), and Splash disarms for
1.5 s (a windup cut off, no attack started) instead of stopping bodies a
second. The Juggernaut is weak to water too (heavy hitters). Measured
against main with the Swordsman's bot, nothing moved far:

| | Before | After |
|---|---|---|
| `pnpm lab`, hits over every wave (quick / learning) | 368 / 699 | 373 / 706 |
| `pnpm expected`, cleared on every seed | 140 of 152 | 139 of 152 |
| `pnpm expected`, quest runs perfect on some seed | 83 of 93 | 89 of 93 |

Fewer runs were lost (four plays lost at least once, from seven), and
more of Until Fall's tiers ran out of time instead: enemies are no longer
slowed by the water floors and elites, and a soaked player hits softer.
CI's audit moved 29 numbers, one outcome (the Warlord's team with skills
on seed 42 timed out instead of falling); its report is the baseline.

## Touch aims what arcs at the pick (2026-10-10)

On touch a charge, held and released, now aims at the enemy the assist
picks (a lob lands on it), and a tapped skill that is set down goes to the
pick (see `docs/aspects.md`, "Aiming on touch"). The bot plays with touch,
so its runs moved: in CI's audit four outcomes flipped (Pack Leader: the
Swordsman with skills on seed 1337 and with the basic attack on seed 42
fell, with skills on seed 42 cleared; the Warlord's team with skills timed
out instead of falling), and the rest changed in time and hits both ways.
Read as the bot's noise, not a change in difficulty; the baseline is CI's
own report of this change.

## The roles' own measures (2026-10-10)

The roster (`docs/roster.md`) holds healers about equal by health restored
a minute, and guardians by blows stopped a minute, however their kits ask
for it. `pnpm balance --matrix` now prints both beside clears and health
left (`healedPerMinute`: health restored a minute, as a share of her own;
`blockedPerMinute`: blows stopped before they landed, stone plates
shattered today). Read solo, each character alone at the enemies' level,
over the matrix's 8 quests and 2 seeds. The two of today are the reference
a new healer or guardian is tuned against:

| | Skilled bot | Learning bot |
|---|---|---|
| Stormcaller, health restored a minute | 11% | 41% |
| Bastion, blows stopped a minute | 1.1 | 3.6 |

Both follow how often she is hit (the skilled bot is hit about a third as
often), so compare a new one with the same profile. The rest of the matrix
is unchanged from "Where the stats pass stands" below.

## Where the stats pass stands (2026-10-09)

Six steps (PRs #85 to #89, and this note): the matrix and a bot that plays
each build's range, bodies on one budget, dash, impact, and weight, kits and
basic attacks, and trade-off relics with the Survival slot. The matrix at the
end (`pnpm balance --matrix`, 8 quests, 2 seeds, every aspect):

| | Skilled bot: clears / time | Learning bot: clears / health left |
|---|---|---|
| Swordsman | 46 of 48 / 0.79 | 29 of 48 / 20% |
| Gunner | 23 / 1.33 | 0 / 0% |
| Tidecaller | 46 / 1.01 | 8 / 5% |
| Stormcaller | 46 / 0.95 | 21 / 36% |
| Bastion | 47 / 1.23 | 34 / 35% |

At the start the skilled bot cleared 0 of 48 with the Gunner (her own fire
spread back to her) and the learning bot 0 to 2 with the Tidecaller. Four
characters now sit close together for the skilled bot; Bastion is slower
but safest, as a tank should be.

**Still open, for playtests to settle:**

- **The Gunner.** Her own fire is most of what she loses to: Barrage's
  pools land where she fights, worst with the Scattergun (1 of 16). Shrinking
  the pools did not help; the rule that her own fire burns her is a design
  call, not tuning.
- **Frail bodies and the learning bot.** Its clears follow effective health
  (Bastion 34, the Swordsman 29, the Tidecaller 8, the Gunner 0). People dodge
  better than it does but not as well as the skilled bot: whether the
  Gunner and the Tidecaller are too fragile for someone learning is for a
  person to say.
- **Duelist** still trails the other Blade aspects for the learning bot (5
  of 16 against 11 and 13): its pattern asks for perfect dodges.
- **Relics are not in the matrix** (the bots carry none): trade-offs and the
  Survival slot are judged in play.

## Kits and basic attacks (2026-10-09)

Read from the matrix after the bodies: the Gunner was the weakest in both
profiles, the learning bot's clears followed effective health (Bastion 40
of 48, the Tidecaller 4, the Gunner 0), and the plain aspects trailed their
own class's others.

- **Bodies.** Distance protected the Gunner less than the budget assumed:
  long range now gets a fighter's whole share (1, was 0.95), and her body
  went to 64 HP, 128 ATK. The Tidecaller traded ATK for health (76 HP, 100
  ATK).
- **Kits** (`pnpm balance` prints each kit on paper, `kitAudit`):

  | Skill | Before | After | Why |
  |---|---|---|---|
  | Tide | 50% ATK, 100 energy | 65%, 85 energy | The weakest ultimate, on the weakest fighter |
  | Spark Totem | 18% a zap | 14% | Damage and healing from one special, three times another's damage |
  | Thunderclap | 1.5 s stun | 1 s | Damage, stun, break, and a team heal in one ultimate |
  | Stoneguard | 4 plates | 3 | Most of a run's blows cancelled (people take 3 to 5 a run) |

  An ultimate's energy is its kit's to set (at most 100): a cheaper one is
  a way to make it come more often without adding to what it does.
- **Basic attacks.** Aspects' budgets follow their reach (see
  `docs/aspects.md`, "Rules"): the Scattergun, fighting at 300 on the
  Gun's budget for 660, went from 5 to 7 a pellet. The plain Sidearm,
  Ring, and Spark rose by about one power a move, so a plain aspect is
  never the obvious worst; Duelist's thrusts widened (52 to 64) so its
  pattern catches more than one enemy, without more damage.

## Bodies (2026-10-09)

Every character had 100 ATK, and her HP, DEF, and speed only a little apart:
they played alike, and the kits and classes made all the difference (the
matrix: the Stormcaller and Bastion on top, the Tidecaller and the Gunner
at the bottom). Bodies now differ on purpose, and all keep to one budget.

**The budget.** A body's score multiplies three things, each beside the
reference body's (75 HP, 100 ATK, 15 DEF, 295 speed: a score of 1): ATK,
effective health (HP as DEF stretches it, `effectiveHealth`), and speed.
Her budget is her role's share times her class's range's (`bodyRules`),
and `validateContent` holds her score within 5% of it:

| Role | Share | Why |
|---|---|---|
| Fighter | 1 | Her strength is her blows and her body |
| Guardian | 0.95 | Her kit shields the team (plates) |
| Support | 0.85 | Her kit heals and keeps the team going |

| Range | Share | Why |
|---|---|---|
| Close | 1.05 | She takes more blows |
| Middle | 1 | |
| Long | 0.95 | Distance is a defense of its own |

**The bodies.**

| | HP | ATK | DEF | Speed | Effective health | Score / budget | Feels |
|---|---|---|---|---|---|---|---|
| Swordsman (fighter, close) | 82 | 86 | 22 | 290 | 100 | 1.06 / 1.05 | A bruiser: sturdy and steady |
| Gunner (fighter, long) | 58 | 130 | 8 | 310 | 63 | 0.94 / 0.95 | A glass cannon |
| Tidecaller (fighter, middle) | 70 | 110 | 12 | 310 | 78 | 1.00 / 1.00 | An agile skirmisher |
| Stormcaller (support, middle) | 74 | 88 | 15 | 295 | 85 | 0.85 / 0.85 | Her strength is her kit |
| Bastion (guardian, middle) | 85 | 72 | 30 | 275 | 111 | 0.94 / 0.95 | A tank: slow, bulky, light blows |

(Scores count her dash, impact, and weight too, below.)

**Dash, impact, and weight.** Three more traits shape how she plays, and
her level does not change them (the character page shows them as chips
under her stats):

- **Dash**: her own charges, distance, recharge, and untouchable time
  (`CharacterSpec.dash`, over the reference dash `Tuning.dash`, read through
  `dashOf`). Duration stays everyone's, so a longer dash is a faster one.
- **Impact**: how much her blows (not burns) fill a break bar, the one on
  the field's (what a benched one left behind too).
- **Weight**: a push on her is divided by it (`knockbackTaken`).

They count in the budget too, their product (the dash by `dashScore`:
charges, distance, recharge, and half its untouchable time) raised to a
quarter (`bodyRules.personality`): they change how she plays more than how
strong she is.

| | Dash | Impact | Weight | Why |
|---|---|---|---|---|
| Swordsman | 2 × 170, back in 1.1 s (the reference) | 115% | 120% | A bruiser: breaks things and stands her ground |
| Gunner | 2 × 200 | 85% | 80% | Kites: a longer dash, a light body |
| Tidecaller | 3 × 140, back in 1.2 s, 0.16 s untouchable | 90% | 85% | Agile: more, shorter dashes |
| Stormcaller | the reference | 90% | 100% | |
| Bastion | 2 × 150, back in 1.35 s, 0.24 s untouchable | 125% | 140% | A tank: slow to dodge but untouchable longer, hard to move, breaks the toughest |

To keep the budget, the Swordsman's ATK went to 86, the Gunner's to 130,
the Tidecaller's to 110, Bastion's to 72, and the Stormcaller's HP to 74.

Speed counts one for one in the score (5% quicker is worth 5% of ATK or
health): an approximation, for the matrix and playtests to correct. Each
role's and range's share is a first guess the same way. The budget keeps
characters from drifting apart by accident; the kits pass and playtests set
how much each part is really worth. Tests of mechanics read a character's
ATK from the tuning (`hitBy`), never a fixed 100.

**Fire spreads within a side.** Found by the matrix: a burning enemy
pressed against the Gunner set her burning with her own fire, and she fell
to it in every run (all 25 hits of a lost Swarm run were her own burn).
Fire now spreads only between bodies of one side; pools, fire on the floor,
and enemies' fire blows still burn the team.

## The matrix, and a bot that plays each build (2026-10-09)

`pnpm balance --matrix` puts builds side by side: every character with
every aspect of her class (her plain one too), alone, at the enemies' level,
through eight quests that each ask something different (`matrixQuests`), by
a skilled and a learning player. It prints each character and each build:
clears, time beside the median build on the same quest and seed (1 the
middle, lower is faster; a loss counts as the whole horizon), hits a run,
and health left. It has no baseline and checks nothing: it is the picture
the balance of characters is read from (`--output` keeps it, `--tuning`
tries a patch). It takes about ten minutes, so CI does not run it.

**How to read it.** The two profiles lean opposite ways. The skilled bot
dodges about three times as well as a person, so it values damage (a build
that kills sooner looks best); the learning bot takes many hits, so it
values health (a bulky build looks best). People sit between them. A
build that is far out on both is out of line; one that is out on one only
is a matter of who plays her, for a playtest to settle.

The bot was changed with it, so every row moved and the baseline was
recorded again:

- **Its range comes from the build**, not a table by character: in close
  at a melee move's reach, shots and bolts from two thirds of their range,
  discs from most of theirs (`styleFor`). The Stormcaller was played at 210
  with a staff reaching 560, and a Scattergun at 420 with shots fizzling at
  300.
- **It charges** its power attack every few seconds when the way is clear
  and the target is in its reach (`chargeEvery`), so charged attacks and
  what they set off (Lightning Rod's rod) are measured.
- **A skill waits for an enemy it can reach** (`skillReach`), as a
  player's would; a totem also for when she is hurt. It cast every skill
  the moment it was ready, whatever the distance.

What it found first: the Gunner falls in every run, to her own fire. A
burning enemy touching her sets her burning with her own burn (all 25
"hits" of a lost Swarm run were her burn ticks).

## Gold, materials, and chapter 3 for two (2026-10-09)

With the Spirit Call's first character moved to chapter 5, chapter 3 is
played by two (the Tidecaller joins at its end): its late waves lost an
enemy or two, the Brute King's health went to 0.65 of its kind's, and its
health goals became hit budgets. The skilled bot clears all four on both
seeds; the learning bot still loses the Brute King. Chests now hold only
their quests' elements' material, so trials are where other elements are
farmed (`pnpm progression` still finds no member waiting at a step without
its trial). The quest card warns a party 3 or more levels under the
enemies, with a way to train its weakest.

## Stars as goals (2026-10-09)

Stars became three goals on top of the clear (see `docs/quests.md`), from
a decent run to a clean one, with new tallies (falls, health left, the
longest dodge chain, ultimates). Their numbers come from the skilled and the
learning bot on every quest, on two seeds, with the expected team: the
skilled bot earns all three everywhere, and the learning bot mostly the first
one or two. Next to people the bots dodge perfectly about three times as
often and take fewer hits (the prod runs of 2026-10-07: 3–5 hits, 2–10
perfect dodges a run), so goals on dodges stay near what people did. The
side quests' chests now come every 3 stars, holding the same in all.

## The difficulty pass (2026-10-08)

The playtest cleared everything at levels far under the quests' and in 1–2
minutes a run. Changed (PR "difficulty pass"):

- **The level gap** (`progression.gap`, `levelGap`): under the enemies'
  level, 4.5% less dealt and 4% more taken a level (at most 60% less and
  60% more); over it, 1% a level either way, at most 10%.
- **Toughness** (`progression.enemies`): enemies that fight in waves grow
  from 1.8x their kind's health and 0.8x its ATK at level 1 (the first
  quests forgive more) to 2.5x and 1.3x from level 10. First Blood brings
  23 chasers instead of 32. Champions' own health multiples were
  lowered so their fights keep their length.
- **The first levels breathe** (`pacing`): at level 1 enemies wait 1.6x as
  long between attacks and wind up 1.35x as long, easing to their kinds'
  own by level 10.
- **At most 12 on the field** (`waves.most`, spawn warnings included).
  Until Fall's waves stop growing at a budget of 16 and bring a champion
  every 5 waves instead.
- **The Disc** dealt too much for its safety (two hits a throw, through a
  line, from range, on the sturdiest character): its powers are about a
  quarter lower (11 to 8, 10 to 7, 9 to 7, 14 to 11; its aspects alike).

Bots on the main line (one seed; a player takes about 1.75x a bot's time,
from the playtest's runs):

| | before | after |
|---|---|---|
| Matched, skilled | 42–67 s (Colossus 109) | early 40–60 s, mid 80–120 s, late 100–160 s |
| 10 levels under, skilled | cleared everything | lost most from chapter 2 on; cleared ones 2–5 min |
| Matched, learning | lost First Blood on one seed | clears chapter 1; the Brute King beats it |

The baseline was recorded again from CI's report. In the audit's rows, a
lone level-1 Swordsman against the level-28 Warlord now falls in seconds
(the gap and toughness at their extreme; before, she lasted 100 s), while
matched rows clear with a little more taken; First Blood's learning
Swordsman clears both seeds again.

## Champions fought as bosses (2026-10-08)

The baseline was recorded again (from CI's report) once every chapter's
champion fought with its own moveset (PR #74). Only the audit's champion
quests moved: the Pack Leader and the Warlord now bring light waves once
their champion is out (fewer kills, around 21–25 instead of 34–39) and hit
harder (the Swordsman alone takes more damage; the learning one now falls
to the Pack Leader on seed 42). The Warlord's team rows swing both ways
with how long its blink strings last. The champion fights themselves were
measured with the bots one on one (the Pack Leader about 25–30 s, the late
ones 1–2 min; see the PR).

## Perfect dodges and champions (2026-10-08)

The baseline was recorded again (from CI's report) after perfect dodges
shrank for every enemy (PR #74): a 0.25 s slow instead of 0.7 s, no break
fill instead of 25%, growing along a chain of three. Bots that dodge well
lean less on slow motion and breaks: the Warlord got harder for a Swordsman
alone (1337: damage 17 to 51 matched, 99 to 213 learning; fewer breaks),
while First Blood came out a little easier for most rows (the learning
Swordsman clears seed 42 again). The changes go both ways run by run, as
small timing shifts do; none is a new wall. Champions with their own
moveset (only the Brute King so far) are not in the audit's challenges;
the King was measured with the bots separately (see the PR).

## One dash strike (2026-10-09)

The baseline was recorded again (from CI's report) once every dash strike
dealt the same 10% ATK to one target (`dashStrikePower`; it had been 18 to
40, the Gun's spread the most). The bot dashes in and swings, so it leaned
on dash strikes more than a player would: the Swordsman's runs moved most
(the learning Swordsman falls in First Blood 1337 and the Warlord 1337, the
basic one in the Pack Leader 42; the learning one clears the Pack Leader
1337). Tuning around it is a gameplay pass of its own.

## Combat feel (2026-10-08)

The baseline was recorded again after the step 3 playtest changes (PR
#71): ultimates have a 0.75 s moment and come about twice as often
(specials 15 energy, perfect dodges 10), and Gust dives ahead and pushes
little (enemies stay within reach instead of flying a screen away). Skill
users take a little more damage early (First Blood 1337: 0 to 12), and the
learning Swordsman now falls in First Blood on both seeds (it already did on
42): a first quest a beginner loses is for the difficulty pass to answer.
The Warlord learning run went from a loss to a clear.

## Elements and aspects (October 2026)

Weapons are gone (see `docs/aspects.md`): a character's level gives all her
stats (her ATK took in the starting weapon's 20), and gold only trains
characters, so the economy rows below that mention weapon levels describe
the earlier state. Elements became one rule (each leaves its state, another
bursts it; see `docs/elements.md`). The baseline was recorded again after
both, with the plain aspects (no bonus on soaked enemies for the Tidecaller,
no jumping bolts for the Stormcaller until Riptide and Arc are equipped):
measurements before it are not comparable. The `matched` profiles are now
the `skills` ones at the enemy's level, with no weapon level to match. Every
aspect deals within 25% of its class's plain aspect by the numbers
(`validateContent`); what passives, bounces, and chains add is for the lab
and play to judge.

## Ranks and the long game (October 2026)

Every quest got three ranks (rank II at +12 levels with elite leaders,
rank III at +24 with shields too), each with its own first clears, stars,
and chests; characters go to level 60, with ascension steps at 40 and 50,
and materials dropped to a third of their scale (a clear at level 1 is
worth 2). `pnpm progression` plays them all: rank I is done after about 90
runs (about 41 calls of crystals), rank II after about 210 (60 calls), rank
III after about 330 (77 calls). Tried and set aside: rank first clears at
4 runs of gold (the ranks went by with no farming), a steeper level curve
(chapter one turned into a grind). The last two ascension steps cost three
times the curve's six clears, so the trials are farmed in the ranks'
replays (about 90 runs of them), and farming sits at the end of the game.

## The expected team (October 2026)

`pnpm progression` plays a new account through the main line on the
account's own rules (`test/progression-model.ts`), and `pnpm expected`
fights everything with the team it has when each opens, at its levels: a
main quest with the team entering it, a side quest, rank, tier, or trial
rank with the team leaving the quest that opens it. The bot plays its first
member's way and switches every few seconds. With the first numbers every
main quest cleared on both seeds; the hit budgets of quests the expected
team took more hits in than the lab's level-1 probe were raised to about
its average. `test/new-account.test.ts` holds the account to the
progression: no member waiting at a step with no trial open for her element,
no endless farming before a quest, and none in chapter one. Chests pay a
clear's worth of every element's material, so a character the Spirit Call
brings early can take her first step before her element's trial opens.

## Six chapters (October 2026)

The main line was rebuilt into six chapters, one new thing per quest (see
`docs/quests.md`), so the audit's quests became First Blood (the
Swordsman's first quest), The Pack Leader (chapter one's champion), and The
Warlord. Chapter one is written for the Swordsman alone: chasers and
shooters (weak to wind), and a chaser champion in place of the wind-immune
Brute. The hit budgets were set from `pnpm lab`, between its quick and its
learning player, and the baseline recorded again.

## Champions (October 2026)

Each chapter's finale gained a champion (see `docs/enemies.md`): a thunder
Brute in The Brute, a water Guardian in High Tide, and a fire Stalker in The
Warlord. A champion Juggernaut was tried for The Warlord first: its armor on
top of a champion's health kept matched teams from clearing in time, so it
was swapped for the Stalker. Fire champions leave no trail: in the lab a
long-lived fire trail did most of the damage the dodging bot took. The
baseline was recorded again with them.

## Implemented tuning

The audit below records the original problems. The playable update now uses:

| Mechanic | New value |
| --- | --- |
| Main quest enemy levels | 1, 3, 5, 8, 12, 16, 21, 26, 32 |
| Highest Keep tier | 40 |
| Gust / Tidal Wave / Flare Jump / Spark Totem | 6 / 6 / 7 / 10 seconds |
| Ultimate cooldown | 10 seconds, plus 100 energy |
| Bench energy | 30% per living member |
| Totem / Thunderclap healing | 2% per tick / 8% per member |
| Kill healing (now Scattergun's passive) | 2% max HP per kill |
| Perfect-dodge slow / break fill / energy | 0.25 seconds / none / 10, growing along a chain of three (slow 1×, 1.8×, 2.8×; energy 1×, 1.5×, 2×) |
| Wall-slam / reaction break fill | 25% / 20% |
| Chaser swipe / follow-up | 18% / 14% ATK |

Energy now has a shared budget per action. A basic attack earns 3 times
its recovery in seconds on its first target, including a magazine weapon's
share of reload time. A special earns 15 (10 until the 2026-10-07 playtest
found about one ultimate a run; with 15, and a perfect dodge's 10, a
skilled bot playing the early quests calls one every 39 seconds instead of
84). Breaks could give the team energy too (`energy.break`), but early
quests break so many enemies that it doubled the rate: it is 0 for now.
Additional unique targets receive
half the previous award, capped at 150% of the first-target award. The same
key travels through projectiles, repeated ticks and thunder chains; repeated
contact with one target adds nothing. Levels and damage do not change the
award. Burns, ground pools, passive effects and ultimates generate no energy.
The ledger expires old entries and resets with a run. The touch HUD shows
ultimate cooldowns and checks both cooldown and energy for readiness.

First-clear rewards fund the higher main levels. Prior main clears and run
payouts provide 90,600 gold before Warlord, compared with 87,785 to train
one level-32 character and level-16 weapon. Every main quest can fund one
matched build from prior clears, assuming gold goes to that build. A whole
team takes more play. Existing saves do not receive claimed rewards again.

At enemy level 32, a Chaser swipe costs a level-1 Swordsman about 68% HP,
versus about 15% at character level 32. Heavy attacks can kill an
underleveled character outright. The fourfold stat band, movement, dash
recharge and readable telegraphs remain intact.

The new Warlord measurements use real HP and a 240-second observation:

| Profile | Seed | Result | Seconds | Remaining HP | Ultimates |
| --- | ---: | --- | ---: | ---: | ---: |
| Level-1 Swordsman, skills | 1337 | Defeat | 127.5 | 0% | 5 |
| Level-1 rotating team | 1337 | Defeat | 150.3 | 0% | 8 |
| Matched Swordsman | 1337 | Clear | 127.6 | 75% | 3 |
| Matched rotating team | 1337 | Clear | 120.0 | 72% | 6 |
| Level-1 Swordsman, skills | 42 | Defeat | 52.8 | 0% | 1 |
| Level-1 rotating team | 42 | Defeat | 166.4 | 0% | 9 |
| Matched Swordsman | 42 | Clear | 220.5 | 98% | 3 |
| Matched rotating team | 42 | Clear | 117.0 | 91% | 5 |

These builds and enemy levels differ from the original audit. The comparison
shows the whole update, not the isolated effect of one parameter. Path
selection can make a stronger bot slower or less successful on a seed.

Play feedback should first cover the opening quest, sparse-target ultimate
charging, Stormcaller healing, the final chapter's level gap and the length
of finite fights. The opening Swarm remains clearable with basics alone in
three tested seeds, but the slower learner struggles. Gunner particularly
needs human judgment about aiming Flare Jump away from her own fire.

## Original numbers before this update

- Stats grow linearly from 1x at level 1 to 4x at level 40. Each early
  character level adds 7.69% of the base stat. Main quests stop at enemy
  level 18, just 2.31x base stats. Most Hardcore tiers also use this same
  modest range. Until Fall's stat scaling stops at level 40 even though
  its displayed enemy levels keep rising; wave budgets continue growing.
- A level-1 Swordsman has 75 HP, 100 ATK with Training Blade, and 20 DEF.
  A Chaser swipe deals 10 damage at enemy level 1 and 23.1 at level 18.
  That is eight and four hits to fall respectively. A level-18 Sniper or
  Brute is more dangerous, roughly two hits to fall. The problem varies
  by enemy, rather than levels having no effect anywhere.
- Every enemy currently has zero DEF. Enemy levels therefore raise HP and
  ATK, but scaling their DEF multiplies zero. Prefer HP and readable
  dangerous attacks over adding defense to every enemy.
- Energy is 0.4 per point of landed damage: 250 damage buys an ultimate.
  Crowd hits, secondary damage and charging burns all contribute. Gust
  deals 20 damage per ordinary target at level 1: five targets earn 40
  energy, before wall slams or other damage. Higher ATK charges faster.
  Ultimates do not directly refill energy, but attacks and specials can
  refill it while an ultimate remains active.
- Each benched member receives 60% of field energy. A team of three
  receives up to 2.2 times the energy a solo character receives, before
  caps and losses. Each ultimate costs 100, has no cooldown, and grants
  0.5 seconds of invulnerability. Switching also lets specials recharge
  on the bench.
- Gust and Tidal Wave return in 2.5 seconds; Flare Jump in 3 seconds,
  including 0.35 seconds of invulnerability and a 230-unit escape. The
  dash has two charges and refills one every 1.1 seconds. These defenses
  stack with crowd displacement, breaks, and perfect-dodge rewards.
- Spark Totem lasts 8 seconds but returns in 6, allowing overlap. Each
  healing tick restores 4% of maximum HP. Its ticks and chained strikes
  also earn energy, and Thunderclap heals every surviving member by 20%.
- Break bars scale with enemy HP, but a wall slam and a perfect dodge
  each fill 50% regardless of level. Reactions fill 30%. A perfect dodge
  also refunds a dash, awards 10 energy, and slows enemies to 25% speed
  for 1.6 seconds. These combined rewards can suppress pressure even
  against much stronger enemies.
- The old wave lab uses an effectively immortal level-1 Swordsman with
  basic attacks only. It resets each wave, uses enemy level 1 by default,
  and has no balance regression gate. Its fairness tests are useful;
  its numbers cannot establish quest difficulty or ability balance.
- The nine main first clears pay 14,750 gold including their run payouts.
  Training one character to level 18 costs 13,940; reaching weapon level
  9 costs another 4,440. The first-clear path alone cannot fund even one
  fully matched late-main build. Secondary quests and repeats fill the
  gap. Raising enemy levels needs an upgrade-income check alongside it.
  Maxing one character and weapon costs 163,745 gold. At the current last
  main quest's 550 gold per repeat, that is about 298 clears before other
  rewards; at level-40 content's 1,100 gold it is about 149.

## Original proposals and rationale

These proposals led to the implemented values above. They remain design
hypotheses to test through play, rather than established optimal values.

1. Bound energy gain independently of damage. Give a basic hit a small
   energy award and a successful special a budget, with diminishing
   returns for additional targets. Track a cast or attack identity so
   ticks, chains, and burns share its budget. Keep a modest reward for
   hitting a crowd. Test an ultimate every 20 to 35 seconds of active
   combat, with sparse and dense packs, at both low and high levels.
   Reduce bench energy from 60% to about 25 to 35% and test team cadence.
2. Try Gust and Tidal Wave at 6 seconds, Flare Jump at 7, and Spark Totem
   at 10 with its current 8-second duration. Keep basics productive
   between specials. Try an 8 to 12-second ultimate cooldown as a second
   guard against back-to-back casts. Measure each kit separately; blindly
   raising cooldowns can make a support character dull.
3. Reduce the stack of defensive rewards. First try perfect-dodge slow
   motion at 0.5 to 0.8 seconds, break fill at 20 to 25%, and energy at 3
   to 5. Keep the dash refund initially, so reading an attack still feels
   good. Try wall-slam fill at 20 to 25% too. Avoid slowing basic movement
   or shrinking telegraphs to make the game hard.
   Give healing its own budget too. Start by testing Thunderclap at 8 to
   10% per member rather than 20%, and Totem at 2 to 3% per tick rather
   than 4%. Measure effective healing and incoming damage together so
   support remains useful without erasing every mistake.
4. Spread later quests across roughly enemy levels 20 to 35 and upper
   Hardcore tiers toward 40. Tune common enemy damage so an underleveled
   character loses roughly 30 to 50% HP to a clean hit, while a prepared
   build can take several mistakes. For example, a Chaser swipe at 18%
   power, enemy level 30, costs a level-1 Swordsman about 65% HP but a
   level-30 Swordsman about 15%. This is an illustration to test, not a
   blanket damage multiplier. Keep small swarm hits gentler and heavy
   attacks more dangerous. Tune recovery and coverage before adding HP
   until runs become tedious.
5. Measure resource pacing after combat cadence is stable. Compare the
   gold from the first-clear path with training and weapon costs. Do not
   make upgrades harder to buy while trying to make them matter more.
   Character and weapon scaling must be measured together: a level-40
   Swordsman with a level-1 weapon has 340 ATK, versus 400 when both are
   maxed. Fourfold stat growth also gives more than fourfold effective
   survivability because HP and DEF both grow.

Timed survival goals have been replaced with finite combat challenges.
Until Fall keeps its endless wave score: beating enemies advances it.
Escaping without fighting should never complete a reward-bearing goal.

## Measured starting point

Before replacing timed goals, a 240-second full-run observation at seed
1337 produced these results with unchanged combat tuning:

| Quest and profile | Result | Elapsed | Remaining HP | Ultimates |
| --- | --- | ---: | ---: | ---: |
| Warlord, level-1 Swordsman, basics | Defeat | 98.5 s | 0% | 0 |
| Warlord, level-1 Swordsman, skills | Defeat | 43.3 s | 0% | 7 |
| Warlord, matched Swordsman, skills | Clear | 218.2 s | 84% | 26 |
| Warlord, matched learner, skills | Clear | 81.1 s | 42% | 22 |
| Warlord, level-1 team rotation | Clear | 132.1 s | 100% | 46 |
| Hold the Line, escape only | Clear | 210.1 s | 93% | 0 |
| Hold the Line, level-1 team rotation | Clear | 234.6 s | 100% | 50 |

The escape-only clear had zero kills. The Warlord team took six incoming
hits and ended fully healed. A solo starter did lose, so "everything is
easy" is not a universal result. Crowd energy and team healing are the
strongest confirmed offenders. The variation between quick and learner
paths also shows why one bot's clear time cannot be the tuning target.
The opening Swarm cleared in 78.1 seconds with basics and 71.2 with skills,
short of the three-to-four-minute direction. Consider how much of that
target belongs in the tutorial before inflating HP to reach a duration.

After the goal change, escape-only Hold the Line timed out at 240 seconds
with zero kills and 93% HP. It no longer awards a clear for waiting. The
new finite Gauntlet cleared in 106.1 seconds for the basic profile and
62.8 for the team rotation. Its combat tuning still needs the experiments
above; removing the timer fixes the objective, not the energy economy.

An earlier unshipped experiment used 6/6/7/10-second specials, 10-second
ultimate cooldowns, 30% bench energy, 0.15 damage energy and smaller dodge
and break rewards, while retaining all HP and enemy levels. On Warlord at
seed 1337:

- The matched quick profile cleared in 111.0 seconds with 4% HP and nine
  ultimates, versus 218.2 seconds, 84% HP and 26 ultimates before.
- The matched learner cleared in 112.4 seconds with 17% HP and nine
  ultimates, versus 81.1 seconds, 42% HP and 22 ultimates before.
- The level-1 team still cleared with 100% HP, now in 168.2 seconds with
  23 ultimates. Cooldowns and energy reductions alone do not fix team
  sustain. That is why healing needs its own experiment.

This bundled trial does not isolate each parameter's effect. Reducing
Gust frequency can also shorten a fight because it scatters enemies less.
The 0.15 damage-energy rate is a temporary experiment, not the proposed
long-term cast-budget design. The current `tools/balance/cadence-experiment.json`
instead tries a smaller action-energy rate and crowd bonus against the
implemented tuning.

## Repeatable measurements

`pnpm balance` fights whole opening, late-main, and former survival quests
at their actual enemy levels with real HP. It reports clear, defeat, or
timeout, elapsed time, remaining team HP, incoming damage, effective healing, kills, actual
specials and ultimates, and breaks. Timeouts do not prove an impossible
clear; they only mean the bot did not finish within the observation window.
The stat table isolates level effects from the movement planner.

```sh
pnpm balance --output /tmp/balance-before.json
pnpm balance --compare /tmp/balance-before.json --output /tmp/balance-after.json
pnpm balance --quest theWarlord --seeds 1337,7,42
pnpm balance --full --seeds 1337,7,42 --output /tmp/balance-full.json
pnpm balance --tuning /tmp/proposed-tuning.json --output /tmp/balance-experiment.json
pnpm balance --quest theWarlord --tuning tools/balance/cadence-experiment.json
pnpm balance --stats-only
```

The tuning file is a JSON patch merged through `tuningWith`, checked by
`validateContent`. It changes the experiment only. It does not edit shipped
numbers. A comparison exits unsuccessfully when outcomes change or metrics
move by more than 20%, allowing a floor of three seconds or two events;
remaining HP has a 15-percentage-point tolerance. Review both easier and
harder changes. An intentional tuning needs a reviewed new baseline.
Escape-only clears fail independently of the baseline.

CI runs the representative 42-scenario suite at seeds 1337 and 42 against
`test/balance-baseline.json` before deployment and uploads its JSON report.
It also checks 20 controlled energy probes across all kits, levels 1 and
40, and one and six durable targets. These probes remove displacement and
self-damaging pools to measure sustained contact without the movement
planner. Level must not accelerate this cadence. The report includes
upgrade-cost and first-clear-income tables; a progression test checks that
the main path funds one matched build. Passing means tuning has not
unexpectedly drifted, not that it is optimal. To accept an intentional
change, inspect the report, run broader seeds and kits, play it, and then
generate and review a replacement baseline with:

```sh
pnpm balance --output test/balance-baseline.json
```

Long escape-only runs can end differently on a laptop (linked bevy-ts)
than in CI (the published release). When the local baseline fails in CI on
those rows only, record the report CI uploads instead (`gh run download
<run>` gives `balance-report.json`, for the same tuning hash).

Profiles include basic attacks, skills used whenever available, levels
matched to the enemy, a slower learner,
escape-only play, and low-level and matched three-character rotations. Full sweeps
exercise every quest and each character's plain aspect. They are
hypothetical builds, not a claim that an account can own every character
at that point. Seeds are fixed and reports include the tuning hash.

The bot uses touch input, aims specials and ultimates toward a visible
target once one is within their reach, charges its power attack every few
seconds when safe, and counts emitted casts rather than failed input
attempts. It does not plan bursts. Its range comes from the build's basic
attack, approximately. Its movement planner extrapolates
visible threats; human success rates cannot be inferred from it. A learner
can outperform the quick profile on a seed through a different path.

Keep fairness tests separate. Use full sweeps to find outliers, compare
candidate tunings on the same scenarios, then play them on a phone. The
tool monitors balance; it does not decide good gameplay or silently
retune content. Longer term, add aspect comparisons, explicit counterplay
bots, enemy attack opportunities and stun uptime.
