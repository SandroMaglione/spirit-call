/**
 * The game's own pieces, built from the kit (`../kit/`), for every screen
 * to share: a character or an enemy as a card, what an enemy is weak to,
 * amounts of rewards, the wallet, and the party as a strip of faces. A
 * screen that needs one of these in a new way should grow it here, not
 * draw its own.
 */
import type { CharacterId } from "../../content/characters.ts"
import { characterLevel, owns, sourcesOf } from "../../account/account.ts"
import { sourceOf as itemSource } from "../../content/collection.ts"
import type { Source } from "../../content/collection.ts"
import { skillSlots } from "../../content/skills.ts"
import type { Amounts as Held, CurrencyId } from "../../content/currencies.ts"
import type { MaterialId } from "../../content/materials.ts"
import { elements } from "../../content/elements.ts"
import type { Affinities as Traits } from "../../content/elements.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import type { Rewards, Unlock } from "../../content/quests.ts"
import { aspectOf } from "../../content/aspects.ts"
import { cosmeticOf } from "../../content/cosmetics.ts"
import type { CosmeticId } from "../../content/cosmetics.ts"
import { relicOf } from "../../content/relics.ts"
import { LookIcon, RelicIcon } from "../RelicIcon.tsx"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { affinityList, affinityNames, attackElements, describeSkill, describeUnlock, resourceName } from "../describe.ts"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"
import { Face, Portrait } from "../kit/art.tsx"
import { Card } from "../kit/Card.tsx"
import { RoundButton } from "../kit/controls.tsx"
import { Fact } from "../kit/panel.tsx"
import { Coin } from "../kit/shell.tsx"
import type { UiStore } from "../store.ts"

export const ids = <Id extends string>(record: Record<Id, unknown>): Array<Id> => Object.keys(record) as Array<Id>

/** The currencies the account holds (all of them, or only the ones a screen spends). */
export const Wallet = ({ store, currencies }: { readonly store: UiStore; readonly currencies?: ReadonlyArray<CurrencyId> }) => {
  const tuning = store.tuning.value, wallet = store.account.value.wallet
  return <div class="wallet">{(currencies ?? ids(tuning.currencies)).map((id: CurrencyId) => <Coin key={id} icon={id} label={`${tuning.currencies[id].name}: ${wallet[id] ?? 0}`}>{(wallet[id] ?? 0).toLocaleString("en-US")}</Coin>)}</div>
}

