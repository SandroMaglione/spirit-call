/**
 * The inventory, a shelf of the shop (see `Shop.tsx`): everything the
 * wallet holds, a card each (the currencies, then each element's material),
 * and the one selected explained beside them: where it comes from, and
 * what it is for (at its foot).
 */
import { useSignal } from "@preact/signals"
import type { ResourceId } from "../../content/currencies.ts"
import type { MaterialId } from "../../content/materials.ts"
import { Icon } from "../Icon.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Panel } from "../kit/panel.tsx"
import type { UiStore } from "../store.ts"
import { ids } from "./parts.tsx"

const isMaterial = (store: UiStore, id: ResourceId): id is MaterialId => Object.hasOwn(store.tuning.value.materials, id)

/** Where `id` comes from, in a line or two. */
const sources = (store: UiStore, id: ResourceId): ReadonlyArray<string> => {
  const tuning = store.tuning.value
  if (id === "crystals") return ["First clears of quests, and their stars' chests", "Account levels and discoveries", "Hardcore tiers, once per week"]
  if (id === "gold") return ["Every run: more against stronger enemies", "First clears, chests, and hardcore tiers"]
  if (id === "dust") return ["Side quests, ranks, and their chests: first clears", "Hardcore tiers and trials, once per week"]
  if (!isMaterial(store, id)) return []
  const element = tuning.materials[id].element
  const trial = Object.values(tuning.tracks).find((track) => track.kind === "trial" && track.element === element)
  const quests = Object.values(tuning.quests).filter((quest) => quest.element === element).length
  const tracks = Object.values(tuning.tracks).filter((track) => track.kind === "hardcore" && track.element === element).map((track) => track.name)
  return [
    ...(trial === undefined ? [] : [`The ${trial.name}, on every clear: more at higher ranks`]),
    `The first clear of ${quests} quests`,
    ...(tracks.length === 0 ? [] : [`${tracks.join(" and ")}, once per week`])
  ]
}

/** What a currency is for, in a few words. */
const uses = { pulls: "Spirit Calls", upgrades: "training characters, and ascending them", "the shop": "the shop: a relic's next tier, and looks" } as const

export const InventoryShelf = ({ store }: { readonly store: UiStore }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all: ReadonlyArray<ResourceId> = [...ids(tuning.currencies), ...ids(tuning.materials)]
  const selected = useSignal<ResourceId>(all[0]!)
  const id = selected.value, held = account.wallet[id] ?? 0
  const name = isMaterial(store, id) ? tuning.materials[id].name : tuning.currencies[id as keyof typeof tuning.currencies].name
  const element = isMaterial(store, id) ? tuning.materials[id].element : undefined
  return <>
    <div class="inventory__cards scroll in-left"><Cards>{all.map((each) => {
      const material = isMaterial(store, each)
      return <Card key={each} tint={material ? tuning.materials[each].element : undefined} label={material ? tuning.materials[each].name : tuning.currencies[each as keyof typeof tuning.currencies].name}
        selected={each === id} onClick={() => (selected.value = each)} art={<Icon name={material ? tuning.materials[each].element : (each as "gold" | "crystals" | "dust")} />}
        foot={(account.wallet[each] ?? 0).toLocaleString("en-US")} />
    })}</Cards></div>
    <Panel class="inventory__brief in-right" element={element} icon={<Icon name={element ?? (id as "gold" | "crystals" | "dust")} />} title={name} detail={held.toLocaleString("en-US")}
      note={`For ${isMaterial(store, id) ? `ascending ${element} characters past levels ${tuning.materialRules.ascension.map((step) => step.level).join(", ")}` : uses[tuning.currencies[id as keyof typeof tuning.currencies].use as keyof typeof uses]}`}>
      <div class="inventory__sources">{sources(store, id).map((line) => <p key={line} class="inventory__source">{line}</p>)}</div>
    </Panel>
  </>
}
