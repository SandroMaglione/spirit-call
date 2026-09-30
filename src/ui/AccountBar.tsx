/**
 * The account at a glance, at the top of the menu: its level, the
 * experience toward the next one, and the currencies it holds.
 */
import { accountLevel } from "../account/account.ts"
import type { CurrencyId } from "../content/currencies.ts"
import type { UiStore } from "./store.ts"

export const AccountBar = ({ store }: { readonly store: UiStore }) => {
  const progress = accountLevel(store.tuning.value, store.account.value)
  const maxed = progress.needed === 0
  const tuning = store.tuning.value
  const wallet = store.account.value.wallet
  return (
    <div class="account-bar">
      <span class="account-bar__level">
        Account <b>Lv {progress.level}</b>
      </span>
      <span class="account-bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={maxed ? 1 : progress.needed} aria-valuenow={maxed ? 1 : progress.into}>
        <i style={{ width: `${maxed ? 100 : (100 * progress.into) / progress.needed}%` }} />
      </span>
      <span class="account-bar__numbers">{maxed ? "max" : `${Math.floor(progress.into)} / ${progress.needed} XP`}</span>
      <span class="account-bar__wallet">
        {(Object.keys(tuning.currencies) as Array<CurrencyId>).map((id) => (
          <span key={id} class={`currency currency--${id}`} title={`${tuning.currencies[id].name}: for ${tuning.currencies[id].use}`}>
            <i />
            {wallet[id] ?? 0}
          </span>
        ))}
      </span>
    </div>
  )
}
