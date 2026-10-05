/**
 * The challenges: a list beside a brief. The list shows a whole line at a
 * glance (chapters, each quest's stars, what is locked, and the chests a
 * chapter's stars open); the brief says first what is new in a quest, then
 * always shows the enemies and what they are weak to, since preparing is
 * half the game, then its stars and what a clear gives. A quest's ranks and
 * a hardcore track's tiers are numbered in its brief.
 */
import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import { clearPay, encounterOf, groupStars, materialPay, nextReset, playLock, questsOf, rankOf, samePlay, tierProgress, tierRewardsAvailable } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import type { StarGroup } from "../../content/quests.ts"
import { describeGoal } from "../../content/stars.ts"
import type { CharacterId } from "../../content/characters.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import type { TrackId } from "../../content/hardcore.ts"
import { challengeEnemies, describeLock, describeObjective, describePlay, describeTimeUntil } from "../describe.ts"
import { Icon } from "../Icon.tsx"
import { Pill } from "../kit/controls.tsx"
import { Label, Panel, Row } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { playsIn } from "../navigation.ts"
import type { UiStore } from "../store.ts"
import { Amounts, EnemyFaces, EnemyFacts, ids, PartyStrip, Stars } from "./parts.tsx"
import type { Nav, QuestTab } from "./screens.ts"

const cleared = (store: UiStore, play: Play): boolean => {
  const account = store.account.value
  return play.kind === "quest" ? account.quests[play.quest]?.firstClearedAt != null : tierProgress(account, play.track, play.tier)?.firstClearedAt != null
}

/** What a row says at its right: a quest's stars once cleared (a tier's tick), why it is locked, or its enemies' level. */
const RowEnd = ({ store, play }: { readonly store: UiStore; readonly play: Play }) => {
  const tuning = store.tuning.value, lock = playLock(tuning, store.account.value, play)
  if (play.kind === "quest" && cleared(store, play)) return <Stars earned={store.account.value.quests[play.quest]?.stars ?? []} />
  if (cleared(store, play)) return <span class="done"><Icon name="check" /></span>
  if (lock !== null) return <Icon name="lock" />
  return <>Lv {encounterOf(tuning, play).enemyLevel}</>
}

/** A group's chests along its stars: each at the stars it needs, opened ones ticked. */
const ChestTrack = ({ store, group }: { readonly store: UiStore; readonly group: StarGroup }) => {
  const tuning = store.tuning.value, account = store.account.value, chests = tuning.chests[group], open = account.chests[group] ?? 0
  const { earned, total } = groupStars(tuning, account, group)
  return <div class="chests" aria-label={`${earned} of ${total} stars; ${open} of ${chests.length} chests open`}>
    <span class="chests__bar"><span style={{ width: `${(Math.min(earned, total) / total) * 100}%` }} /></span>
    {chests.map((chest, index) => <span key={index} class={`chests__one${index < open ? " is-open" : ""}`} style={{ left: `${(chest.stars / total) * 100}%` }}><Icon name={index < open ? "check" : "chest"} /><small>{chest.stars}</small></span>)}
  </div>
}

const QuestList = ({ store, tab, play }: { readonly store: UiStore; readonly tab: "main" | "secondary"; readonly play: Signal<Play> }) => {
  const tuning = store.tuning.value, account = store.account.value
  const plays = playsIn(tuning, tab)
  const groups: ReadonlyArray<{ readonly group: StarGroup; readonly name: string; readonly plays: ReadonlyArray<Play> }> = tab === "main"
    ? ids(tuning.chapters).map((chapter) => ({ group: chapter, name: tuning.chapters[chapter].name, plays: plays.filter((each) => each.kind === "quest" && tuning.quests[each.quest].chapter === chapter) }))
    : [{ group: "secondary", name: "Side quests", plays }]
  return <>{groups.filter((group) => group.plays.length > 0).map((group) => {
    const stars = groupStars(tuning, account, group.group)
    return <>
      <Label key={group.name} end={<><Icon name="star" />{stars.earned} / {stars.total}</>}>{group.name}</Label>
      {questsOf(tuning, group.group).length > 0 && <ChestTrack key={`${group.name}-chests`} store={store} group={group.group} />}
      {group.plays.map((each) => <Row key={describePlay(tuning, each)} lead={plays.indexOf(each) + 1} selected={each.kind === "quest" && play.value.kind === "quest" ? each.quest === play.value.quest : samePlay(each, play.value)} locked={playLock(tuning, account, each) !== null} end={<RowEnd store={store} play={each} />} onClick={() => (play.value = each)}>{describePlay(tuning, each)}</Row>)}
    </>
  })}</>
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
        end={lock !== null ? <Icon name="lock" /> : tuning.challenges[spec.challenge].objective.kind === "endure" && best > 0 ? `Best wave ${best}` : `${done} / ${spec.tiers.length}`}>{spec.name}</Row>
    })}
  </>
}

/**
 * What `play` is, most wanted first: its ranks or tiers (each with its
 * enemies' level), its stars beside what it gives, then its enemies over
 * what they are weak to (tap one to read about it). What is new in a quest
 * is the head's second line.
 */
