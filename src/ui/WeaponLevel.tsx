/**
 * The equipped weapon's level: what the next level adds to its ATK, and
 * upgrading to it with gold.
 */
import { upgrade, upgradeCost, weaponLevel } from "../account/account.ts"
import type { WeaponId } from "../content/weapons.ts"
import { weaponAtk } from "../features/build.ts"
import { describeAmounts } from "./describe.ts"
import type { UiActions, UiStore } from "./store.ts"

export const WeaponLevel = ({ store, actions, weapon }: { readonly store: UiStore; readonly actions: UiActions; readonly weapon: WeaponId }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const spec = tuning.weapons[weapon]
  const level = weaponLevel(account, weapon)
  const cost = upgradeCost(tuning, account, weapon)
  return (
    <div class="level">
      <span class="level__title">
        {spec.name} <b>Lv {level}</b>
        {cost === null && <span class="level__max">max</span>}
      </span>
      {cost !== null && (
        <>
          <span class="level__next">
            Next: ATK +{weaponAtk(tuning, spec, level)} → +{weaponAtk(tuning, spec, level + 1)}
          </span>
          <button type="button" class="level__train" disabled={!upgrade(tuning, account, weapon).ok} onClick={() => actions.upgrade(weapon)}>
            Upgrade to Lv {level + 1} · {describeAmounts(tuning, cost)}
          </button>
        </>
      )}
    </div>
  )
}
