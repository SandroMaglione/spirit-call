/** The menu's screens, and moving between them. */
import type { CharacterId } from "../../content/characters.ts"

/** The character page opens on one of its tabs, the challenges, the practice, and the Spirit Call on one of theirs. */
export type Screen =
  | { readonly kind: "home" }
  | { readonly kind: "quests"; readonly tab: QuestTab }
  | { readonly kind: "team" }
  | { readonly kind: "character"; readonly character: CharacterId; readonly tab: CharacterTab }
  | { readonly kind: "discoveries" }
  | { readonly kind: "extra"; readonly mode: "training" | "practice" }
  | { readonly kind: "settings" }
  | { readonly kind: "call"; readonly tab: CallTab }
  | { readonly kind: "loadout"; readonly character: CharacterId; readonly tab: LoadoutTab }
  | { readonly kind: "shop"; readonly tab: ShopTab }

export type QuestTab = "main" | "secondary" | "trials" | "hardcore"
export type CharacterTab = "overview" | "loadout" | "kit"
/** What a character fights and shows with, on its own screen: her aspect, her relics, and her looks. */
export type LoadoutTab = "aspect" | "relics" | "looks"
/** The shop's shelves: relics one tier up, looks, and the inventory (what the wallet holds). */
export type ShopTab = "relics" | "looks" | "inventory"
/** The Spirit Call's views: the banner running, its odds, and the last calls. */
export type CallTab = "banner" | "details" | "history"

/** Moving between screens: `go` opens one over the current one, `replace` swaps it (a tab), `back` returns to the one before. */
export interface Nav {
  readonly go: (screen: Screen) => void
  readonly replace: (screen: Screen) => void
  readonly back: () => void
}
