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
import { auditionSlot, characterLevel, isAuditionPart, chestRewards, chestsOpened, clearPay, encounterOf, groupStars, lentFor, levelsUnder, materialPay, owns, perfectPay, playLock, questCleared, questProgress, questRewards, questsOf, rankOf, samePlay, tierProgress } from "../../account/account.ts"
import type { ChestRef, Play } from "../../account/account.ts"
import { perfectUnlock } from "../../content/collection.ts"
import { gradeOfRank } from "../../content/materials.ts"
import type { QuestId, StarGroup, Unlock } from "../../content/quests.ts"
import { relicOf } from "../../content/relics.ts"
import { LookIcon, RelicIcon } from "../RelicIcon.tsx"
import { AbilityIcon } from "../AbilityIcon.tsx"
import { aspectOf } from "../../content/aspects.ts"
import { cosmeticOf } from "../../content/cosmetics.ts"
import { describeGoal } from "../../content/stars.ts"
import { entryChampion, entryElite, entryKind, entryShield } from "../../content/challenges.ts"
import type { ChallengeId, ChallengeSpec, WaveEntry } from "../../content/challenges.ts"
import { elements } from "../../content/elements.ts"
import type { Novelty } from "../../content/novelties.ts"
import type { TwistValue } from "../../schema.ts"
import { Face } from "../kit/art.tsx"
import type { CharacterId } from "../../content/characters.ts"
import type { TrackId } from "../../content/hardcore.ts"
import { challengeEnemies, describeLock, describeObjective, describeUnlock } from "../describe.ts"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import type { IconName } from "../Icon.tsx"
import { Pill } from "../kit/controls.tsx"
import { Bar, Label, Panel, Row } from "../kit/panel.tsx"
import { Actions, Screen, TopBar, TopTabs } from "../kit/shell.tsx"
import { playsIn } from "../navigation.ts"
import type { UiActions, UiStore } from "../store.ts"
import { Amounts, EnemyRow, ids, PartyStrip, Stars } from "./parts.tsx"
import type { Nav, QuestTab } from "./screens.ts"

const cleared = (store: UiStore, play: Play): boolean => {
  const account = store.account.value
  return play.kind === "quest" ? questCleared(account, play.quest, rankOf(play)) : tierProgress(account, play.track, play.tier)?.firstClearedAt != null
}

/** What a row says at its right: a quest's stars once cleared (a tier's tick), why it is locked, or its enemies' level. */
const RowEnd = ({ store, play }: { readonly store: UiStore; readonly play: Play }) => {
  const tuning = store.tuning.value, lock = playLock(tuning, store.account.value, play)
  if (play.kind === "quest" && cleared(store, play)) return <Stars earned={questProgress(store.account.value, play.quest, rankOf(play))?.stars ?? []} perfect={questProgress(store.account.value, play.quest, rankOf(play))?.perfectAt !== undefined} />
  if (cleared(store, play)) return <span class="done"><Icon name="check" /></span>
  if (lock !== null) return <Icon name="lock" />
  return <>Lv {encounterOf(tuning, play, store.account.value).enemyLevel}</>
}

/** A group's chests along its stars at `rank`: each at the stars it needs, opened ones ticked; tap one to see what it holds (`picked`: the one shown). */
const ChestTrack = ({ store, group, rank, picked, pick }: { readonly store: UiStore; readonly group: StarGroup; readonly rank: number; readonly picked: ChestRef | null; readonly pick: (chest: ChestRef) => void }) => {
  const tuning = store.tuning.value, account = store.account.value, chests = tuning.chests[group], open = chestsOpened(account, group, rank)
  const { earned, total } = groupStars(tuning, account, group, rank)
  return <div class="chests" aria-label={`${earned} of ${total} stars; ${open} of ${chests.length} chests open`}>
    <span class="chests__bar"><span style={{ width: `${(Math.min(earned, total) / total) * 100}%` }} /></span>
    {chests.map((chest, index) => <button type="button" key={index} class={`chests__one${index < open ? " is-open" : ""}`} style={{ left: `${(chest.stars / total) * 100}%` }}
      aria-label={`Chest at ${chest.stars} stars`} aria-pressed={picked?.group === group && picked.index === index && picked.rank === rank} onClick={() => pick({ group, index, rank })}>
      <Icon name={index < open ? "check" : "chest"} /><small>{chest.stars}</small>
    </button>)}
  </div>
}

