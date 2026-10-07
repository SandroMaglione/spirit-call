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
import type { ChestRef, Play } from "../../account/account.ts"
import type { StarGroup } from "../../content/quests.ts"
import { describeGoal } from "../../content/stars.ts"
import { entryChampion, entryElite, entryKind, entryShield } from "../../content/challenges.ts"
import type { ChallengeId, ChallengeSpec, WaveEntry } from "../../content/challenges.ts"
import type { Novelty } from "../../content/novelties.ts"
import { Face } from "../kit/art.tsx"
import type { CharacterId } from "../../content/characters.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import type { TrackId } from "../../content/hardcore.ts"
import { challengeEnemies, describeLock, describeObjective, describePlay, describeTimeUntil } from "../describe.ts"
import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"
import { Pill } from "../kit/controls.tsx"
import { Bar, Label, Panel, Row } from "../kit/panel.tsx"
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
/** A group's chests along its stars: each at the stars it needs, opened ones ticked; tap one to see what it holds (`picked`: the one shown). */
const ChestTrack = ({ store, group, picked, pick }: { readonly store: UiStore; readonly group: StarGroup; readonly picked: ChestRef | null; readonly pick: (chest: ChestRef) => void }) => {
  const tuning = store.tuning.value, account = store.account.value, chests = tuning.chests[group], open = account.chests[group] ?? 0
  const { earned, total } = groupStars(tuning, account, group)
  return <div class="chests" aria-label={`${earned} of ${total} stars; ${open} of ${chests.length} chests open`}>
    <span class="chests__bar"><span style={{ width: `${(Math.min(earned, total) / total) * 100}%` }} /></span>
    {chests.map((chest, index) => <button type="button" key={index} class={`chests__one${index < open ? " is-open" : ""}`} style={{ left: `${(chest.stars / total) * 100}%` }}
      aria-label={`Chest at ${chest.stars} stars`} aria-pressed={picked?.group === group && picked.index === index} onClick={() => pick({ group, index })}>
      <Icon name={index < open ? "check" : "chest"} /><small>{chest.stars}</small>
    </button>)}
  </div>
}

/** What a chest holds, how many stars it needs, how far the group is from it, and under a rule the group's quests with their stars (tap one to see its brief). */
const ChestBrief = ({ store, chest, open }: { readonly store: UiStore; readonly chest: ChestRef; readonly open: (play: Play) => void }) => {
  const tuning = store.tuning.value, account = store.account.value, spec = tuning.chests[chest.group][chest.index]!
  const { earned } = groupStars(tuning, account, chest.group)
  const opened = (account.chests[chest.group] ?? 0) > chest.index
  const group = chest.group === "secondary" ? "Side quests" : tuning.chapters[chest.group].name
  return <Panel class="quests__brief in-right" title={`Chest · ${spec.stars} stars`} subtitle={group}
    detail={opened ? <><Icon name="check" />Opened</> : <><Icon name="star" />{Math.min(earned, spec.stars)} / {spec.stars}</>}
    note={opened ? undefined : `${spec.stars - Math.min(earned, spec.stars)} more ${spec.stars - earned === 1 ? "star" : "stars"} to open it.`} noteIcon="star">
    <div class={`chest-brief${opened ? " is-open" : ""}`}>
      <span class="chest-brief__icon"><Icon name="chest" /></span>
      <div>
        <Label>{opened ? "It gave" : "It holds"}</Label>
        <Amounts store={store} rewards={{ experience: 0, currencies: spec.rewards, unlocks: [] }} />
        {!opened && <Bar value={Math.min(1, earned / spec.stars)} label="Stars toward this chest" />}
      </div>
    </div>
    <div class="brief-section">
      <Label>Stars in {chest.group === "secondary" ? "side quests" : "this chapter"}</Label>
      <div class="chest-quests">{questsOf(tuning, chest.group).map((quest) => {
        const play: Play = { kind: "quest", quest }, locked = playLock(tuning, account, play) !== null
        return <button type="button" key={quest} class={`chest-quest${locked ? " is-locked" : ""}`} onClick={() => open(play)}>
          <span>{tuning.quests[quest].name}</span>
          {locked ? <Icon name="lock" /> : <Stars earned={account.quests[quest]?.stars ?? []} total={tuning.quests[quest].stars.length} />}
        </button>
      })}</div>
    </div>
  </Panel>
}

