/**
 * How a run ended, over the arena, coming in a piece at a time (a tap shows
 * it all): the title (a victory bright, a defeat falling), a quest's goals
 * one by one (the ones earned now land with a ping), what it earned as
 * cards on a line that scrolls when long (a new character glows, and
 * stands beside them; a card a resource, however many places it came from,
 * a chest in the corner when part of it came from one), how much of the
 * collection is owned, and what comes next in the same list (main quests, side
 * quests, a track): played at once as the main button, or opened in the
 * menu beside it, with home, party, and retry.
 *
 * What it earned is worked out by the account's rules as the run ends (see
 * `app/app.ts`), and saved on this device.
 */
import { useSignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import type { CSSProperties } from "preact"
import { earnedResources, owns, sourcesOf } from "../account/account.ts"
import { AbilityIcon } from "./AbilityIcon.tsx"
import { describePlay, describeUnlock, resourceName } from "./describe.ts"
import { elementOf } from "./draft.ts"
import { Icon } from "./Icon.tsx"
import { Model } from "./kit/art.tsx"
import { Card, CardRow } from "./kit/Card.tsx"
import { Pill, RoundButton } from "./kit/controls.tsx"
import { Bar } from "./kit/panel.tsx"
import { aspectOf } from "../content/aspects.ts"
import { cosmeticOf } from "../content/cosmetics.ts"
import type { MaterialId } from "../content/materials.ts"
import { relicOf } from "../content/relics.ts"
import { describeCount, describeGoal, meets } from "../content/stars.ts"
import { LookIcon, RelicIcon, TierMarks } from "./RelicIcon.tsx"
import { CharacterCard, MaterialIcon } from "./menu/parts.tsx"
import type { Screen } from "./menu/screens.ts"
import { nextAfter, tabOf } from "./navigation.ts"
import type { UiActions, UiStore } from "./store.ts"

/** When each piece comes in, in seconds from the screen showing: the title, the goals (one after another when some are new), the line about the run, the rewards, the account's bar, and the buttons (usable from then). */
const timeline = (fresh: number) => {
  const stars = 0.5, step = fresh > 0 ? 0.34 : 0.08
  const line = stars + (fresh > 0 ? 3 * step : 0.2)
  return { star: (index: number) => stars + index * step, line, loot: line + 0.15, account: line + 0.4, done: line + 0.75 }
}

/** A piece of the results, coming in at `at` seconds. */
const at = (seconds: number): CSSProperties => ({ "--d": `${seconds}s` })

export const Results = ({ store, actions }: { readonly store: UiStore; readonly actions: UiActions }) => {
  const armed = useSignal(false), shown = useSignal(false), skipped = useSignal(false), revealed = useSignal(false)
  const result = store.result.value, earned = store.earned.value
  const fresh = earned?.stars ?? []
  const times = timeline(fresh.length)
  // A tap carried over from the fight never presses a button: they wait a moment, however soon the rest is shown.
  useEffect(() => { const timer = setTimeout(() => (armed.value = true), store.tuning.peek().flow.restartDelay * 1000); return () => clearTimeout(timer) }, [])
  // Each piece sounds as it comes in; showing it all at once silences what is left.
  useEffect(() => {
    if (result === null || skipped.value) return
    const cues: Array<[number, Parameters<UiActions["cue"]>[0]]> = [[0.1, result.cleared ? "victory" : "defeat"], ...fresh.map((star) => [times.star(star) + 0.1, "star"] as [number, "star"]), [times.loot, "reward"]]
    const timers = [...cues.map(([seconds, cue]) => setTimeout(() => actions.cue(cue), seconds * 1000)), setTimeout(() => (shown.value = true), times.done * 1000)]
    return () => timers.forEach(clearTimeout)
  }, [skipped.value])
  if (result === null) return null
  const tuning = store.tuning.value, account = store.account.value, play = store.play.value, extra = store.extra.value
  const objective = tuning.challenges[result.challenge].objective
  const newcomer = earned?.granted.find((unlock) => unlock.kind === "character")
  const name = play === null ? tuning.challenges[result.challenge].name : describePlay(tuning, play)
  const enabled = armed.value && (shown.value || skipped.value)
  const open = (screen: Screen) => { store.menuOpens.value = screen; actions.menu() }
  const next = play === null ? null : nextAfter(tuning, account, play)
  // The collection: everything there is to own, and how much of it is (see docs/collection.md).
  const collection = sourcesOf(tuning), owned = collection.filter((each) => owns(account, each.item)).length
  const gained = earned?.granted.length ?? 0
  const canContinue = extra === null && result.cleared && next !== null
  const title = extra?.kind === "trial" ? `${tuning.characters[extra.character].name} · Trial` : extra !== null ? "Practice" : objective.kind === "endure" ? `Wave ${result.wave}` : result.cleared ? "Victory" : "Defeated"
  const time = `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, "0")}`
  const starred = play?.kind === "quest" && extra === null ? play : null
  return <div class={`results${result.cleared ? " is-cleared" : ""}${newcomer === undefined ? "" : " has-newcomer"}${skipped.value ? " is-skipped" : ""}`} onClick={() => { revealed.value = true; skipped.value = true }}>
    {newcomer?.kind === "character" && <div class="results__newcomer" data-element={elementOf(tuning, newcomer.id)}><Model character={newcomer.id} reveal={!revealed.value} /></div>}
    <section class="results__content" style={{ "--loot": `${times.loot}s` }}>
      <h1 class="results__title">{title}</h1>
      {/* Each star is a goal on top of the clear: which this run met (the ones new to the account land one by one), and what it counted; one line, so the rest keeps its room. */}
      {starred !== null && earned !== null && result.cleared && <div class="results__goals">
        {tuning.quests[starred.quest].stars.map((goal, index) => <div key={index} class={`goal${meets(goal, result.cleared, result.tally) ? " is-earned" : ""}${earned.stars.includes(index) ? " is-fresh" : ""}`} style={at(times.star(index))}><Icon name="star" />{describeGoal(goal)}<span class="results__count">{describeCount(goal, result.tally)}</span></div>)}
        {earned.perfect !== null && <div class="goal goal--perfect is-earned is-fresh" style={at(times.line)}><Icon name="relic" />Perfect</div>}
      </div>}
      <p class="dim results__step" style={at(times.line)}><span class="results__name">{name}</span> · Wave {result.wave} · {result.kills} defeated · {time}</p>
      <div class="results__rule results__step" style={at(times.line)} />
      {extra !== null ? <p class="dim results__step" style={at(times.line)}>{extra.kind === "trial" ? "A trial records nothing." : "Practice records nothing."}</p> : <>
        {earned !== null && <>
          <CardRow class="results__loot" label="Rewards">
            {earnedResources(tuning, earned).map(({ id, total, fromChests }) => {
              const currency = id === "gold"
              // Part of it from a chest: the chest in the corner, and it glows as a chest's gift does.
              return <Card key={id} fresh={fromChests > 0} corner={fromChests > 0 ? "chest" : undefined}
                tint={currency ? undefined : tuning.materials[id as MaterialId].element ?? undefined}
                art={currency ? <Icon name="gold" /> : <MaterialIcon store={store} material={id as MaterialId} />}
                foot={`+${total.toLocaleString("en-US")}`} label={`${total} ${resourceName(tuning, id)}${fromChests > 0 ? `, ${fromChests} from a chest` : ""}`} />
            })}
            {earned.granted.map((unlock) => unlock.kind === "character"
              ? <CharacterCard key={unlock.id} store={store} character={unlock.id} foot="NEW" fresh onClick={enabled ? () => open({ kind: "character", character: unlock.id, tab: "kit" }) : undefined} />
              : unlock.kind === "aspect"
                ? <Card key={unlock.id} fresh tint={tuning.characters[store.team.value[0]?.character ?? "swordsman"].element} art={<AbilityIcon kind={aspectOf(tuning.aspects, unlock.id).class} />} foot="NEW" label={describeUnlock(tuning, unlock)} onClick={enabled ? () => open({ kind: "team" }) : undefined} />
                : unlock.kind === "relic" || unlock.kind === "relicTier"
                  ? <Card key={`${unlock.kind}-${unlock.id}`} fresh tint={relicOf(tuning.relics, unlock.id).element ?? undefined} art={<span class="relic-art"><RelicIcon slot={relicOf(tuning.relics, unlock.id).slot} element={relicOf(tuning.relics, unlock.id).element} /><TierMarks tier={unlock.kind === "relic" ? 1 : unlock.tier} /></span>} foot={unlock.kind === "relic" ? "RELIC" : "TIER"} label={describeUnlock(tuning, unlock)} onClick={enabled ? () => open({ kind: "team" }) : undefined} />
                  : <Card key={unlock.id} fresh art={<LookIcon kind={cosmeticOf(tuning.cosmetics, unlock.id).kind} />} foot="LOOK" label={describeUnlock(tuning, unlock)} onClick={enabled ? () => open({ kind: "collection", tab: "looks" }) : undefined} />)}
          </CardRow>
          {earned.discoveries.length > 0 && <p class="results__new results__step" style={at(times.account)}>Discovered: {earned.discoveries.map((id) => tuning.discoveries[id].name).join(", ")}</p>}
          <div class="results__account results__step" style={at(times.account)}>
            <div><span>Collection</span><span>{gained > 0 && <span class="results__gain">+{gained}</span>}<span class="dim">{owned} / {collection.length}</span></span></div>
            {/* What the run added grows in from where the bar stood. */}
            <Bar value={owned / collection.length} from={(owned - gained) / collection.length} label="Collection" />
          </div>
        </>}
      </>}
      <footer class="results__actions results__step" style={at(times.done)}>
        <RoundButton icon="home" tone="dark" label="Home" disabled={!enabled} onClick={() => open({ kind: "home" })} />
        {extra?.kind === "trial"
          ? <RoundButton icon="collection" tone="dark" label="Back to the collection" disabled={!enabled} onClick={() => open({ kind: "collection", tab: "characters" })} />
          : <RoundButton icon={extra?.kind === "practice" ? "practice" : "team"} tone="dark" label={extra?.kind === "practice" ? "Change enemies" : "Adjust party"} disabled={!enabled} onClick={() => open(extra?.kind === "practice" ? { kind: "extra", mode: "practice" } : { kind: "team" })} />}
        {canContinue && <RoundButton icon="retry" tone="dark" label="Retry" disabled={!enabled} onClick={actions.retry} />}
        {canContinue && next !== null && <Pill icon="quests" tone="dark" disabled={!enabled} onClick={() => { store.menuPlay.value = next; open({ kind: "quests", tab: tabOf(tuning, next) }) }}>Next in menu</Pill>}
        <Pill icon={canContinue ? "next" : "retry"} disabled={!enabled} onClick={() => {
          // Straight into the next one, with the party just played.
          if (canContinue && next !== null) { store.menuPlay.value = next; actions.enter(account.selection.team, account.selection.aspects, next) }
          else actions.retry()
        }}>{canContinue ? "Play next" : extra !== null ? "Again" : "Retry"}</Pill>
      </footer>
    </section>
  </div>
}