/** What a chest holds, how many stars it needs, how far the group is from it, and under a rule the group's quests with their stars (tap one to see its brief). */
const ChestBrief = ({ store, chest, open }: { readonly store: UiStore; readonly chest: ChestRef; readonly open: (play: Play) => void }) => {
  const tuning = store.tuning.value, account = store.account.value, spec = tuning.chests[chest.group][chest.index]!
  const { earned } = groupStars(tuning, account, chest.group, chest.rank)
  const opened = chestsOpened(account, chest.group, chest.rank) > chest.index
  const group = `${chest.group === "secondary" ? "Side quests" : tuning.chapters[chest.group].name}${chest.rank > 1 ? ` · Rank ${rankNames[chest.rank - 1]}` : ""}`
  return <Panel class="quests__brief in-right" title={`Chest · ${spec.stars} stars`} subtitle={group}
    detail={opened ? <><Icon name="check" />Opened</> : <><Icon name="star" />{Math.min(earned, spec.stars)} / {spec.stars}</>}
    note={opened ? undefined : `${spec.stars - Math.min(earned, spec.stars)} more ${spec.stars - earned === 1 ? "star" : "stars"} to open it.`} noteIcon="star">
    <div class={`chest-brief${opened ? " is-open" : ""}`}>
      <span class="chest-brief__icon"><Icon name="chest" /></span>
      <div>
        <Label>{opened ? "It gave" : "It holds"}</Label>
        <Amounts store={store} rewards={{ currencies: chestRewards(tuning, chest), unlocks: [] }} />
        {!opened && <Bar value={Math.min(1, earned / spec.stars)} label="Stars toward this chest" />}
      </div>
    </div>
    <div class="brief-section">
      <Label>Stars in {chest.group === "secondary" ? "side quests" : "this chapter"}</Label>
      <div class="chest-quests">{questsOf(tuning, chest.group).map((quest) => {
        const play: Play = { kind: "quest", quest, ...(chest.rank === 1 ? {} : { rank: chest.rank }) }, locked = playLock(tuning, account, play) !== null
        return <button type="button" key={quest} class={`chest-quest${locked ? " is-locked" : ""}`} onClick={() => open(play)}>
          <span>{tuning.quests[quest].name}</span>
          {locked ? <Icon name="lock" /> : <Stars earned={questProgress(account, quest, chest.rank)?.stars ?? []} total={tuning.quests[quest].stars.length} />}
        </button>
      })}</div>
    </div>
  </Panel>
}

/** The rank names, as on the steps. */
const rankNames = ["I", "II", "III", "IV", "V"]

/** `quest` at `rank` (rank 1 as the quest itself). */
const questAt = (quest: QuestId, rank: number): Play => ({ kind: "quest", quest, ...(rank === 1 ? {} : { rank }) })

/**
 * The ranks above the quest list, fixed while the list scrolls: each a tab
 * with its name (a lock until its first quest opens); switching keeps the
 * quest picked.
 */
const RankTabs = ({ store, tab, play, chest }: { readonly store: UiStore; readonly tab: "main" | "secondary"; readonly play: Signal<Play>; readonly chest: Signal<ChestRef | null> }) => {
  const tuning = store.tuning.value, account = store.account.value
  const quests = playsIn(tuning, tab).flatMap((each) => (each.kind === "quest" ? [each.quest] : []))
  const rank = play.value.kind === "quest" ? rankOf(play.value) : 1
  return <div class="quests__ranks top-tabs" role="tablist" aria-label="Rank">
    {Array.from({ length: tuning.ranks.count }, (_, index) => {
      const each = index + 1, locked = playLock(tuning, account, questAt(quests[0]!, each)) !== null
      return <button type="button" role="tab" key={each} aria-selected={each === rank} class={locked ? "is-locked" : undefined} onClick={() => {
        play.value = questAt(play.value.kind === "quest" ? play.value.quest : quests[0]!, each)
        chest.value = null
      }}>
        Rank {each}{locked && <Icon name="lock" />}
      </button>
    })}
  </div>
}

