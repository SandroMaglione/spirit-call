/** The menu's screens, and moving between them. */
import type { CharacterId } from "../../content/characters.ts"

/** The character page opens on one of its tabs, the challenges and the practice on one of theirs. */
export type Screen =
  | { readonly kind: "home" }
  | { readonly kind: "quests"; readonly tab: QuestTab }
  | { readonly kind: "team" }
  | { readonly kind: "character"; readonly character: CharacterId; readonly tab: CharacterTab }
  | { readonly kind: "discoveries" }
  | { readonly kind: "extra"; readonly mode: "training" | "practice" }
  | { readonly kind: "settings" }

export type QuestTab = "main" | "secondary" | "hardcore"
export type CharacterTab = "overview" | "aspect" | "kit"

/** Moving between screens: `go` opens one over the current one, `replace` swaps it (a tab), `back` returns to the one before. */
export interface Nav {
  readonly go: (screen: Screen) => void
  readonly replace: (screen: Screen) => void
  readonly back: () => void
}
