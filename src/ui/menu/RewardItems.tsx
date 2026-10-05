import type { Rewards } from "../../content/quests.ts"
import type { UiStore } from "../store.ts"
import { Icon } from "../Icon.tsx"
import { describeUnlock } from "../describe.ts"
import { ids, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const RewardItems = ({ rewards, store, nav }: { readonly rewards: Rewards; readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value
  return <div class="reward-items">
    {rewards.experience > 0 && <span class="reward-mini" aria-label={`${rewards.experience} account XP`}><Icon name="xp" /><span>{rewards.experience}</span></span>}
    {ids(tuning.currencies).filter((id) => (rewards.currencies[id] ?? 0) > 0).map((id) => <span key={id} class="reward-mini" aria-label={`${rewards.currencies[id]} ${tuning.currencies[id].name}`}><Icon name={id} /><span>{rewards.currencies[id]}</span></span>)}
    {rewards.unlocks.map((unlock) => unlock.kind === "aspect"
      ? <span key={unlock.id} class="reward-mini unlock" aria-label={describeUnlock(tuning, unlock)}><Icon name="aspect" /><small>{describeUnlock(tuning, unlock)}</small></span>
      : <button type="button" key={unlock.id} class="reward-mini unlock" aria-label={`Preview ${describeUnlock(tuning, unlock)}`} onClick={() => nav.go({ kind: "character", character: unlock.id, tab: "kit" })}><Portrait of={{ character: unlock.id }} /><small>{describeUnlock(tuning, unlock)}</small></button>)}
  </div>
}