const QuestList = ({ store, tab, play, chest }: { readonly store: UiStore; readonly tab: "main" | "secondary"; readonly play: Signal<Play>; readonly chest: Signal<ChestRef | null> }) => {
  const tuning = store.tuning.value, account = store.account.value
  const plays = playsIn(tuning, tab)
  const groups: ReadonlyArray<{ readonly group: StarGroup; readonly name: string; readonly plays: ReadonlyArray<Play> }> = tab === "main"
    ? ids(tuning.chapters).map((chapter) => ({ group: chapter, name: tuning.chapters[chapter].name, plays: plays.filter((each) => each.kind === "quest" && tuning.quests[each.quest].chapter === chapter) }))
    : [{ group: "secondary", name: "Side quests", plays }]
  return <>{groups.filter((group) => group.plays.length > 0).map((group) => {
    const stars = groupStars(tuning, account, group.group)
    return <>
      <Label key={group.name} end={<><Icon name="star" />{stars.earned} / {stars.total}</>}>{group.name}</Label>
      {questsOf(tuning, group.group).length > 0 && <ChestTrack key={`${group.name}-chests`} store={store} group={group.group} picked={chest.value} pick={(picked) => (chest.value = picked)} />}
      {group.plays.map((each) => <Row key={describePlay(tuning, each)} lead={plays.indexOf(each) + 1} selected={each.kind === "quest" && play.value.kind === "quest" ? each.quest === play.value.quest : samePlay(each, play.value)} locked={playLock(tuning, account, each) !== null} end={<RowEnd store={store} play={each} />} onClick={() => { play.value = each; chest.value = null }}>{describePlay(tuning, each)}</Row>)}
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
        end={lock !== null ? <Icon name="lock" /> : tuning.challenges[spec.tiers[0]!.challenge].objective.kind === "endure" && best > 0 ? `Best wave ${best}` : `${done} / ${spec.tiers.length}`}>{spec.name}</Row>
    })}
  </>
}

/** The first wave entry of `challenge` that shows `novelty` (the enemy that carries it), for its picture. */
const carrierOf = (challenge: ChallengeSpec, novelty: Novelty): WaveEntry | undefined => {
  const entries = challenge.waves.scripted.flat()
  switch (novelty.kind) {
    case "enemy":
      return entries.find((entry) => entryKind(entry) === novelty.enemy)
    case "champion":
      return entries.find((entry) => entryChampion(entry) && entryKind(entry) === novelty.enemy)
    case "elites":
      return entries.find((entry) => !entryChampion(entry) && entryElite(entry) !== null)
    case "shield":
      return entries.find(entryShield)
    case "hazard":
      return undefined
  }
}

/** A main quest's one new thing, first in its brief: its picture (the enemy that shows it, or its floor's element) beside its line; tap the enemy to read about it. */
const NewThing = ({ store, challenge, novelty, text, inspect }: { readonly store: UiStore; readonly challenge: ChallengeId; readonly novelty: Novelty; readonly text: string; readonly inspect: (kind: EnemyKind) => void }) => {
  const carrier = carrierOf(store.tuning.value.challenges[challenge], novelty)
  const tint = novelty.kind === "hazard" ? novelty.element : carrier === undefined ? undefined : entryElite(carrier) ?? undefined
  const badge: IconName | null = novelty.kind === "hazard" ? novelty.element : novelty.kind === "elites" ? novelty.elements[0] ?? null : novelty.kind === "shield" ? "def" : novelty.kind === "champion" ? "star" : null
  return <div class="novelty">
    {carrier !== undefined
      ? <button type="button" class="novelty__art face-button" aria-label={store.tuning.value.enemies[entryKind(carrier)].name} onClick={() => inspect(entryKind(carrier))}><Face of={{ enemy: entryKind(carrier) }} tint={tint} size={46} /></button>
      : <span class="novelty__art novelty__floor" data-tint={tint ?? ""}><Icon name={badge ?? "info"} /></span>}
    <div>
      <Label>New{novelty.kind === "elites" ? <> · {novelty.elements.map((element) => <Icon key={element} name={element} />)}</> : badge !== null && carrier !== undefined ? <> · <Icon name={badge} /></> : null}</Label>
      <p>{text}</p>
    </div>
  </div>
}

