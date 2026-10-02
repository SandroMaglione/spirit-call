/**
 * Weapons: what a character wields. A weapon fits characters of its `type`
 * (the character keeps its moveset), adds `atk` to theirs, raises one stat by
 * a percentage, and may have passives (see `content/passives.ts`). Numbers
 * are live-tunable: they are part of the `Tuning` resource.
 */
import type { Stats } from "./characters.ts"
import { cast, combo, damageBonus, doing, finisher, heal, kill, on, targetHealthBelow, withMove } from "./passives.ts"
import type { Passive } from "./passives.ts"
import { nova } from "./skills.ts"

export type WeaponType = "sword" | "gun" | "disc" | "staff"

/** A percentage raise of one stat, on top of the character's (and, for ATK, the weapon's) base. */
export interface StatBonus {
  readonly stat: keyof Stats
  readonly percent: number
}

export interface WeaponSpec {
  /** Shown in menus. */
  readonly name: string
  readonly type: WeaponType
  /** Added to the character's ATK. */
  readonly atk: number
  readonly bonus: StatBonus | null
  readonly passives: ReadonlyArray<Passive>
}

const weapon = (spec: WeaponSpec): WeaponSpec => spec
const bonus = (stat: keyof Stats, percent: number): StatBonus | null => ({ stat, percent })
const noBonus = (): StatBonus | null => null

/** Every weapon, by id. */
export const weapons = {
  /** The swordsman's first sword: stats only. */
  trainingBlade: weapon({ name: "Training Blade", type: "sword", atk: 20, bonus: noBonus(), passives: [] }),
  /** Crescendo: each move of the combo hits harder than the last. */
  crescendo: weapon({
    name: "Crescendo",
    type: "sword",
    atk: 30,
    bonus: bonus("atk", 10),
    passives: [damageBonus(10, withMove(combo(2))), damageBonus(20, withMove(combo(3))), damageBonus(40, withMove(finisher()))]
  }),
  /** Echo Saber: the combo's finisher also sets off a small shockwave around the wielder. */
  echoSaber: weapon({
    name: "Echo Saber",
    type: "sword",
    atk: 25,
    bonus: bonus("def", 20),
    passives: [
      on(doing(finisher()), cast(nova({ radius: 150, power: 30, element: null, knockback: 700, active: 0.08, clearsProjectiles: false, hitStop: 0.03, heavy: false })))
    ]
  }),
  /** The gunner's first gun: stats only. */
  trainingPistol: weapon({ name: "Training Pistol", type: "gun", atk: 20, bonus: noBonus(), passives: [] }),
  /** Executioner: finishes off the wounded. */
  executioner: weapon({ name: "Executioner", type: "gun", atk: 30, bonus: bonus("speed", 8), passives: [damageBonus(50, targetHealthBelow(0.3))] }),
  /** Bloodthirst: every kill heals the wielder. */
  bloodthirst: weapon({ name: "Bloodthirst", type: "gun", atk: 25, bonus: bonus("hp", 15), passives: [on(kill(), heal(5))] }),
  /** The Tidecaller's first disc: stats only. */
  trainingDisc: weapon({ name: "Training Disc", type: "disc", atk: 20, bonus: noBonus(), passives: [] }),
  /** Undertow: the combo's finisher also soaks everything around the wielder. */
  undertow: weapon({
    name: "Undertow",
    type: "disc",
    atk: 25,
    bonus: bonus("hp", 10),
    passives: [
      on(doing(finisher()), cast(nova({ radius: 140, power: 15, element: "water", knockback: 380, active: 0.08, clearsProjectiles: false, hitStop: 0.02, heavy: false })))
    ]
  }),
  /** The Stormcaller's first staff: stats only. */
  trainingStaff: weapon({ name: "Training Staff", type: "staff", atk: 20, bonus: noBonus(), passives: [] }),
  /** Lightning Rod: the combo's finisher also sets off a crackle of thunder around the wielder (shocking soaked enemies). */
  lightningRod: weapon({
    name: "Lightning Rod",
    type: "staff",
    atk: 25,
    bonus: bonus("atk", 8),
    passives: [
      on(doing(finisher()), cast(nova({ radius: 150, power: 16, element: "thunder", knockback: 120, active: 0.08, clearsProjectiles: false, hitStop: 0.02, heavy: false })))
    ]
  })
}

export type WeaponId = keyof typeof weapons
