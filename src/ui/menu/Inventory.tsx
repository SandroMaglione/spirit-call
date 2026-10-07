/**
 * The inventory: everything the wallet holds, a card each (the currencies,
 * then each element's material), and the one selected explained beside them:
 * what it is for, where it comes from, and who on the roster needs it next.
 */
import { useSignal } from "@preact/signals"
import { ascensionStep, owns } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import type { ResourceId } from "../../content/currencies.ts"
import type { MaterialId } from "../../content/materials.ts"
import { Icon } from "../Icon.tsx"
import { Card, Cards } from "../kit/Card.tsx"
import { Fact, Label, Panel } from "../kit/panel.tsx"
import { Screen, TopBar } from "../kit/shell.tsx"
import type { UiStore } from "../store.ts"
import { ids } from "./parts.tsx"
import type { Nav } from "./screens.ts"

const isMaterial = (store: UiStore, id: ResourceId): id is MaterialId => Object.hasOwn(store.tuning.value.materials, id)

/** Where `id` comes from, in a line or two. */
const sources = (store: UiStore, id: ResourceId): ReadonlyArray<string> => {
  const tuning = store.tuning.value
  if (id === "crystals") return ["First clears of quests, and their stars' chests", "Account levels and discoveries", "Hardcore tiers, once per week"]
  if (id === "gold") return ["Every run: more against stronger enemies", "First clears, chests, and hardcore tiers"]
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

export const Inventory = ({ store, nav }: { readonly store: UiStore; readonly nav: Nav }) => {
  const tuning = store.tuning.value, account = store.account.value
  const all: ReadonlyArray<ResourceId> = [...ids(tuning.currencies), ...ids(tuning.materials)]
  const selected = useSignal<ResourceId>(all[0]!)
  const id = selected.value, held = account.wallet[id] ?? 0
  const name = isMaterial(store, id) ? tuning.materials[id].name : tuning.currencies[id as keyof typeof tuning.currencies].name
  const element = isMaterial(store, id) ? tuning.materials[id].element : undefined
  // Who owns a character of this material's element, and what her next step asks.
  const needs = element === undefined ? [] : ids(tuning.characters).filter((character: CharacterId) => tuning.characters[character].element === element && owns(account, { kind: "character", id: character })).map((character) => {
    const next = tuning.materialRules.ascension[account.owned.characters[character]?.ascension ?? 0]
    return { character, count: next?.count ?? null, now: ascensionStep(tuning, account, character) !== null }
  })
  return <Screen name="inventory">
    <TopBar icon="chest" title="Inventory" close={nav.back} />
    <div class="inventory__cards scroll in-left"><Cards>{all.map((each) => {
      const material = isMaterial(store, each)
      return <Card key={each} tint={material ? tuning.materials[each].element : undefined} label={material ? tuning.materials[each].name : tuning.currencies[each as keyof typeof tuning.currencies].name}
        selected={each === id} onClick={() => (selected.value = each)} art={<Icon name={material ? tuning.materials[each].element : (each as "gold" | "crystals")} />}
        foot={(account.wallet[each] ?? 0).toLocaleString("en-US")} />
    })}</Cards></div>
    <Panel class="inventory__brief in-right" element={element} icon={<Icon name={element ?? (id as "gold" | "crystals")} />} title={name} detail={held.toLocaleString("en-US")}>
      <div>
        <Fact label="For" value={isMaterial(store, id) ? `Ascending ${element} characters past levels ${tuning.materialRules.ascension.map((step) => step.level).join(", ")}` : tuning.currencies[id as keyof typeof tuning.currencies].use === "pulls" ? "Spirit Calls" : "Training characters, and ascending them"} />
      </div>
      <div class="brief-section">
        <Label>Where it comes from</Label>
        {sources(store, id).map((line) => <p key={line} class="inventory__source">{line}</p>)}
      </div>
      {needs.length > 0 && <div class="brief-section">
        <Label>Next ascension</Label>
        {needs.map((need) => <p key={need.character} class="inventory__source">{tuning.characters[need.character].name}: {need.count === null ? "fully ascended" : `${need.count.toLocaleString("en-US")}${need.now ? ", now" : ""}`}</p>)}
      </div>}
    </Panel>
  </Screen>
}
