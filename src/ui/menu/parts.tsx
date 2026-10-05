/**
 * Pieces the menu's screens share: where they go (`Nav`), the top bar, the
 * wallet, element badges, the big call to action, the places a model or
 * a portrait shows, and an enemy's card. The UI only marks those places (`data-model`,
 * `data-portrait`); the presentation draws into them (see
 * `presentation/showcase.ts`), so the menu never touches the renderer.
 */
import { Icon } from "../Icon.tsx"
import type { ComponentChildren } from "preact"

import type { CharacterId } from "../../content/characters.ts"
import type { CurrencyId } from "../../content/currencies.ts"
import { elements } from "../../content/elements.ts"
import type { ElementId } from "../../content/elements.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import { affinityList, attackElements } from "../describe.ts"
import type { UiStore } from "../store.ts"

/** The menu's screens; the character page opens on one of its tabs. */
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

/** Moving between screens: `go` opens one over the current one, `back` returns to the one before. */
export interface Nav {
  readonly go: (screen: Screen) => void
  readonly replace: (screen: Screen) => void
  readonly back: () => void
}

export const ids = <Id extends string>(record: Record<Id, unknown>): Array<Id> => Object.keys(record) as Array<Id>

/** A screen's top bar: back, its title, and whatever goes on the right. */
export const TopBar = ({ nav, title, children }: { readonly nav: Nav; readonly title: string; readonly children?: ComponentChildren }) => (
  <header class="topbar">
    <button type="button" class="topbar__back" aria-label="Back" onClick={nav.back}>
      <Icon name="back" />
    </button>
    <h1 class="topbar__title">{title}</h1>
    <div class="topbar__end">{children}</div>
  </header>
)

/** The currencies the account holds. */
export const Wallet = ({ store }: { readonly store: UiStore }) => {
  const tuning = store.tuning.value
  const wallet = store.account.value.wallet
  return (
    <div class="wallet">
      {ids(tuning.currencies).map((id: CurrencyId) => (
        <span key={id} class={`wallet__item currency--${id}`} aria-label={`${tuning.currencies[id].name}: ${wallet[id] ?? 0}`} title={`${tuning.currencies[id].name}: for ${tuning.currencies[id].use}`}>
          <Icon name={id} />
          <span class="wallet__amount">{(wallet[id] ?? 0).toLocaleString("en-US")}</span>
        </span>
      ))}
    </div>
  )
}

/** An element's badge (its initial on its color); nothing for no element. */
export const ElementBadge = ({ element }: { readonly element: ElementId | null }) =>
  element === null ? null : (
    <span class="element" data-element={element} title={elements[element].name}>
      <Icon name={element} />
      <span>{elements[element].name}</span>
    </span>
  )

/** The screen's main action: a gold button with a centered label. */
export const Cta = ({ onClick, disabled, children }: { readonly onClick: () => void; readonly disabled?: boolean; readonly children: ComponentChildren }) => (
  <button type="button" class="cta" disabled={disabled} onClick={onClick}>
    <span class="button-label">{children}</span>
  </button>
)

/** Where a character's model stands, playing her idle (drawn by the presentation). */
export const Model = ({ character, turn, reveal, class: className = "" }: { readonly character: CharacterId; readonly turn?: number; readonly reveal?: boolean; readonly class?: string }) => (
  <div class={`model ${className}`} data-model={character} data-turn={turn} data-reveal={reveal ? "true" : undefined} />
)

/** What a portrait shows: a character, or an enemy kind. */
export type PortraitOf = { readonly character: CharacterId } | { readonly enemy: EnemyKind }

/** A small picture of a character or an enemy (drawn by the presentation). */
export const Portrait = ({ of, class: className = "" }: { readonly of: PortraitOf; readonly class?: string }) => (
  <span class={`portrait ${className}`} data-portrait={"character" in of ? of.character : `enemy:${of.enemy}`} />
)

const affinityMarks = { weak: "▲", resists: "▼", immune: "✕" } as const

/** An enemy of a briefing (or the in-game menu): its portrait, name, affinities, and the elements it attacks with (outlined: what it would put on you). */
export const Foe = ({ store, kind, inspect }: { readonly store: UiStore; readonly kind: EnemyKind; readonly inspect?: (kind: EnemyKind) => void }) => {
  const spec = store.tuning.value.enemies[kind]
  const content = (
    <>
      <Portrait of={{ enemy: kind }} />
      <b>{spec.name}</b>
      <span class="foe__traits">
        {affinityList(spec.elements).map(({ element, affinity }) => (
          <i key={element} class={`trait trait--${affinity}`} data-element={element}>
            {elements[element].name} {affinityMarks[affinity]}
          </i>
        ))}
        {attackElements(spec.attacks).map((element) => (
          <i key={`attacks-${element}`} class="trait trait--attacks" data-element={element} title={`Its attacks carry ${elements[element].name.toLowerCase()}`}>
            {elements[element].name} attack
          </i>
        ))}
      </span>
    </>
  )
  return inspect === undefined ? <div class="foe" title={spec.description}>{content}</div> : <button type="button" class="foe" aria-label={`Inspect ${spec.name}`} onClick={() => inspect(kind)}>{content}<small class="inline-icon">Details <Icon name="next" /></small></button>
}