const Brief = ({ store, nav, play, now }: { readonly store: UiStore; readonly nav: Nav; readonly play: Signal<Play>; readonly now: number }) => {
  const inspected = useSignal<EnemyKind | null>(null)
  const tuning = store.tuning.value, account = store.account.value, selected = play.value
  const lock = playLock(tuning, account, selected), encounter = encounterOf(tuning, selected), challenge = tuning.challenges[encounter.challenge]
  const done = cleared(store, selected)
  const element = selected.kind === "quest" ? tuning.quests[selected.quest].element : tuning.tracks[selected.track].element
  const everyClear = { currencies: { gold: clearPay(tuning.progression.gold, encounter.enemyLevel), ...materialPay(tuning, element, encounter.challenge, encounter.enemyLevel, false) }, experience: 0, unlocks: [] }
  const preview = (character: CharacterId) => nav.go({ kind: "character", character, tab: "kit" })
  const progress = selected.kind === "tier" ? tierProgress(account, selected.track, selected.tier) : undefined
  /** The steps of the same challenge: a quest's ranks, a track's tiers. */
  const steps: ReadonlyArray<{ readonly play: Play; readonly name: string }> = selected.kind === "quest"
    ? [{ play: { kind: "quest", quest: selected.quest }, name: "I" }, ...tuning.quests[selected.quest].ranks.map((_, index): { readonly play: Play; readonly name: string } => ({ play: { kind: "quest", quest: selected.quest, rank: index + 2 }, name: ["II", "III", "IV"][index] ?? String(index + 2) }))]
    : tuning.tracks[selected.track].tiers.map((_, index) => ({ play: { kind: "tier", track: selected.track, tier: index + 1 }, name: String(index + 1) }))
  const quest = selected.kind === "quest" ? tuning.quests[selected.quest] : null
  const rank = selected.kind === "quest" ? rankOf(selected) : 1
  const earnedStars = selected.kind === "quest" ? account.quests[selected.quest]?.stars ?? [] : []
  const once = quest !== null
    ? rank > 1 ? null : done ? "claimed" : { ...quest.rewards, experience: 0, currencies: { ...quest.rewards.currencies, ...materialPay(tuning, element, encounter.challenge, encounter.enemyLevel, true) } }
    : selected.kind === "tier" && tierRewardsAvailable(tuning, account, selected.track, selected.tier, now) ? { ...tuning.tracks[selected.track].tiers[selected.tier - 1]!.rewards, experience: 0, unlocks: [] } : "restocking"
  return <Panel class="quests__brief in-right"
    title={selected.kind === "quest" ? tuning.quests[selected.quest].name : tuning.tracks[selected.track].name}
    subtitle={quest !== null ? <>New · {quest.introduces.text}</> : undefined}
    detail={describeObjective(challenge.objective, challenge.waves.scripted.length)}
    note={lock === null ? undefined : describeLock(tuning, lock)} noteIcon="lock">
    {steps.length > 1 && <div class="steps" role="radiogroup" aria-label={selected.kind === "quest" ? "Rank" : "Tier"}>
      <Label>{selected.kind === "quest" ? "Rank" : "Tier"}</Label>
      {steps.map((step) => {
        const locked = playLock(tuning, account, step.play) !== null, on = samePlay(step.play, selected)
        return <button type="button" role="radio" key={step.name} class={`step${locked ? " is-locked" : ""}`} aria-checked={on} aria-label={`${selected.kind === "quest" ? "Rank" : "Tier"} ${step.name}, enemies level ${encounterOf(tuning, step.play).enemyLevel}`} onClick={() => (play.value = step.play)}>
          <b>{step.name}</b><span>{locked ? <Icon name="lock" /> : null}Lv {encounterOf(tuning, step.play).enemyLevel}</span>
        </button>
      })}
    </div>}
    {steps.length <= 1 && <div class="steps"><Label>Enemies</Label><span class="step is-only" aria-checked="true"><span>Lv {encounter.enemyLevel}</span></span></div>}
    <div class="quests__goals">
      {quest !== null && <div>
        <Label>Stars</Label>
        {rank === 1
          ? quest.stars.map((goal, index) => <div key={index} class={`goal${earnedStars.includes(index) ? " is-earned" : ""}`}><Icon name="star" />{describeGoal(goal)}</div>)
          : <span class="dim">Earned at rank I.</span>}
      </div>}
      {challenge.objective.kind === "endure" && <div>
        <Label>Each wave</Label>
        <div class="goal">Enemies +{challenge.objective.levelPerWave} Lv</div>
        {progress?.bestWave !== undefined && <div class="goal is-earned">Best wave {progress.bestWave}</div>}
      </div>}
      <div class={quest === null && challenge.objective.kind !== "endure" ? "quests__side-by-side" : undefined}>
        <div>
          <Label>{selected.kind === "quest" ? "First clear" : "Once per period"}</Label>
          {once === null ? <span class="dim">Only at rank I</span> : once === "claimed" ? <span class="dim claimed"><Icon name="check" />Claimed</span> : once === "restocking" ? <span class="dim">Restocks in {describeTimeUntil(nextReset(tuning.reset, now), now)}</span> : <Amounts store={store} rewards={once} preview={preview} compact />}
        </div>
        <div>
          <Label>Every clear</Label>
          <Amounts store={store} rewards={everyClear} />
        </div>
      </div>
    </div>
    <div class="quests__enemies" aria-label="Enemies, over what they are weak to">
      <EnemyFaces store={store} kinds={challengeEnemies(challenge)} inspected={inspected.value} inspect={(kind) => (inspected.value = kind)} />
    </div>
    {inspected.value !== null && <EnemyFacts store={store} kind={inspected.value} />}
  </Panel>
}

export const Quests = ({ store, nav, tab, play, leader, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly tab: QuestTab; readonly play: Signal<Play>; readonly leader: CharacterId; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, now = Date.now(), selected = play.value
  const key = selected.kind === "quest" ? `${selected.quest}-${rankOf(selected)}` : `${selected.track}-${selected.tier}`
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
