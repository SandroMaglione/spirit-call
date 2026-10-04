# Combat balance audit

The October 2026 audit starts from a concrete problem: levels buy too little
room for mistakes, and crowd damage fuels frequent ultimates. Low-level
clears can demand perfect play. Upgrades should noticeably improve safety
and the pace of a fight. No clear timer or character-level entry gate is needed.

## What the numbers say

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

## Changes to try, in order

These are proposed experiments, not established target values.

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

Timed survival goals are being replaced with finite combat challenges.
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

## Repeatable measurements

`pnpm balance` fights whole opening, late-main, and former survival quests
at their actual enemy levels with real HP. It reports clear, defeat, or
timeout, elapsed time, remaining team HP, incoming hits, kills, actual
specials and ultimates, and breaks. Timeouts do not prove an impossible
clear; they only mean the bot did not finish within the observation window.
The stat table isolates level effects from the movement planner.

```sh
pnpm balance --output /tmp/balance-before.json
pnpm balance --compare /tmp/balance-before.json --output /tmp/balance-after.json
pnpm balance --quest theWarlord --seeds 1337,7,42
pnpm balance --full --seeds 1337,7,42 --output /tmp/balance-full.json
pnpm balance --tuning /tmp/proposed-tuning.json --output /tmp/balance-experiment.json
pnpm balance --stats-only
```

The tuning file is a JSON patch merged through `tuningWith`, checked by
`validateContent`. It changes the experiment only. It does not edit shipped
numbers. A comparison exits unsuccessfully when outcomes change or metrics
move by more than 20%, allowing a floor of three seconds or two events;
remaining HP has a 15-percentage-point tolerance. Review both easier and
harder changes. An intentional tuning needs a reviewed new baseline.

Profiles include basic attacks, skills used whenever available, levels
matched to the enemy with a proportionate weapon level, a slower learner,
escape-only play, and a low-level three-character rotation. Full sweeps
exercise every quest and each character's starting weapon. They are
hypothetical builds, not a claim that an account can own every character
at that point. Seeds are fixed and reports include the tuning hash.

The bot uses touch input, aims specials and ultimates toward a visible
target, and counts emitted casts rather than failed input attempts. It
does not optimize charged attacks, team reactions, or every weapon passive.
Range preferences are approximate. Its movement planner extrapolates
visible threats; human success rates cannot be inferred from it. A learner
can outperform the quick profile on a seed through a different path.

Keep fairness tests separate. Use full sweeps to find outliers, compare
candidate tunings on the same scenarios, then play them on a phone. The
tool monitors balance; it does not decide good gameplay or silently
retune content. Longer term, add sparse/dense pack probes for cast energy,
weapon comparisons, explicit counterplay bots, enemy attack opportunities
and stun uptime, and upgrade-cost runs per chapter.