/** The main line's chapters (or the side quests) at the rank picked above them: each with its stars and chests at that rank, its quests with theirs. */
const QuestList = ({ store, tab, play, chest }: { readonly store: UiStore; readonly tab: "main" | "secondary"; readonly play: Signal<Play>; readonly chest: Signal<ChestRef | null> }) => {
  const tuning = store.tuning.value, account = store.account.value
  const rank = play.value.kind === "quest" ? rankOf(play.value) : 1
  const quests = playsIn(tuning, tab).flatMap((each) => (each.kind === "quest" ? [each.quest] : []))
  const groups: ReadonlyArray<{ readonly group: StarGroup; readonly name: string; readonly quests: ReadonlyArray<QuestId> }> = tab === "main"
    ? ids(tuning.chapters).map((chapter) => ({ group: chapter, name: tuning.chapters[chapter].name, quests: quests.filter((quest) => tuning.quests[quest].chapter === chapter) }))
    : [{ group: "secondary", name: "Side quests", quests }]
  return <>
    {groups.filter((group) => group.quests.length > 0).map((group) => {
      const stars = groupStars(tuning, account, group.group, rank)
      return <>
        <Label key={group.name} end={<><Icon name="star" />{stars.earned} / {stars.total}</>}>{group.name}</Label>
        {questsOf(tuning, group.group).length > 0 && <ChestTrack key={`${group.name}-chests-${rank}`} store={store} group={group.group} rank={rank} picked={chest.value} pick={(picked) => (chest.value = picked)} />}
        {group.quests.map((quest) => {
          const each = questAt(quest, rank)
          return <Row key={`${quest}-${rank}`} lead={quests.indexOf(quest) + 1} selected={play.value.kind === "quest" && play.value.quest === quest} locked={playLock(tuning, account, each) !== null} end={<RowEnd store={store} play={each} />} onClick={() => { play.value = each; chest.value = null }}>{tuning.quests[quest].name}</Row>
        })}
      </>
    })}
  </>
}