/**
 * What `play` is, most wanted first: its ranks or tiers (each with its
 * enemies' level), its stars beside what it gives, then its enemies over
 * what they are weak to (tap one to read about it). What is new in a main
 * quest comes first, with its picture.
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
    subtitle={quest !== null && quest.introduces === null ? "Side quest · what you have met, mixed" : undefined}
    detail={describeObjective(challenge.objective, challenge.waves.scripted.length)}
    note={lock === null ? undefined : describeLock(tuning, lock)} noteIcon="lock">
    {quest?.introduces != null && <NewThing store={store} challenge={encounter.challenge} novelty={quest.introduces.novelty} text={quest.introduces.text} inspect={(kind) => (inspected.value = kind)} />}
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
      <div class={`quests__rewards${quest === null && challenge.objective.kind !== "endure" ? " quests__side-by-side" : ""}`}>
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
    <div class="quests__enemies brief-section" aria-label="Enemies, over what they are weak to">
      <EnemyFaces store={store} kinds={challengeEnemies(challenge)} inspected={inspected.value} inspect={(kind) => (inspected.value = kind)} />
    </div>
    {inspected.value !== null && <EnemyFacts store={store} kind={inspected.value} />}
  </Panel>
}

export const Quests = ({ store, nav, tab, play, leader, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly tab: QuestTab; readonly play: Signal<Play>; readonly leader: CharacterId; readonly enter: () => void
}) => {
  const chest = useSignal<ChestRef | null>(null)
  const tuning = store.tuning.value, now = Date.now(), selected = play.value
  const key = selected.kind === "quest" ? `${selected.quest}-${rankOf(selected)}` : `${selected.track}-${selected.tier}`
  // A chest picked in one tab is not shown in another.
  const shownChest = tab !== "hardcore" && chest.value !== null && (chest.value.group === "secondary") === (tab === "secondary") ? chest.value : null
  return <Screen name="quests">
    <TopBar icon="quests" title="Challenges" close={nav.back}>
      <TopTabs label="Kinds of challenge" current={tab} onChange={(id) => nav.replace({ kind: "quests", tab: id })} tabs={[{ id: "main", label: "Main" }, { id: "secondary", label: "Side" }, { id: "hardcore", label: "Hardcore" }]} />
    </TopBar>
    <div class="quests__list scroll in-left" key={tab}>{tab === "hardcore" ? <TrackList store={store} play={play} now={now} /> : <QuestList store={store} tab={tab} play={play} chest={chest} />}</div>
    {shownChest !== null ? <ChestBrief key={`${shownChest.group}-${shownChest.index}`} store={store} chest={shownChest} open={(quest) => { play.value = quest; chest.value = null }} /> : <Brief key={key} store={store} nav={nav} play={play} now={now} />}
    <Actions>
      <PartyStrip store={store} team={store.menuDraft.value.team} leader={leader} size={34} pick={() => nav.go({ kind: "team" })} edit={() => nav.go({ kind: "team" })} />
      <Pill icon="play" disabled={playLock(tuning, store.account.value, selected) !== null || store.busy.value} onClick={enter}>Enter</Pill>
    </Actions>
  </Screen>
}
