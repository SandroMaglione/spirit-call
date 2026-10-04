import { useSignal } from "@preact/signals"
import type { DiscoveryId } from "../../content/discoveries.ts"
import { Dialog } from "../Dialog.tsx"
import { Icon } from "../Icon.tsx"
import { describeAmounts } from "../describe.ts"
import type { UiStore } from "../store.ts"
import { Cta, ids, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Discoveries = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const selected = useSignal<DiscoveryId | null>(null)
  const tuning = store.tuning.value, account = store.account.value, all = ids(tuning.discoveries)
  const inspected = selected.value === null ? null : tuning.discoveries[selected.value]
  return <div class="screen discoveries">
    <span class="discoveries__count">{all.filter((id) => account.discoveries[id] !== undefined).length} / {all.length}</span>
    <div class="discoveries__list">{all.map((id) => {
      const spec = tuning.discoveries[id], made = account.discoveries[id] !== undefined
      return <button type="button" class={`discovery${made ? " is-made" : ""}`} key={id} onClick={() => (selected.value = id)}>
        {spec.check.kind === "clearWith" ? <Portrait of={{ character: spec.check.character }} /> : <Icon name={spec.check.kind === "fullTeam" ? "team" : "discovery"} />}
        <b>{spec.name}</b><span class="discovery__reward">{made ? <Icon name="check" /> : <><Icon name="crystals" />{spec.rewards.crystals ?? 0}</>}</span>
      </button>
    })}</div>
    {inspected !== null && <Dialog title={inspected.name} close={() => (selected.value = null)}><p>{inspected.description}</p><p>{describeAmounts(tuning, inspected.rewards, "+")}</p><Cta onClick={() => { selected.value = null; nav.go({ kind: "team" }) }}>Party <Icon name="team" /></Cta></Dialog>}
  </div>
}
