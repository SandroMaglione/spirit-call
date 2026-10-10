/**
 * The inventory, a shelf of the collection (see `Collection.tsx`): everything
 * the wallet holds, a card each (gold, then each essence),
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
import type { IconName } from "../Icon.tsx"
import { ids, materialIconOf } from "./parts.tsx"

const isMaterial = (store: UiStore, id: ResourceId): id is MaterialId => Object.hasOwn(store.tuning.value.materials, id)

/** Where `id` comes from, in a line or two. */
const sources = (store: UiStore, id: ResourceId): ReadonlyArray<string> => {
  const tuning = store.tuning.value
  if (id === "gold") return ["Every run: more against stronger enemies", "First clears, chests, hardcore tiers, and discoveries"]
  if (!isMaterial(store, id)) return []
  const { element, grade } = tuning.materials[id]
  if (element === null) {
    const rank = grade === 2 ? "II" : "III"
    return [`Trial ranks opened by rank ${rank}, on every clear`, `First clears and chests at rank ${rank}`, `Hardcore tiers opened by rank ${rank}, once`]
  }
  const trial = Object.values(tuning.tracks).find((track) => track.kind === "trial" && track.element === element)
  const quests = Object.values(tuning.quests).filter((quest) => quest.element === element).length
  const tracks = Object.values(tuning.tracks).filter((track) => track.kind === "hardcore" && track.element === element).map((track) => track.name)
  return [
    ...(trial === undefined ? [] : [`The ${trial.name}, on every clear: more at higher ranks`]),
    `The first clear of ${quests} quests`,
    ...(tracks.length === 0 ? [] : [`${tracks.join(" and ")}, once per tier`])
  ]
}

/** What a resource is for, in a few words. */
const useOf = (store: UiStore, id: ResourceId): string => {
  const tuning = store.tuning.value
  if (!isMaterial(store, id)) return "training characters, and ascending them"
  const { element, grade } = tuning.materials[id]
  const steps = tuning.materialRules.ascension.filter((step) => step.grade === grade).map((step) => step.level).join(", ")
  return `ascending ${element === null ? "any" : element} characters past level ${steps}`
}

export const InventoryShelf = ({ store }: { readonly store: UiStore }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all: ReadonlyArray<ResourceId> = [...ids(tuning.currencies), ...ids(tuning.materials)]
  const selected = useSignal<ResourceId>(all[0]!)
  const id = selected.value, held = account.wallet[id] ?? 0
  const name = isMaterial(store, id) ? tuning.materials[id].name : tuning.currencies[id as keyof typeof tuning.currencies].name
  const element = isMaterial(store, id) ? tuning.materials[id].element ?? undefined : undefined
  const icon = (each: ResourceId): IconName => isMaterial(store, each) ? materialIconOf(store, each) : "gold"
  return <>
    <div class="inventory__cards scroll in-left"><Cards>{all.map((each) => {
      const material = isMaterial(store, each)
      return <Card key={each} tint={material ? tuning.materials[each].element ?? undefined : undefined} label={material ? tuning.materials[each].name : tuning.currencies[each as keyof typeof tuning.currencies].name}
        selected={each === id} onClick={() => (selected.value = each)} art={<Icon name={icon(each)} />}
        foot={(account.wallet[each] ?? 0).toLocaleString("en-US")} />
    })}</Cards></div>
    <Panel class="inventory__brief in-right" element={element} icon={<Icon name={icon(id)} />} title={name} detail={held.toLocaleString("en-US")}
      note={`For ${useOf(store, id)}`}>
      <div class="inventory__sources">{sources(store, id).map((line) => <p key={line} class="inventory__source">{line}</p>)}</div>
    </Panel>
  </>
}
