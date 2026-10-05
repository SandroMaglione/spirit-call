/**
 * The challenges: a list beside a brief. The list shows a whole line at a
 * glance (chapters, what is cleared, what is locked); the brief always
 * shows the enemies and what they are weak to, since preparing is half the
 * game. Hardcore lists its tracks; a track's tiers are numbered in its brief.
 */
import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { clearPay, encounterOf, nextReset, playLock, samePlay, tierProgress, tierRewardsAvailable } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import type { TrackId } from "../../content/hardcore.ts"
import { challengeEnemies, describeLock, describeObjective, describePlay, describeTimeUntil } from "../describe.ts"
import { Icon } from "../Icon.tsx"
import { Pill } from "../kit/controls.tsx"
import { Fact, Label, Panel, Row } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { playsIn } from "../navigation.ts"
import type { UiStore } from "../store.ts"
import { Amounts, Enemies, EnemyFacts, ids, PartyStrip } from "./parts.tsx"
import type { Nav, QuestTab } from "./screens.ts"

const cleared = (store: UiStore, play: Play): boolean => {
  const account = store.account.value
  return play.kind === "quest" ? account.quests[play.quest]?.firstClearedAt != null : tierProgress(account, play.track, play.tier)?.firstClearedAt != null
}

/** What a row says at its right: cleared, why it is locked, or its enemies' level. */
const RowEnd = ({ store, play }: { readonly store: UiStore; readonly play: Play }) => {
  const tuning = store.tuning.value, lock = playLock(tuning, store.account.value, play)
  if (cleared(store, play)) return <span class="done"><Icon name="check" /></span>
  if (lock !== null) return <><Icon name="lock" />{lock.kind === "level" ? `Account Lv ${lock.level}` : ""}</>
  return <>Lv {encounterOf(tuning, play).enemyLevel}</>
}

const QuestList = ({ store, tab, play }: { readonly store: UiStore; readonly tab: "main" | "secondary"; readonly play: Signal<Play> }) => {
  const tuning = store.tuning.value, account = store.account.value
  const plays = playsIn(tuning, tab)
  const groups = tab === "main"
    ? ids(tuning.chapters).map((chapter) => ({ name: tuning.chapters[chapter].name, plays: plays.filter((each) => each.kind === "quest" && tuning.quests[each.quest].chapter === chapter) }))
    : [{ name: "Side quests", plays }]
  return <>{groups.filter((group) => group.plays.length > 0).map((group) => <>
    <Label key={group.name} end={`${group.plays.filter((each) => cleared(store, each)).length} / ${group.plays.length}`}>{group.name}</Label>
    {group.plays.map((each) => <Row key={describePlay(tuning, each)} lead={plays.indexOf(each) + 1} selected={samePlay(each, play.value)} locked={playLock(tuning, account, each) !== null} end={<RowEnd store={store} play={each} />} onClick={() => (play.value = each)}>{describePlay(tuning, each)}</Row>)}
  </>)}</>
}

const TrackList = ({ store, play, now }: { readonly store: UiStore; readonly play: Signal<Play>; readonly now: number }) => {
  const tuning = store.tuning.value, account = store.account.value
  /** A track opens on the tier to do next: the first open one not cleared yet, else its last open one. */
  const open = (track: TrackId): Play => {
    const tiers = tuning.tracks[track].tiers.map((_, index) => ({ kind: "tier" as const, track, tier: index + 1 }))
    const playable = tiers.filter((each) => playLock(tuning, account, each) === null)
    return playable.find((each) => !cleared(store, each)) ?? playable[playable.length - 1] ?? tiers[0]!
  }
  return <>
    <Label end={`Restocks in ${describeTimeUntil(nextReset(tuning.reset, now), now)}`}>Tracks</Label>
    {ids(tuning.tracks).map((track) => {
      const spec = tuning.tracks[track], first: Play = { kind: "tier", track, tier: 1 }, lock = playLock(tuning, account, first)
      const best = Math.max(0, ...spec.tiers.map((_, index) => tierProgress(account, track, index + 1)?.bestWave ?? 0))
      const done = spec.tiers.filter((_, index) => cleared(store, { kind: "tier", track, tier: index + 1 })).length
      return <Row key={track} tall selected={play.value.kind === "tier" && play.value.track === track} locked={lock !== null} onClick={() => (play.value = open(track))}
        end={lock !== null ? <><Icon name="lock" />{lock.kind === "level" ? `Account Lv ${lock.level}` : ""}</> : tuning.challenges[spec.challenge].objective.kind === "endure" && best > 0 ? `Best wave ${best}` : `${done} / ${spec.tiers.length}`}>{spec.name}</Row>
    })}
  </>
}

