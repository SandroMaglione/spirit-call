/**
 * The discoveries: a short list of firsts worth trying, each paying crystals
 * once (see `content/discoveries.ts`).
 */
import { describeAmounts } from "../describe.ts"
import type { UiStore } from "../store.ts"
import { ids, TopBar } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Discoveries = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const all = ids(tuning.discoveries)
  return (
    <div class="screen discoveries">
      <TopBar nav={nav} title="Discoveries">
        <span class="discoveries__count">
          {all.filter((id) => account.discoveries[id] !== undefined).length} / {all.length}
        </span>
      </TopBar>
      <div class="discoveries__grid">
        {all.map((id) => {
          const spec = tuning.discoveries[id]
          const made = account.discoveries[id] !== undefined
          return (
            <div key={id} class={`discovery${made ? " is-made" : ""}`}>
              <b>{spec.name}</b>
              <small>{spec.description}</small>
              <span class="discovery__reward">{made ? "✓" : describeAmounts(tuning, spec.rewards, "+")}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
