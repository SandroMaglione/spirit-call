# Combat balance audit

The October 2026 audit starts from a concrete problem: levels buy too little
room for mistakes, and crowd damage fuels frequent ultimates. Low-level
clears can demand perfect play. Upgrades should noticeably improve safety
and the pace of a fight. No clear timer or character-level entry gate is needed.

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
| Perfect-dodge slow / break fill / energy | 0.7 seconds / 25% / 4 |
| Wall-slam / reaction break fill | 25% / 20% |
| Chaser swipe / follow-up | 18% / 14% ATK |

Energy now has a shared budget per action. A basic attack earns 3 times
its recovery in seconds on its first target, including a magazine weapon's
share of reload time. A special earns 10. Additional unique targets receive
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
It also checks 16 controlled energy probes across all kits, levels 1 and
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

Profiles include basic attacks, skills used whenever available, levels
matched to the enemy, a slower learner,
escape-only play, and low-level and matched three-character rotations. Full sweeps
exercise every quest and each character's plain aspect. They are
hypothetical builds, not a claim that an account can own every character
at that point. Seeds are fixed and reports include the tuning hash.

The bot uses touch input, aims specials and ultimates toward a visible
target, and counts emitted casts rather than failed input attempts. It
does not optimize charged attacks, bursts, or every aspect's passive.
Range preferences are approximate. Its movement planner extrapolates
visible threats; human success rates cannot be inferred from it. A learner
can outperform the quick profile on a seed through a different path.

Keep fairness tests separate. Use full sweeps to find outliers, compare
candidate tunings on the same scenarios, then play them on a phone. The
tool monitors balance; it does not decide good gameplay or silently
retune content. Longer term, add aspect comparisons, explicit counterplay
bots, enemy attack opportunities and stun uptime.