/** What `play` is: its enemies first (tap one to read about it), then what it asks and what it gives. */
const Brief = ({ store, nav, play, now }: { readonly store: UiStore; readonly nav: Nav; readonly play: Signal<Play>; readonly now: number }) => {
  const inspected = useSignal<EnemyKind | null>(null)
  const tuning = store.tuning.value, account = store.account.value, selected = play.value
  const lock = playLock(tuning, account, selected), encounter = encounterOf(tuning, selected), challenge = tuning.challenges[encounter.challenge]
  const done = cleared(store, selected)
  const everyClear = { currencies: { gold: clearPay(tuning.progression.gold, encounter.enemyLevel) }, experience: clearPay(tuning.progression.account.run, encounter.enemyLevel), unlocks: [] }
  const preview = (character: CharacterId) => nav.go({ kind: "character", character, tab: "kit" })
  const progress = selected.kind === "tier" ? tierProgress(account, selected.track, selected.tier) : undefined
  return <Panel class="quests__brief in-right" title={selected.kind === "quest" ? tuning.quests[selected.quest].name : tuning.tracks[selected.track].name} detail={`${describeObjective(challenge.objective, challenge.waves.scripted.length)} · Enemies Lv ${encounter.enemyLevel}`} note={lock === null ? undefined : describeLock(tuning, lock)} noteIcon="lock">
    {selected.kind === "tier" && <div class="quests__tiers"><Label>Tier</Label>{tuning.tracks[selected.track].tiers.map((_, index) => {
      const tier: Play = { kind: "tier", track: selected.track, tier: index + 1 }
      return <button type="button" key={index} class={`pip${cleared(store, tier) ? " is-done" : ""}${playLock(tuning, account, tier) !== null ? " is-locked" : ""}`} aria-label={`Tier ${index + 1}`} aria-pressed={index + 1 === selected.tier} onClick={() => (play.value = tier)}>{cleared(store, tier) && index + 1 !== selected.tier ? <Icon name="check" /> : index + 1}</button>
    })}</div>}
    <div class="quests__enemies"><Label>Enemies · weak to</Label><Enemies store={store} kinds={challengeEnemies(challenge)} inspected={inspected.value} inspect={(kind) => (inspected.value = kind)} /></div>
    {inspected.value !== null ? <EnemyFacts store={store} kind={inspected.value} /> : <>
      <p class="dim">{challenge.description} <span class="quests__arena">{tuning.arenas[challenge.arena].name}.</span></p>
      {challenge.objective.kind === "endure" && <div><Fact label="Each wave" value={`Enemies +${challenge.objective.levelPerWave} Lv`} />{progress?.bestWave !== undefined && <Fact label="Best wave" value={progress.bestWave} />}</div>}
      <div class="quests__rewards">
        <div><Label>{selected.kind === "quest" ? "First clear" : "Milestone · once per period"}</Label>{selected.kind === "quest"
          ? done ? <span class="dim">Claimed</span> : <Amounts store={store} rewards={tuning.quests[selected.quest].rewards} preview={preview} />
          : tierRewardsAvailable(tuning, account, selected.track, selected.tier, now) ? <Amounts store={store} rewards={{ ...tuning.tracks[selected.track].tiers[selected.tier - 1]!.rewards, unlocks: [] }} /> : <span class="dim">Restocks in {describeTimeUntil(nextReset(tuning.reset, now), now)}</span>}</div>
        <div><Label>Every clear</Label><Amounts store={store} rewards={everyClear} /></div>
      </div>
    </>}
  </Panel>
}

export const Quests = ({ store, nav, tab, play, leader, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly tab: QuestTab; readonly play: Signal<Play>; readonly leader: CharacterId; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, now = Date.now(), selected = play.value
  const key = selected.kind === "quest" ? selected.quest : `${selected.track}-${selected.tier}`
  return <Screen name="quests">
    <TopBar icon="quests" title="Challenges" close={nav.back}>
      <TopTabs label="Kinds of challenge" current={tab} onChange={(id) => nav.replace({ kind: "quests", tab: id })} tabs={[{ id: "main", label: "Main" }, { id: "secondary", label: "Side" }, { id: "hardcore", label: "Hardcore" }]} />
    </TopBar>
    <div class="quests__list scroll in-left" key={tab}>{tab === "hardcore" ? <TrackList store={store} play={play} now={now} /> : <QuestList store={store} tab={tab} play={play} />}</div>
    <Brief key={key} store={store} nav={nav} play={play} now={now} />
    <Actions>
      <PartyStrip store={store} team={store.menuDraft.value.team} leader={leader} size={34} pick={() => nav.go({ kind: "team" })} edit={() => nav.go({ kind: "team" })} />
      <Pill icon="play" disabled={playLock(tuning, store.account.value, selected) !== null || store.busy.value} onClick={enter}>Enter</Pill>
    </Actions>
  </Screen>
}
