/**
 * How a run ended, over the arena: a quest's stars (the ones earned now pop
 * in), what it earned as cards (a new character glows, and stands beside
 * them; materials and what chests gave too), the account's progress, and
 * the next thing to do as the main button, with home, party, and retry
 * beside it.
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { accountLevel, playLock, rankOf } from "../account/account.ts"
import type { Amounts, CurrencyId, ResourceId } from "../content/currencies.ts"
import { AbilityIcon } from "./AbilityIcon.tsx"
import { describePlay, describeUnlock } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Icon } from "./Icon.tsx"
import { Model } from "./kit/art.tsx"
import { Card } from "./kit/Card.tsx"
import { Pill, RoundButton } from "./kit/controls.tsx"
import { Bar } from "./kit/panel.tsx"
import { aspectOf } from "../content/aspects.ts"
import { CharacterCard, ids, MaterialIcon, materialsIn, Stars } from "./menu/parts.tsx"
import type { Screen } from "./menu/screens.ts"
import { nextMainQuest } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

export const Results = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const ready = useSignal(false), revealed = useSignal(false)
  const result = store.result.value, earned = store.earned.value
  useEffect(() => { const timer = setTimeout(() => (ready.value = true), store.tuning.peek().flow.restartDelay * 1000); return () => clearTimeout(timer) }, [])
  if (result === null) return null
  const tuning = store.tuning.value, account = store.account.value, play = store.play.value, extra = store.extra.value
  const objective = tuning.challenges[result.challenge].objective
  const newcomer = earned?.rewards?.unlocks.find((unlock) => unlock.kind === "character")
  const name = play === null ? tuning.challenges[result.challenge].name : describePlay(tuning, play)
  const enabled = ready.value && store.recording.value !== "saving"
  const open = (screen: Screen) => { store.menuOpens.value = screen; actions.menu() }
  const level = accountLevel(tuning, account), next = nextMainQuest(tuning, account)
  const canContinue = extra === null && result.cleared && next !== null && playLock(tuning, account, next) === null
  const leveled = earned !== null && earned.level.after > earned.level.before
  const title = extra !== null ? "Practice" : objective.kind === "endure" ? `Wave ${result.wave}` : result.cleared ? "Victory" : "Defeated"
  const time = `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, "0")}`
  // What the chests these stars opened gave, beside what the run gave.
  const chestRewards = (earned?.chests ?? []).map((chest) => tuning.chests[chest.group][chest.index]!.rewards)
  const fromChests = (id: ResourceId) => chestRewards.reduce((sum, rewards) => sum + (rewards[id] ?? 0), 0)
  const materials: Amounts = Object.fromEntries(ids(tuning.materials).map((id) => [id, (earned?.materials[id] ?? 0) + fromChests(id)]))
  const starred = play?.kind === "quest" && rankOf(play) === 1 && extra === null ? play : null
  return <div class={`results${result.cleared ? " is-cleared" : ""}${newcomer === undefined ? "" : " has-newcomer"}`} onClick={() => (revealed.value = true)}>
    {newcomer?.kind === "character" && <div class="results__newcomer" data-element={elementOf(tuning, newcomer.id)}><Model character={newcomer.id} reveal={!revealed.value} /></div>}
    <section class="results__content">
      <h1>{title}</h1>
      <p class="results__name">{name}{starred !== null && earned !== null && <>
        <Stars earned={account.quests[starred.quest]?.stars ?? []} fresh={earned.stars} />
        {earned.chests.length > 0 && <span class="results__chest"><Icon name="chest" />{earned.chests.length === 1 ? "Chest opened" : `${earned.chests.length} chests opened`}</span>}
      </>}</p>
      <p class="dim">Wave {result.wave} · {result.kills} defeated · {time}</p>
      <div class="results__rule" />
      {extra !== null ? <p class="dim">Practice records nothing.</p> : <>
        {store.recording.value === "saving" && <p role="status" class="dim">Saving…</p>}
        {store.recording.value === "failed" && <p role="alert" class="results__error">Rewards could not be saved.</p>}
        {earned !== null && <>
          <div class="results__loot">
            {earned.experience > 0 && <Card tint="thunder" art={<Icon name="xp" />} foot={`+${earned.experience}`} label={`${earned.experience} account XP`} />}
            {(Object.keys(tuning.currencies) as Array<CurrencyId>).map((id) => {
              const total = (earned.pay[id] ?? 0) + (earned.levelRewards[id] ?? 0) + (earned.rewards?.currencies[id] ?? 0) + earned.discoveries.reduce((sum, discovery) => sum + (tuning.discoveries[discovery].rewards[id] ?? 0), 0) + fromChests(id)
              return total <= 0 ? null : <Card key={id} tint={id === "crystals" ? "water" : undefined} art={<Icon name={id} />} foot={`+${total.toLocaleString("en-US")}`} label={`${total} ${tuning.currencies[id].name}`} />
            })}
            {materialsIn(store, materials).map((id) => <Card key={id} tint={tuning.materials[id].element} art={<MaterialIcon store={store} material={id} />} foot={`+${materials[id]}`} label={`${materials[id]} ${tuning.materials[id].name}`} />)}
            {earned.rewards?.unlocks.map((unlock) => unlock.kind === "character"
              ? <CharacterCard key={unlock.id} store={store} character={unlock.id} foot="NEW" fresh onClick={enabled ? () => open({ kind: "character", character: unlock.id, tab: "kit" }) : undefined} />
              : <Card key={unlock.id} fresh tint={tuning.characters[store.team.value[0]?.character ?? "swordsman"].element} art={<AbilityIcon kind={aspectOf(tuning.aspects, unlock.id).class} />} foot="NEW" label={describeUnlock(tuning, unlock)} onClick={enabled ? () => open({ kind: "team" }) : undefined} />)}
          </div>
          {earned.rewards !== null && earned.rewards.unlocks.length > 0 && <p class="results__new">New: {earned.rewards.unlocks.map((unlock) => describeUnlock(tuning, unlock)).join(", ")}</p>}
          {earned.discoveries.length > 0 && <p class="results__new">Discovered: {earned.discoveries.map((id) => tuning.discoveries[id].name).join(", ")}</p>}
          <div class="results__account">
            <div><span>{leveled ? <>Account Lv {earned.level.before} → <b>{earned.level.after}</b></> : `Account Lv ${level.level}`}</span><span>{earned.experience > 0 && <span class="results__gain">+{earned.experience}</span>}<span class="dim">{level.needed === 0 ? "MAX" : `${Math.floor(level.into)} / ${level.needed}`}</span></span></div>
            {/* What the run added grows in from where the bar stood (from empty after a level-up: the new level's bar is all new). */}
            <Bar value={level.needed === 0 ? 1 : level.into / level.needed} from={level.needed === 0 ? undefined : leveled ? 0 : (level.into - earned.experience) / level.needed} label="Account experience" />
          </div>
        </>}
      </>}
      {canContinue && next?.kind === "quest" && <p class="results__next"><b>Next · {tuning.quests[next.quest].name}</b> {tuning.quests[next.quest].introduces.text}</p>}
      <footer class="results__actions">
        <RoundButton icon="home" tone="dark" label="Home" disabled={!enabled} onClick={() => open({ kind: "home" })} />
        <RoundButton icon={extra?.kind === "practice" ? "practice" : "team"} tone="dark" label={extra?.kind === "practice" ? "Change enemies" : "Adjust party"} disabled={!enabled} onClick={() => open(extra?.kind === "practice" ? { kind: "extra", mode: "practice" } : { kind: "team" })} />
        {canContinue && <RoundButton icon="retry" tone="dark" label="Retry" disabled={!enabled} onClick={actions.retry} />}
        <Pill icon={canContinue ? "next" : "retry"} disabled={!enabled} onClick={() => {
          if (canContinue && next !== null) { store.menuPlay.value = next; open({ kind: "quests", tab: "main" }) }
          else actions.retry()
        }}>{canContinue ? "Next quest" : extra !== null ? "Again" : "Retry"}</Pill>
      </footer>
    </section>
  </div>
}