/** A character as a card: her portrait on her element, her level at the foot (a lock when not owned). */
export const CharacterCard = ({ store, character, mark, selected, fresh, foot, onClick }: {
  readonly store: UiStore; readonly character: CharacterId; readonly mark?: "tick" | number | undefined; readonly selected?: boolean; readonly fresh?: boolean
  /** Instead of her level. */
  readonly foot?: string
  readonly onClick?: (() => void) | undefined
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const owned = owns(account, { kind: "character", id: character }), element = elementOf(tuning, character)
  return <Card art={<Portrait of={{ character }} />} foot={foot ?? (owned ? `Lv ${characterLevel(tuning, account, character).level}` : <Icon name="lock" />)} tint={element} corner={element} mark={mark} selected={selected ?? false} fresh={fresh ?? false} locked={!owned && foot === undefined} label={tuning.characters[character].name} onClick={onClick} />
}

/** An enemy as a card: its portrait, its name at the foot (a lock when not met yet). */
export const EnemyCard = ({ store, kind, mark, selected, size, locked = false, onClick }: {
  readonly store: UiStore; readonly kind: EnemyKind; readonly mark?: "tick" | undefined; readonly selected?: boolean; readonly size?: "small"; readonly locked?: boolean; readonly onClick?: (() => void) | undefined
}) => <Card art={<Portrait of={{ enemy: kind }} />} foot={locked ? <Icon name="lock" /> : store.tuning.value.enemies[kind].name} mark={mark} selected={selected ?? false} locked={locked} {...(size === undefined ? {} : { size })} label={store.tuning.value.enemies[kind].name} onClick={onClick} />

/** An enemy's affinities as element icons, what it is weak to first; one it resists is struck out, one it is immune to crossed out. */
export const Affinities = ({ traits }: { readonly traits: Traits }) => (
  <span class="affinities">{affinityList(traits).map(({ element, affinity }) => <span key={element} data-affinity={affinity} aria-label={`${affinityNames[affinity]} ${elements[element].name}`}><Icon name={element} /></span>)}</span>
)

/** The enemies of a fight, each over what it is weak to: tap one to read about it (`inspect`), again to put it back. */
export const Enemies = ({ store, kinds, inspected, inspect }: { readonly store: UiStore; readonly kinds: ReadonlyArray<EnemyKind>; readonly inspected: EnemyKind | null; readonly inspect: (kind: EnemyKind | null) => void }) => (
  <div class="enemies scroll-x">{kinds.map((kind) => <div key={kind} class="enemies__one">
    <EnemyCard store={store} kind={kind} size="small" selected={kind === inspected} onClick={() => inspect(kind === inspected ? null : kind)} />
    <Affinities traits={store.tuning.value.enemies[kind].elements} />
  </div>)}</div>
)

/** A fight's enemies as faces over what they are weak to, where room is short (a brief), wrapping onto as many lines as they need. */
export const EnemyRow = ({ store, kinds }: { readonly store: UiStore; readonly kinds: ReadonlyArray<EnemyKind> }) => (
  <div class="enemies enemies--wrap">{kinds.map((kind) => <span key={kind} class="enemies__face" title={store.tuning.value.enemies[kind].name} aria-label={store.tuning.value.enemies[kind].name}>
    <Face of={{ enemy: kind }} size={32} />
    <Affinities traits={store.tuning.value.enemies[kind].elements} />
  </span>)}</div>
)

/** A fight's enemies as faces over what they are weak to, where room is short (a brief), wrapping onto as many lines as they need: tap one to read about it, again to put it back. */
export const EnemyFaces = ({ store, kinds, inspected, inspect }: { readonly store: UiStore; readonly kinds: ReadonlyArray<EnemyKind>; readonly inspected: EnemyKind | null; readonly inspect: (kind: EnemyKind | null) => void }) => (
  <div class="enemies enemies--wrap">{kinds.map((kind) => <button type="button" key={kind} class="enemies__face face-button" aria-label={store.tuning.value.enemies[kind].name} aria-pressed={kind === inspected} onClick={() => inspect(kind === inspected ? null : kind)}>
    <Face of={{ enemy: kind }} selected={kind === inspected} size={32} />
    <Affinities traits={store.tuning.value.enemies[kind].elements} />
  </button>)}</div>
)

const affinityLabels = { weak: "Weak to", resists: "Resists", immune: "Immune to" } as const

/** What to know about an enemy: what it does, what each element does to it, and what its attacks carry. */
export const EnemyFacts = ({ store, kind }: { readonly store: UiStore; readonly kind: EnemyKind }) => {
  const spec = store.tuning.value.enemies[kind]
  const traits = affinityList(spec.elements), attacks = attackElements(spec.attacks)
  return <>
    <p>{spec.description}</p>
    <div>
      {(["weak", "resists", "immune"] as const).map((affinity) => {
        const those = traits.filter((trait) => trait.affinity === affinity)
        return those.length === 0 ? null : <Fact key={affinity} label={affinityLabels[affinity]} value={those.map(({ element }) => <Icon key={element} name={element} />)} />
      })}
      {traits.length === 0 && <Fact label="Elements" value="No weakness" />}
      <Fact label="Attacks with" value={attacks.length === 0 ? "No element" : attacks.map((element) => <Icon key={element} name={element} />)} />
    </div>
  </>
}

/** A material: its element's emblem, or its grade's stone (named in full for touch and screen readers). */
export const MaterialIcon = ({ store, material }: { readonly store: UiStore; readonly material: MaterialId }) => {
  const spec = store.tuning.value.materials[material]
  return <span class="material-icon" data-element={spec.element ?? undefined} title={spec.name}><Icon name={materialIconOf(store, material)} /></span>
}

/** The icon of a material: its element's emblem, or for the shared grades their stone. */
export const materialIconOf = (store: UiStore, material: MaterialId): IconName => {
  const spec = store.tuning.value.materials[material]
  return spec.element ?? (spec.grade === 2 ? "refined" : "core")
}

/** The materials among `amounts`, in the content's order (each element, lowest grade first). */
export const materialsIn = (store: UiStore, amounts: Held): ReadonlyArray<MaterialId> =>
  ids(store.tuning.value.materials).filter((id) => (amounts[id] ?? 0) > 0)

/** A star per goal, lit when earned (`fresh`: earned just now). */
/** A quest's stars; `perfect`: all of them were earned in one run, which shows as one glow around them. */
export const Stars = ({ earned, total = 3, fresh = [], perfect = false }: { readonly earned: ReadonlyArray<number>; readonly total?: number; readonly fresh?: ReadonlyArray<number>; readonly perfect?: boolean }) => (
  <span class={`stars${perfect ? " is-perfect" : ""}`} aria-label={`${earned.length} of ${total} stars${perfect ? ", perfect" : ""}`}>{Array.from({ length: total }, (_, index) => <span key={index} class={`star${earned.includes(index) ? " is-earned" : ""}${fresh.includes(index) ? " is-fresh" : ""}`}><Icon name="star" /></span>)}</span>
)

/**
 * Something a reward makes yours, shown as the prize it is: a character's
 * face, or an aspect's class on a dark disc, inside a turning gold ring
 * with a soft pulse and a passing glint.
 */
export const UnlockBadge = ({ store, unlock, small = false }: { readonly store: UiStore; readonly unlock: Unlock; readonly small?: boolean }) => {
  const tuning = store.tuning.value
  return <span class={small ? "unlock-badge unlock-badge--small" : "unlock-badge"} data-kind={unlock.kind}>
    <span class="unlock-badge__ring" aria-hidden="true" />
    {unlock.kind === "character"
      ? <Face of={{ character: unlock.id }} tint={elementOf(tuning, unlock.id)} size={small ? 21 : 28} />
      : <span class="unlock-badge__aspect">{unlock.kind === "aspect"
        ? <AbilityIcon kind={aspectOf(tuning.aspects, unlock.id).class} />
        : unlock.kind === "relic" || unlock.kind === "relicTier"
          ? <RelicIcon slot={relicOf(tuning.relics, unlock.id).slot} element={relicOf(tuning.relics, unlock.id).element} />
          : <LookIcon kind={cosmeticOf(tuning.cosmetics, unlock.id).kind} />}</span>}
    <span class="unlock-badge__glint" aria-hidden="true" />
  </span>
}

/** What something gives: gold and essence, then what it unlocks on a line of its own (`preview` opens an unlocked character; `compact`: unlocks as their badge alone, small and in line, named on touch). */
export const Amounts = ({ store, rewards, preview, compact = false }: { readonly store: UiStore; readonly rewards: Rewards; readonly preview?: (character: CharacterId) => void; readonly compact?: boolean }) => {
  const tuning = store.tuning.value
  return <div class={compact ? "amounts amounts--compact" : "amounts"}>
    {ids(tuning.currencies).filter((id) => (rewards.currencies[id] ?? 0) > 0).map((id) => <span key={id} aria-label={`${rewards.currencies[id]} ${tuning.currencies[id].name}`}><Icon name={id} />{(rewards.currencies[id] ?? 0).toLocaleString("en-US")}</span>)}
    {materialsIn(store, rewards.currencies).map((id) => <span key={id} aria-label={`${rewards.currencies[id]} ${resourceName(tuning, id)}`}><MaterialIcon store={store} material={id} />{rewards.currencies[id]}</span>)}
    {rewards.unlocks.length > 0 && <span class="amounts__unlocks">{rewards.unlocks.map((unlock) => unlock.kind !== "character"
      ? <span key={`${unlock.kind}-${unlock.id}`} class="amounts__unlock" aria-label={describeUnlock(tuning, unlock)} title={describeUnlock(tuning, unlock)}><UnlockBadge store={store} unlock={unlock} small={compact} />{compact ? null : describeUnlock(tuning, unlock)}</span>
      : <button type="button" key={unlock.id} class="amounts__unlock" aria-label={`Preview ${describeUnlock(tuning, unlock)}`} title={describeUnlock(tuning, unlock)} onClick={() => preview?.(unlock.id)}><UnlockBadge store={store} unlock={unlock} small={compact} />{compact ? null : describeUnlock(tuning, unlock)}</button>)}</span>}
  </div>
}

/** The party as a strip of faces, the leader lit: `pick` on a face (lead with her, or go set the party up), `edit` on the button after them. */
export const PartyStrip = ({ store, team, leader, pick, edit, size = 38 }: {
  readonly store: UiStore; readonly team: ReadonlyArray<CharacterId>; readonly leader: CharacterId; readonly pick: (character: CharacterId) => void; readonly edit: () => void; readonly size?: number
}) => {
  const tuning = store.tuning.value
  return <div class="party-strip">
    {team.map((member) => <button type="button" class="face-button" key={member} aria-label={tuning.characters[member].name} aria-pressed={member === leader} onClick={() => pick(member)}><Face of={{ character: member }} tint={elementOf(tuning, member)} selected={member === leader} size={member === leader ? size + 4 : size} /></button>)}
    <RoundButton icon="swap" tone="dark" label="Change party" onClick={edit} />
  </div>
}

/** What one character does, in a few lines: her element and class, then her special and her ultimate. */
export const KitLines = ({ store, character }: { readonly store: UiStore; readonly character: CharacterId }) => {
  const tuning = store.tuning.value, spec = tuning.characters[character]
  return <div class="kit-lines">
    {skillSlots.map((slot) => {
      const skill = tuning.skills[spec.skills[slot]]
      return <div key={slot} class="kit-lines__one">
        <span class="kit-lines__orb"><AbilityIcon kind={spec.skills[slot]} /></span>
        <span><b>{skill.name}</b><small>{slot === "special" ? "Special" : "Ultimate"}</small><span>{describeSkill(skill).split(" · ")[0]}.</span></span>
      </div>
    })}
  </div>
}

/** Where `source` is, in a few words: a new account, a quest's first or perfect clear at a rank, or a track's tier. */
export const describeSource = (store: UiStore, source: Source): string => {
  const tuning = store.tuning.value, ranks = ["I", "II", "III", "IV", "V"]
  switch (source.kind) {
    case "start":
      return "Yours from the start"
    case "firstClear":
      return `First clear of ${tuning.quests[source.quest].name}${source.rank > 1 ? ` at rank ${ranks[source.rank - 1]}` : ""}`
    case "perfect":
      return `All three stars in one run of ${tuning.quests[source.quest].name}${source.rank > 1 ? ` at rank ${ranks[source.rank - 1]}` : ""}`
    case "tier": {
      const track = tuning.tracks[source.track]
      if (track.kind === "audition" && track.character !== null) {
        const name = tuning.characters[track.character].name
        return source.tier === track.tiers.length ? `${name}'s mastery` : `${name}'s audition, part ${source.tier}`
      }
      return `First clear of ${track.name}, tier ${source.tier}`
    }
  }
}

/** Where a look comes from, for the foot of its panel (with the icon that goes there). */
export const lookSource = (store: UiStore, id: CosmeticId): { readonly text: string; readonly icon: IconName } => {
  const source = itemSource(sourcesOf(store.tuning.value), { kind: "cosmetic", id })
  return source === undefined ? { text: "Not given anywhere", icon: "lock" } : { text: describeSource(store, source), icon: "star" }
}
