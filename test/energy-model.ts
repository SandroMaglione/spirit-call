/** Sustained contact in a controlled range, separated from the movement planner. */
import { tuningWith } from "../src/config/tuning.ts"
import type { Tuning } from "../src/config/tuning.ts"
import type { CharacterId } from "../src/content/characters.ts"
import { fighter, runBot } from "./bot.ts"

export const energyAudit = (tuning: Tuning) => {
  // Remove displacement only in this probe so each kit gets uninterrupted contact.
  const range = tuningWith({ ...tuning,
    attacks: Object.fromEntries(Object.entries(tuning.attacks).map(([id, attack]) => [id, { ...attack,
      combo: attack.combo.map((move) => ({ ...move, lunge: 0, knockback: 0 })), dash: { ...attack.dash, lunge: 0, knockback: 0 } }])),
    skills: { bladeWave: { effect: { knockback: 0 } }, tidalWave: { effect: { knockback: 0 } },
      flareJump: { effect: { distance: 0, knockback: 0, leaves: null } }, barrage: { effect: { leaves: null } } },
    enemies: { dummy: { hp: 1000000, knockbackTaken: 0 } }
  })
  return (Object.keys(tuning.characters) as Array<CharacterId>).flatMap((character) => [1, 40].flatMap((level) => [1, 6].map((targets) => {
    const report = runBot({ tuning: range, seconds: 60, mortal: true, still: true, stationaryAttack: true, style: fighter,
      team: [{ character, level, weaponLevel: level === 1 ? 1 : 20 }], abilities: true, measurePressure: false,
      enemies: Array.from({ length: targets }, (_, index) => ({ kind: "dummy", offset: { x: 80, y: (index - (targets - 1) / 2) * 12 } })) })
    return { id: `${character}/${level}/${targets}`, character, level, targets, specials: report.specials, ultimates: report.ultimates }
  })))
}

export const energyViolations = (rows: ReturnType<typeof energyAudit>): Array<string> => rows
  .filter((row) => row.level === 40 && rows.some((other) => other.character === row.character && other.targets === row.targets && other.level === 1 &&
    (row.ultimates !== other.ultimates || row.specials !== other.specials)))
  .map((row) => `${row.id}: level changed controlled energy cadence`)
