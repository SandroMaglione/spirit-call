/** The menu's screens, and moving between them. */
import type { CharacterId } from "../../content/characters.ts"
import type { CosmeticKind } from "../../content/cosmetics.ts"
import type { RelicSlot } from "../../content/relics.ts"

/** The character page opens on one of its tabs, the challenges, the practice, and the collection on one of theirs. */
export type Screen =
  | { readonly kind: "home" }
  | { readonly kind: "quests"; readonly tab: QuestTab }
  | { readonly kind: "team" }
  | { readonly kind: "character"; readonly character: CharacterId; readonly tab: CharacterTab }
  | { readonly kind: "discoveries" }
  | { readonly kind: "extra"; readonly mode: "training" | "practice" }
  | { readonly kind: "settings" }
  | { readonly kind: "inventory" }

  | { readonly kind: "gear"; readonly character: CharacterId; readonly tab: GearTab; readonly focus?: GearFocus }
  | { readonly kind: "collection"; readonly tab: CollectionTab }

export type QuestTab = "main" | "secondary" | "auditions" | "trials" | "hardcore"
export type CharacterTab = "overview" | "gear" | "kit"
/** What a character fights and shows with, on its own screen: her aspect, her relics, and her looks. */
export type GearTab = "aspect" | "relics" | "looks"
/** Where the gear screen opens within its tab: a relic slot, or a kind of look. */
export type GearFocus = RelicSlot | CosmeticKind
/** The collection's shelves (see docs/collection.md): characters, aspects, relics, and looks. */
export type CollectionTab = "characters" | "aspects" | "relics" | "looks"

/** Moving between screens: `go` opens one over the current one, `replace` swaps it (a tab), `back` returns to the one before. */
export interface Nav {
  readonly go: (screen: Screen) => void
  readonly replace: (screen: Screen) => void
  readonly back: () => void
}
