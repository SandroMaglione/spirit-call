/**
 * Picking what to play, by tab (the main line by chapter, the secondary
 * quests, the hardcore tracks by tier), with the briefing of the one picked:
 * its objective and enemy level, the enemies it holds and how each takes the
 * elements, what each clear pays, and what clearing it gives. What is not
 * open yet says why and cannot be picked.
 */
import type { Signal } from "@preact/signals"

import { clearPay, encounterOf, nextReset, playLock, samePlay, tierProgress, tierRewardsAvailable } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { challengeEnemies, describeAmounts, describeLock, describeObjective, describePlay, describeRewards, describeTimeUntil } from "../describe.ts"
import type { UiStore } from "../store.ts"
import { Cta, Foe, ids, TopBar } from "./parts.tsx"
import type { Nav, QuestTab } from "./parts.tsx"

const tabNames: { readonly [Tab in QuestTab]: string } = { main: "Main", secondary: "Secondary", hardcore: "Hardcore" }

export const Quests = ({ store, nav, tab, play, enter }: {
  readonly store: UiStore
  readonly nav: Nav
  readonly tab: QuestTab
  readonly play: Signal<Play>
  readonly enter: () => void
}) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const now = Date.now()
  const questIds = ids(tuning.quests)

  /** An entry of the list; a locked one says why. */
  const entry = (candidate: Play, key: string, number: string, name: string, state: string | null) => {
    const lock = playLock(tuning, account, candidate)
    const encounter = encounterOf(tuning, candidate)
    const challenge = tuning.challenges[encounter.challenge]
    return (
      <button
        key={key}
        type="button"
        class={`entry${samePlay(candidate, play.value) ? " is-selected" : ""}`}
        disabled={lock !== null}
        aria-pressed={samePlay(candidate, play.value)}
        onClick={() => (play.value = candidate)}
      >
        <span class="entry__number">{number}</span>
        <span class="entry__name">{name}</span>
        <small class="entry__meta">
          {lock === null ? `${describeObjective(challenge.objective, challenge.waves.scripted.length)} · Lv ${encounter.enemyLevel}` : describeLock(tuning, lock)}
        </small>
        {state !== null && <span class="entry__state">{state}</span>}
      </button>
    )
  }
  const questEntry = (id: (typeof questIds)[number], index: number) =>
    entry({ kind: "quest", quest: id }, id, tuning.quests[id].line === "main" ? `${index + 1}` : "", tuning.quests[id].name, (account.quests[id]?.firstClearedAt ?? null) !== null ? "✓" : null)

  const list = () => {
    switch (tab) {
      case "main":
        return ids(tuning.chapters).map((chapter) => (
          <div key={chapter} class="group">
            <h2 class="group__title">{tuning.chapters[chapter].name}</h2>
            {questIds.filter((id) => tuning.quests[id].chapter === chapter).map(questEntry)}
          </div>
        ))
      case "secondary":
        return <div class="group">{questIds.filter((id) => tuning.quests[id].line === "secondary").map(questEntry)}</div>
      case "hardcore":
        return ids(tuning.tracks).map((track) => (
          <div key={track} class="group">
            <h2 class="group__title">{tuning.tracks[track].name}</h2>
            {tuning.tracks[track].tiers.map((_, index) => {
              const tier = index + 1
              const progress = tierProgress(account, track, tier)
              const cleared = (progress?.firstClearedAt ?? null) !== null
              // Lasting until the team falls, how far it got shows too.
              const endless = tuning.challenges[tuning.tracks[track].challenge].objective.kind === "endure"
              const best = endless && progress?.bestWave !== undefined ? `W${progress.bestWave}` : null
              const state = [cleared ? "✓" : null, best].filter((part) => part !== null).join(" ")
              return entry({ kind: "tier", track, tier }, `${track}-${tier}`, `${tier}`, `Tier ${tier}`, state === "" ? null : state)
            })}
          </div>
        ))
    }
  }

  const selected = play.value
  const encounter = encounterOf(tuning, selected)
  const challenge = tuning.challenges[encounter.challenge]
  const rewards = () => {
    if (selected.kind === "quest") {
      const spec = tuning.quests[selected.quest]
      return (account.quests[selected.quest]?.firstClearedAt ?? null) !== null
        ? <span class="brief__done">Cleared</span>
        : <span class="brief__reward">First clear {describeRewards(tuning, spec.rewards)}</span>
    }
    const spec = tuning.tracks[selected.track].tiers[selected.tier - 1]!.rewards
    return tierRewardsAvailable(tuning, account, selected.track, selected.tier, now)
      ? <span class="brief__reward">This period +{spec.experience} XP · {describeAmounts(tuning, spec.currencies)}</span>
      : <span class="brief__done">Collected · resets in {describeTimeUntil(nextReset(tuning.reset, now), now)}</span>
  }

  return (
    <div class="screen quests">
      <TopBar nav={nav} title="Quests" />
      <div class="tabs" role="tablist">
        {(Object.keys(tabNames) as Array<QuestTab>).map((id) => (
          <button key={id} type="button" role="tab" class={`tab${id === tab ? " is-selected" : ""}`} aria-selected={id === tab} onClick={() => nav.replace({ kind: "quests", tab: id })}>
            {tabNames[id]}
          </button>
        ))}
      </div>
      <div class="quests__list">{list()}</div>
      <section class="brief">
        <h2 class="brief__name">{describePlay(tuning, selected)}</h2>
        <p class="brief__description">{challenge.description}</p>
        <div class="brief__chips">
          <span>{describeObjective(challenge.objective, challenge.waves.scripted.length)}</span>
          <span>{tuning.arenas[challenge.arena].name}</span>
          <span>
            Enemies Lv {encounter.enemyLevel}
            {challenge.objective.kind === "endure" && challenge.objective.levelPerWave > 0 ? `, +${challenge.objective.levelPerWave} a wave` : ""}
          </span>
          {selected.kind === "tier" && tierProgress(account, selected.track, selected.tier)?.bestWave !== undefined && (
            <span>Best wave {tierProgress(account, selected.track, selected.tier)!.bestWave}</span>
          )}
          <span>{describeAmounts(tuning, { gold: clearPay(tuning.progression.gold, encounter.enemyLevel) })} a clear</span>
        </div>
        <div class="brief__foes">
          {challengeEnemies(challenge).map((kind) => <Foe key={kind} store={store} kind={kind} />)}
          {challenge.waves.endless !== null && <span class="brief__more">…then endless waves</span>}
        </div>
        <div class="brief__end">
          {rewards()}
          <div class="brief__actions">
            <button type="button" class="ghost" onClick={() => nav.go({ kind: "team" })}>
              Team
            </button>
            <Cta onClick={enter}>Play</Cta>
          </div>
        </div>
      </section>
    </div>
  )
}