/** The hardcore tracks, the element trials, or the auditions (`kind`), each opening on the tier or rank to play next. */
const TrackList = ({ store, play, kind }: { readonly store: UiStore; readonly play: Signal<Play>; readonly kind: "hardcore" | "trial" | "audition" }) => {
  const tuning = store.tuning.value, account = store.account.value
  /** A track opens on the tier to do next: the first open one not cleared yet, else its last open one. */
  const open = (track: TrackId): Play => {
    const tiers = tuning.tracks[track].tiers.map((_, index) => ({ kind: "tier" as const, track, tier: index + 1 }))
    const playable = tiers.filter((each) => playLock(tuning, account, each) === null)
    return playable.find((each) => !cleared(store, each)) ?? playable[playable.length - 1] ?? tiers[0]!
  }
  return <>
    {kind === "hardcore"
      ? <Label end="Each tier pays once">Tracks</Label>
      : kind === "audition" ? <Label end={<><Icon name="invitations" />{account.wallet.invitations ?? 0} to give</>}>Auditions · you choose who</Label>
      : <Label end="Every clear pays">Element trials</Label>}
    {ids(tuning.tracks).filter((track) => tuning.tracks[track].kind === kind).map((track) => {
      const spec = tuning.tracks[track], first: Play = { kind: "tier", track, tier: 1 }, lock = playLock(tuning, account, first)
      const best = Math.max(0, ...spec.tiers.map((_, index) => tierProgress(account, track, index + 1)?.bestWave ?? 0))
      const done = spec.tiers.filter((_, index) => cleared(store, { kind: "tier", track, tier: index + 1 })).length
      // An audition shows whose it is; one whose character is owned is ticked.
      const lead = spec.character === null ? undefined : <Face of={{ character: spec.character }} tint={elementOf(tuning, spec.character)} size={26} />
      // An audition waiting for its invitation shows it can be given one now.
      const invitable = lock?.kind === "invite" && (account.wallet.invitations ?? 0) > 0
      return <Row key={track} tall lead={lead} selected={play.value.kind === "tier" && play.value.track === track} locked={lock !== null && !invitable} onClick={() => (play.value = open(track))}
        end={invitable ? <Icon name="invitations" /> : lock !== null ? <Icon name="lock" /> : tuning.challenges[spec.tiers[0]!.challenge].objective.kind === "endure" && best > 0 ? `Best wave ${best}` : `${done} / ${spec.tiers.length}`}>{spec.character === null ? spec.name : tuning.characters[spec.character].name}</Row>
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
/**
 * A new thing's tag (beside a rank's name, for a twist): what kind of thing it is, in its
 * colours — a champion in gold, an element (an elite's, a floor's) in its
 * own, an ability in steel, a new enemy plain.
 */
const Tag = ({ mark, tint, icon, children }: { readonly mark: "champion" | "element" | "ability" | "enemy"; readonly tint?: string | undefined; readonly icon?: IconName | undefined; readonly children: string }) =>
  <span class="novelty__tag" data-mark={mark} data-tint={tint}>{icon !== undefined && <Icon name={icon} />}<span>{children}</span></span>

const NewThing = ({ store, challenge, novelty, text }: { readonly store: UiStore; readonly challenge: ChallengeId; readonly novelty: Novelty; readonly text: string }) => {
  const carrier = carrierOf(store.tuning.value.challenges[challenge], novelty)
  const tint = novelty.kind === "hazard" ? novelty.element : carrier === undefined ? undefined : entryElite(carrier) ?? undefined
  // The picture glows in the tag's colours: gold for a champion, an element's for elites and floors, steel for an ability.
  const mark = novelty.kind === "champion" ? "champion" : novelty.kind === "elites" || novelty.kind === "hazard" ? "element" : novelty.kind === "shield" ? "ability" : undefined
  const tags = novelty.kind === "champion" ? [<Tag key="champion" mark="champion">Champion</Tag>]
    : novelty.kind === "elites" ? novelty.elements.map((element) => <Tag key={element} mark="element" tint={element} icon={element}>{`${elements[element].name} elite`}</Tag>)
    : novelty.kind === "hazard" ? [<Tag key="floor" mark="element" tint={novelty.element} icon={novelty.element}>{`${elements[novelty.element].name} floor`}</Tag>]
    : novelty.kind === "shield" ? [<Tag key="shield" mark="ability" icon="def">Shield</Tag>]
    : [<Tag key="enemy" mark="enemy">Enemy</Tag>]
  return <div class="novelty">
    {carrier !== undefined
      ? <span class="novelty__art" data-mark={mark} data-tint={tint ?? ""} aria-label={store.tuning.value.enemies[entryKind(carrier)].name}>
        <Face of={{ enemy: entryKind(carrier) }} tint={tint} size={34} />
      </span>
      : <span class="novelty__art novelty__floor" data-mark={mark} data-tint={tint ?? ""}><Icon name={novelty.kind === "hazard" ? novelty.element : "info"} /></span>}
    <div>
      <Label>{tags}</Label>
      <p>{text}</p>
    </div>
  </div>
}

/** A higher rank's twist, or a hardcore tier's ruleset (`title`), first in its brief where a quest's new thing would be: what makes it harder, tagged like a new thing. */
const RankTwist = ({ store, title, twist }: { readonly store: UiStore; readonly title: string; readonly twist: TwistValue }) => {
  const lines = [
    ...(twist.leader === null ? [] : [`Every wave is led by a ${store.tuning.value.enemies[twist.leader].name.toLowerCase()}.`]),
    ...(twist.elites === null ? [] : [`From the second wave, each wave's leader is an elite of ${twist.elites}.`]),
    ...(twist.shields ? ["Each wave's leader carries a shield."] : [])
  ]
  return <div class="novelty">
    <span class="novelty__art novelty__floor" data-mark={twist.elites !== null ? "element" : twist.shields ? "ability" : undefined} data-tint={twist.elites ?? ""}><Icon name={twist.elites ?? "def"} /></span>
    <div>
      <Label><span class="novelty__new">{title}</span>
        {twist.leader !== null && <Tag mark="enemy">{`${store.tuning.value.enemies[twist.leader].name} leaders`}</Tag>}
        {twist.elites !== null && <Tag mark="element" tint={twist.elites} icon={twist.elites}>Elite leaders</Tag>}
        {twist.shields && <Tag mark="ability" icon="def">Shields</Tag>}
      </Label>
      <p>{lines.length === 0 ? "Stronger enemies." : title.startsWith("Rank") ? `Stronger enemies. ${lines.join(" ")}` : lines.join(" ")}</p>
    </div>
  </div>
}

/**
 * What `play` is, most wanted first: its ranks or tiers (each with its
 * enemies' level), its stars beside what it gives, then its enemies over
 * what they are weak to (tap one to read about it). What is new in a main
 * quest comes first, with its picture.
 */
const Brief = ({ store, nav, play }: { readonly store: UiStore; readonly nav: Nav; readonly play: Signal<Play> }) => {
  const tuning = store.tuning.value, account = store.account.value, selected = play.value
  const lock = playLock(tuning, account, selected), encounter = encounterOf(tuning, selected, account), challenge = tuning.challenges[encounter.challenge]
  // Levels matter (see `levelGap`): a party well under the enemies is told so, with the way to train its weakest.
  const team = store.menuDraft.value.team
  const under = lock === null ? levelsUnder(tuning, account, team, encounter.enemyLevel) : null
  const weakest = [...team].sort((a, b) => characterLevel(tuning, account, a).level - characterLevel(tuning, account, b).level)[0]
  const done = cleared(store, selected)
  const element = selected.kind === "quest" ? tuning.quests[selected.quest].element : tuning.tracks[selected.track].element
  const track = selected.kind === "tier" ? tuning.tracks[selected.track] : null
  const trial = track?.kind === "trial"
  const lent = lentFor(tuning, selected, account)
  // The grade of essence this pays: a quest's rank's, a track tier's by the rank that opens it.
  const grade = gradeOfRank(selected.kind === "quest" ? rankOf(selected) : track!.tiers[selected.tier - 1]?.opensRank ?? 1)
  // Only a trial pays essence on every clear; a quest pays it on its first clear, a hardcore tier with its rewards, once.
  const everyClear = { currencies: { gold: clearPay(tuning.progression.gold, encounter.enemyLevel), ...(trial ? materialPay(tuning, grade, element, encounter.enemyLevel, 1) : {}) }, unlocks: [] }
  const preview = (character: CharacterId) => nav.go({ kind: "character", character, tab: "kit" })
  const progress = selected.kind === "tier" ? tierProgress(account, selected.track, selected.tier) : undefined
  /** The steps of the same challenge: a quest's ranks, a track's tiers. */
  const steps: ReadonlyArray<{ readonly play: Play; readonly name: string }> = selected.kind === "quest"
    ? [] // A quest's ranks are the tabs above the list.
    : tuning.tracks[selected.track].tiers.map((_, index) => ({ play: { kind: "tier", track: selected.track, tier: index + 1 }, name: track?.kind === "audition" && (index === 3 || track.tiers.length === 1) ? "M" : String(index + 1) }))
  const quest = selected.kind === "quest" ? tuning.quests[selected.quest] : null
  const rank = selected.kind === "quest" ? rankOf(selected) : 1
  const earnedStars = selected.kind === "quest" ? questProgress(account, selected.quest, rank)?.stars ?? [] : []
  const perfected = selected.kind === "quest" && questProgress(account, selected.quest, rank)?.perfectAt !== undefined
  // What this rank's perfect clear gives: gold and essence always, and a relic or a relic's next tier where one is written (see `perfectUnlock`).
  const perfectPrize = selected.kind === "quest" ? perfectUnlock(tuning, selected.quest, rank) : null
  const perfectAmounts = selected.kind === "quest" ? perfectPay(tuning, selected.quest, rank) : null
  // What the first clear gives, listed once claimed too (ticked and dimmed), so what it gave is still there to read.
  const tierSpec = selected.kind === "tier" ? track!.tiers[selected.tier - 1] : undefined
  const firstClear = selected.kind === "quest" ? questRewards(tuning, selected.quest, rank) : tierSpec?.rewards ?? null
  const essence = selected.kind === "quest"
    ? materialPay(tuning, grade, element, encounter.enemyLevel, rank === 1 ? tuning.materialRules.firstClear : tuning.materialRules.rankFirstClear)
    : track?.kind === "hardcore" ? materialPay(tuning, grade, element, encounter.enemyLevel, tuning.materialRules.tierClear) : {}
  // The first clear's gold and essence above; what it makes yours (a character, an aspect, a relic, a look) each on a line of its own below, as the perfect clear's prize is.
  const once = firstClear === null || trial ? null : { unlocks: [], currencies: { ...firstClear.currencies, ...essence } }
  const prizes: ReadonlyArray<{ readonly unlock: Unlock; readonly ask: "clear" | "perfect" }> = [
    ...(trial ? [] : firstClear?.unlocks ?? []).map((unlock) => ({ unlock, ask: "clear" as const })),
    ...(perfectPrize === null ? [] : [{ unlock: perfectPrize, ask: "perfect" as const }])
  ]
  return <Panel class="quests__brief in-right"
    title={selected.kind === "quest" ? tuning.quests[selected.quest].name : tuning.tracks[selected.track].name}
    subtitle={quest !== null && quest.introduces === null ? "Side quest · what you have met, mixed" : undefined}
    detail={steps.length > 1 ? describeObjective(challenge.objective, challenge.waves.scripted.length) : `${describeObjective(challenge.objective, challenge.waves.scripted.length)} · Lv ${encounter.enemyLevel}`}
    note={lock?.kind === "invite" ? inviteNote(store, lock.character) : lock !== null ? describeLock(tuning, lock) : lent !== null ? `You play as ${tuning.characters[lent.character].name} alone, at level ${lent.level}: your own levels do not count.` : under !== null ? <>Your party is {under} levels under the enemies: they take less from it and hit harder.{weakest !== undefined && <button type="button" class="panel__link" onClick={() => nav.go({ kind: "character", character: weakest, tab: "overview" })}>Train</button>}</> : undefined}
    noteIcon={lock !== null ? "lock" : "info"}>
    {quest?.introduces != null && rank === 1 && <NewThing store={store} challenge={encounter.challenge} novelty={quest.introduces.novelty} text={quest.introduces.text} />}
    {quest !== null && rank > 1 && <RankTwist store={store} title={`Rank ${rankNames[rank - 1] ?? rank}`} twist={encounter.twist} />}
    {track?.kind === "hardcore" && (encounter.twist.leader !== null || encounter.twist.elites !== null || encounter.twist.shields) && <RankTwist store={store} title="Ruleset" twist={encounter.twist} />}
    {track?.kind === "audition" && track.character !== null && (encounter.twist.leader !== null || encounter.twist.elites !== null || encounter.twist.shields) && (
      <RankTwist store={store} title={selected.kind === "tier" && isAuditionPart(tuning, selected.track, selected.tier) ? `${capitalised(ordinalOf(placeOf(store, track.character)))} audition` : "Mastery"} twist={encounter.twist} />
    )}
    {steps.length > 1 && <div class="steps" role="radiogroup" aria-label={selected.kind === "quest" || trial ? "Rank" : track?.kind === "audition" ? "Part" : "Tier"}>
      <Label>{selected.kind === "quest" || trial ? "Rank" : track?.kind === "audition" ? "Part" : "Tier"}</Label>
      {steps.map((step) => {
        const locked = playLock(tuning, account, step.play) !== null, on = samePlay(step.play, selected)
        return <button type="button" role="radio" key={step.name} class={`step${locked ? " is-locked" : ""}`} aria-checked={on} aria-label={`${selected.kind === "quest" || trial ? "Rank" : track?.kind === "audition" ? "Part" : "Tier"} ${step.name}, enemies level ${encounterOf(tuning, step.play, account).enemyLevel}`} onClick={() => (play.value = step.play)}>
          <b>{step.name}</b><span>{locked ? <Icon name="lock" /> : null}Lv {encounterOf(tuning, step.play, account).enemyLevel}</span>
        </button>
      })}
    </div>}
    <div class="quests__goals">
      {quest !== null && <div>
        <Label>Stars</Label>
        {quest.stars.map((goal, index) => <div key={index} class={`goal${earnedStars.includes(index) ? " is-earned" : ""}`}><Icon name="star" />{describeGoal(goal)}</div>)}
        {/* All three in one run, once: gold and essence (and a relic where one is written, below). */}
        {perfectAmounts !== null && <div class={`goal goal--perfect${perfected ? " is-earned" : ""}`}><span class="goal__stars" aria-label="All three stars in one run"><Icon name="star" /><Icon name="star" /><Icon name="star" /></span><Amounts store={store} rewards={{ currencies: perfectAmounts, unlocks: [] }} /></div>}
      </div>}
      {challenge.objective.kind === "endure" && <div>
        <Label>Each wave</Label>
        <div class="goal">Enemies +{challenge.objective.levelPerWave} Lv</div>
        {progress?.bestWave !== undefined && <div class="goal is-earned">Best wave {progress.bestWave}</div>}
      </div>}
      <div class={`quests__rewards${quest === null && challenge.objective.kind !== "endure" ? " quests__side-by-side" : ""}`}>
        {!trial && <div>
          <Label end={firstClear !== null && done ? <span class="claimed"><Icon name="check" />Claimed</span> : undefined}>First clear</Label>
          {once === null ? <span class="dim">None</span> : <div class={done ? "is-claimed" : undefined}><Amounts store={store} rewards={once} /></div>}
        </div>}
        <div>
          <Label>Every clear</Label>
          <Amounts store={store} rewards={everyClear} />
        </div>
      </div>
    </div>
    {prizes.map(({ unlock, ask }) => <Prize key={`${unlock.kind}-${unlock.id}-${ask}`} store={store} prize={unlock} ask={ask} preview={preview} />)}
    <div class="quests__enemies brief-section" aria-label="Enemies, over what they are weak to">
      <EnemyRow store={store} kinds={challengeEnemies(challenge)} />
    </div>
  </Panel>
}

/** The place `character`'s audition has among those opened: the one it was opened at, or the next. */
const placeOf = (store: UiStore, character: CharacterId): number => {
  const account = store.account.value
  return account.auditions[character]?.slot ?? Object.keys(account.auditions).length + 1
}

const ordinalOf = (place: number): string => ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"][place - 1] ?? `${place}th`

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** What opening an audition takes, and where it would stand: the next slot's level (see `invitationSlots`). */
const inviteNote = (store: UiStore, character: CharacterId): string => {
  const tuning = store.tuning.value, account = store.account.value
  const held = account.wallet.invitations ?? 0
  const slot = auditionSlot(tuning, account, character)
  return held > 0
    ? `Invite ${tuning.characters[character].name} with an invitation (you hold ${held}): as your ${ordinalOf(placeOf(store, character))} audition, it plays from level ${slot.level}.`
    : `Invitations come with milestones of the main line and the ranks: one opens the audition of the character you choose.`
}

/** What a prize is called above its name. */
const prizeLabels = { character: "New character", aspect: "New aspect", relic: "New relic", relicTier: "Relic tier", cosmetic: "New look" } as const

/**
 * Something a card makes yours, shown as the prize it is (see
 * docs/collection.md): its picture in a turning gold ring, its name, what it
 * is or does, and what it asks: the first clear, or all three stars in one
 * run. A character's opens her page. Dimmed once owned.
 */
const Prize = ({ store, prize, ask, preview }: { readonly store: UiStore; readonly prize: Unlock; readonly ask: "clear" | "perfect"; readonly preview: (character: CharacterId) => void }) => {
  const tuning = store.tuning.value
  const had = owns(store.account.value, prize)
  const relic = prize.kind === "relic" || prize.kind === "relicTier" ? relicOf(tuning.relics, prize.id) : null
  const element = prize.kind === "character" ? tuning.characters[prize.id].element : relic?.element ?? undefined
  const picture = prize.kind === "character" ? <Face of={{ character: prize.id }} tint={elementOf(tuning, prize.id)} size={40} />
    : prize.kind === "aspect" ? <AbilityIcon kind={aspectOf(tuning.aspects, prize.id).class} />
    : prize.kind === "cosmetic" ? <LookIcon kind={cosmeticOf(tuning.cosmetics, prize.id).kind} />
    : <RelicIcon slot={relic!.slot} element={relic!.element} />
  const name = prize.kind === "character" ? tuning.characters[prize.id].name
    : prize.kind === "aspect" ? aspectOf(tuning.aspects, prize.id).name
    : prize.kind === "cosmetic" ? cosmeticOf(tuning.cosmetics, prize.id).name
    : describeUnlock(tuning, prize).replace(" (relic)", "")
  const about = prize.kind === "character" ? `${elements[tuning.characters[prize.id].element].name} · ${tuning.classes[tuning.characters[prize.id].class].name} · ${roleNames[tuning.characters[prize.id].role]}`
    : prize.kind === "aspect" ? `${tuning.classes[aspectOf(tuning.aspects, prize.id).class].name} aspect: ${aspectOf(tuning.aspects, prize.id).against}`
    : prize.kind === "cosmetic" ? cosmeticOf(tuning.cosmetics, prize.id).about
    : relic!.tiers[prize.kind === "relic" ? 1 : prize.tier].adds
  const body = <>
    <span class="relic-prize__orb" aria-hidden="true">
      <span class="relic-prize__ring" />
      <span class="relic-prize__icon">{picture}</span>
      <span class="unlock-badge__glint" />
    </span>
    <div class="relic-prize__about">
      <Label end={had ? <span class="claimed"><Icon name="check" />Claimed</span> : undefined}>{prizeLabels[prize.kind]}</Label>
      <b class="relic-prize__name">{name}</b>
      <p>{about}</p>
      <p class="relic-prize__ask">{ask === "clear" ? <><Icon name="quests" />On the first clear</> : <><span class="relic-prize__stars"><Icon name="star" /><Icon name="star" /><Icon name="star" /></span>All three stars in one run</>}</p>
    </div>
  </>
  return prize.kind === "character"
    ? <button type="button" class={`relic-prize brief-section relic-prize--button${had ? " is-had" : ""}`} data-element={element} aria-label={`See ${name}`} onClick={() => preview(prize.id)}>{body}</button>
    : <div class={`relic-prize brief-section${had ? " is-had" : ""}`} data-element={element}>{body}</div>
}

/** A role's name. */
const roleNames = { attacker: "Attacker", healer: "Healer", guardian: "Guardian" } as const

export const Quests = ({ store, actions, nav, tab, play, leader, enter }: {
  readonly store: UiStore; readonly actions: UiActions; readonly nav: Nav; readonly tab: QuestTab; readonly play: Signal<Play>; readonly leader: CharacterId; readonly enter: () => void
}) => {
  const chest = useSignal<ChestRef | null>(null)
  const tuning = store.tuning.value, selected = play.value
  const lock = playLock(tuning, store.account.value, selected)
  // An audition waiting for its invitation: who it is for.
  const inviting = lock?.kind === "invite" ? lock.character : null
  const key = selected.kind === "quest" ? `${selected.quest}-${rankOf(selected)}` : `${selected.track}-${selected.tier}`
  // A chest picked in one tab is not shown in another.
  const shownChest = (tab === "main" || tab === "secondary") && chest.value !== null && (chest.value.group === "secondary") === (tab === "secondary") ? chest.value : null
  return <Screen name="quests">
    <TopBar icon="quests" title="Challenges" close={nav.back}>
      <TopTabs label="Kinds of challenge" current={tab} onChange={(id) => nav.replace({ kind: "quests", tab: id })} tabs={[{ id: "main", label: "Main" }, { id: "secondary", label: "Side" }, { id: "auditions", label: "Auditions" }, { id: "trials", label: "Trials" }, { id: "hardcore", label: "Hardcore" }]} />
    </TopBar>
    {(tab === "main" || tab === "secondary") && <RankTabs store={store} tab={tab} play={play} chest={chest} />}
    <div class={`quests__list scroll in-left${tab === "main" || tab === "secondary" ? " has-ranks" : ""}`} key={tab}>{tab === "hardcore" || tab === "trials" || tab === "auditions" ? <TrackList store={store} play={play} kind={tab === "trials" ? "trial" : tab === "auditions" ? "audition" : "hardcore"} /> : <QuestList store={store} tab={tab} play={play} chest={chest} />}</div>
    {shownChest !== null ? <ChestBrief key={`${shownChest.group}-${shownChest.index}`} store={store} chest={shownChest} open={(quest) => { play.value = quest; chest.value = null }} /> : <Brief key={key} store={store} nav={nav} play={play} />}
    <Actions>
      {/* An audition is played alone, by the character it lends: her face instead of the party. */}
      {lentFor(tuning, selected) === null
        ? <PartyStrip store={store} team={store.menuDraft.value.team} leader={leader} size={34} pick={() => nav.go({ kind: "team" })} edit={() => nav.go({ kind: "team" })} />
        : <Face of={{ character: lentFor(tuning, selected)!.character }} tint={elementOf(tuning, lentFor(tuning, selected)!.character)} size={38} selected />}
      {/* An audition not opened yet is opened here, with an invitation: the player's choice of who auditions next. */}
      {inviting !== null
        ? <Pill icon="invitations" disabled={store.busy.value || (store.account.value.wallet.invitations ?? 0) < 1} onClick={() => actions.openAudition(inviting)}>
          <span class="prize__button">Invite<small>{store.account.value.wallet.invitations ?? 0} held</small></span>
        </Pill>
        : <Pill icon="play" disabled={playLock(tuning, store.account.value, selected) !== null || store.busy.value} onClick={enter}>Enter</Pill>}
    </Actions>
  </Screen>
}
