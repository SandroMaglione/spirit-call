/**
 * How a run ended, over the arena: a quest's stars (the ones earned now pop
 * in), what it earned as cards on a line that scrolls when long (a new
 * character glows, and stands beside them; a card a resource, however many
 * places it came from, a chest in the corner when part of it came from
 * one), the account's progress, and
 * the next thing to do as the main button, with home, party, and retry
 * beside it.
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { accountLevel, earnedResources, playLock, questProgress, rankOf } from "../account/account.ts"
import { AbilityIcon } from "./AbilityIcon.tsx"
import { describePlay, describeUnlock, resourceName } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Icon } from "./Icon.tsx"
import { Model } from "./kit/art.tsx"
import { Card, CardRow } from "./kit/Card.tsx"
import { Pill, RoundButton } from "./kit/controls.tsx"
import { Bar } from "./kit/panel.tsx"
import { aspectOf } from "../content/aspects.ts"
import { CharacterCard, MaterialIcon, Stars } from "./menu/parts.tsx"
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
  const title = extra?.kind === "trial" ? `${tuning.characters[extra.character].name} · Trial` : extra !== null ? "Practice" : objective.kind === "endure" ? `Wave ${result.wave}` : result.cleared ? "Victory" : "Defeated"
  const time = `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, "0")}`
  const starred = play?.kind === "quest" && extra === null ? play : null
  return <div class={`results${result.cleared ? " is-cleared" : ""}${newcomer === undefined ? "" : " has-newcomer"}`} onClick={() => (revealed.value = true)}>
    {newcomer?.kind === "character" && <div class="results__newcomer" data-element={elementOf(tuning, newcomer.id)}><Model character={newcomer.id} reveal={!revealed.value} /></div>}
    <section class="results__content">
      <h1>{title}</h1>
      {starred !== null && earned !== null && <div class="results__stars"><Stars earned={questProgress(account, starred.quest, rankOf(starred))?.stars ?? []} fresh={earned.stars} /></div>}
      <p class="dim"><span class="results__name">{name}</span> · Wave {result.wave} · {result.kills} defeated · {time}</p>
      <div class="results__rule" />
      {extra !== null ? <p class="dim">{extra.kind === "trial" ? "A trial records nothing." : "Practice records nothing."}</p> : <>
        {store.recording.value === "saving" && <p role="status" class="dim">Saving…</p>}
        {store.recording.value === "failed" && <p role="alert" class="results__error">Rewards could not be saved.</p>}
        {earned !== null && <>
          <CardRow class="results__loot" label="Rewards">
            {earned.experience > 0 && <Card tint="thunder" art={<Icon name="xp" />} foot={`+${earned.experience}`} label={`${earned.experience} account XP`} />}
            {earnedResources(tuning, earned).map(({ id, total, fromChests }) => {
              const currency = id === "crystals" || id === "gold"
              // Part of it from a chest: the chest in the corner, and it glows as a chest's gift does.
              return <Card key={id} fresh={fromChests > 0} corner={fromChests > 0 ? "chest" : undefined}
                tint={id === "crystals" ? "water" : currency ? undefined : tuning.materials[id].element}
                art={currency ? <Icon name={id} /> : <MaterialIcon store={store} material={id} />}
                foot={`+${total.toLocaleString("en-US")}`} label={`${total} ${resourceName(tuning, id)}${fromChests > 0 ? `, ${fromChests} from a chest` : ""}`} />
            })}
            {earned.rewards?.unlocks.map((unlock) => unlock.kind === "character"
              ? <CharacterCard key={unlock.id} store={store} character={unlock.id} foot="NEW" fresh onClick={enabled ? () => open({ kind: "character", character: unlock.id, tab: "kit" }) : undefined} />
              : <Card key={unlock.id} fresh tint={tuning.characters[store.team.value[0]?.character ?? "swordsman"].element} art={<AbilityIcon kind={aspectOf(tuning.aspects, unlock.id).class} />} foot="NEW" label={describeUnlock(tuning, unlock)} onClick={enabled ? () => open({ kind: "team" }) : undefined} />)}
          </CardRow>
          {earned.rewards !== null && earned.rewards.unlocks.length > 0 && <p class="results__new">New: {earned.rewards.unlocks.map((unlock) => describeUnlock(tuning, unlock)).join(", ")}</p>}
          {earned.discoveries.length > 0 && <p class="results__new">Discovered: {earned.discoveries.map((id) => tuning.discoveries[id].name).join(", ")}</p>}
          <div class="results__account">
            <div><span>{leveled ? <>Account Lv {earned.level.before} → <b>{earned.level.after}</b></> : `Account Lv ${level.level}`}</span><span>{earned.experience > 0 && <span class="results__gain">+{earned.experience}</span>}<span class="dim">{level.needed === 0 ? "MAX" : `${Math.floor(level.into)} / ${level.needed}`}</span></span></div>
            {/* What the run added grows in from where the bar stood (from empty after a level-up: the new level's bar is all new). */}
            <Bar value={level.needed === 0 ? 1 : level.into / level.needed} from={level.needed === 0 ? undefined : leveled ? 0 : (level.into - earned.experience) / level.needed} label="Account experience" />
          </div>
        </>}
      </>}
      {canContinue && next?.kind === "quest" && <p class="results__next"><b>Next · {tuning.quests[next.quest].name}</b> {tuning.quests[next.quest].introduces?.text}</p>}
      <footer class="results__actions">
        <RoundButton icon="home" tone="dark" label="Home" disabled={!enabled} onClick={() => open({ kind: "home" })} />
        {extra?.kind === "trial"
          ? <RoundButton icon="call" tone="dark" label="Back to the Spirit Call" disabled={!enabled} onClick={() => open({ kind: "call", tab: "banner" })} />
          : <RoundButton icon={extra?.kind === "practice" ? "practice" : "team"} tone="dark" label={extra?.kind === "practice" ? "Change enemies" : "Adjust party"} disabled={!enabled} onClick={() => open(extra?.kind === "practice" ? { kind: "extra", mode: "practice" } : { kind: "team" })} />}
        {canContinue && <RoundButton icon="retry" tone="dark" label="Retry" disabled={!enabled} onClick={actions.retry} />}
        <Pill icon={canContinue ? "next" : "retry"} disabled={!enabled} onClick={() => {
          if (canContinue && next !== null) { store.menuPlay.value = next; open({ kind: "quests", tab: "main" }) }
          else actions.retry()
        }}>{canContinue ? "Next quest" : extra !== null ? "Again" : "Retry"}</Pill>
      </footer>
    </section>
  </div>
}
