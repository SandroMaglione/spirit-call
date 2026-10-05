/** The discoveries: a card each, and the one selected explained beside them (what to do, what it pays). */
import { useSignal } from "@preact/signals"
import type { DiscoveryId } from "../../content/discoveries.ts"
import { elementOf as elementOfState } from "../../content/elements.ts"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"
import { Portrait } from "../kit/art.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Pill } from "../kit/controls.tsx"
import { Panel } from "../kit/panel.tsx"
import { Actions, Screen, TopBar } from "../kit/shell.tsx"
import type { UiStore } from "../store.ts"
import { ids, Wallet } from "./parts.tsx"
import type { Nav } from "./screens.ts"

export const Discoveries = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value, all = ids(tuning.discoveries)
  const made = (id: DiscoveryId) => account.discoveries[id] !== undefined
  const selected = useSignal<DiscoveryId>(all.find((id) => !made(id)) ?? all[0]!)
  /** What a discovery shows: who it is about, or the element of the state it bursts. */
  const look = (id: DiscoveryId): { readonly tint: string | undefined; readonly icon: IconName | null } => {
    const check = tuning.discoveries[id].check
    if (check.kind === "clearWith") return { tint: elementOf(tuning, check.character), icon: null }
    if (check.kind === "fullTeam") return { tint: undefined, icon: "team" }
    if (check.reaction === "slam") return { tint: undefined, icon: "discovery" }
    return { tint: elementOfState(check.reaction), icon: elementOfState(check.reaction) }
  }
  const spec = tuning.discoveries[selected.value], shown = look(selected.value)
  return <Screen name="discoveries">
    <TopBar icon="discovery" title="Discoveries" detail={`${all.filter(made).length} / ${all.length}`} close={nav.back} end={<Wallet store={store} currencies={["crystals"]} />} />
    <div class="discoveries__cards scroll in-left"><Cards>{all.map((id) => {
      const each = tuning.discoveries[id], { tint, icon } = look(id)
      return <Card key={id} size="large" tint={tint} label={each.name} selected={id === selected.value} mark={made(id) ? "tick" : undefined} onClick={() => (selected.value = id)}
        art={each.check.kind === "clearWith" ? <Portrait of={{ character: each.check.character }} /> : <Icon name={icon ?? "discovery"} />}
        foot={made(id) ? "Done" : <><Icon name="crystals" />{each.rewards.crystals ?? 0}</>} />
    })}</Cards></div>
    <Panel class="discoveries__brief in-right" element={shown.tint} icon={shown.icon === null ? undefined : <Icon name={shown.icon} />} title={spec.name} detail={<><Icon name="crystals" />{spec.rewards.crystals ?? 0}</>} note={made(selected.value) ? "Discovered." : undefined} noteIcon="check">
      <p>{spec.description}</p>
      <p class="dim">A discovery pays once, the first time it happens in a run.</p>
    </Panel>
    <Actions><Pill icon="team" onClick={() => nav.go({ kind: "team" })}>Party</Pill></Actions>
  </Screen>
}
