import { Dialog } from "../Dialog.tsx"
import { RewardItems } from "./RewardItems.tsx"
import { Icon } from "../Icon.tsx"
/**
 * Picking what to play, by tab (the main line by chapter, the secondary
 * quests, the hardcore tracks by tier), with the briefing of the one picked:
 * its objective and enemy level, the enemies it holds and how each takes the
 * elements, what each clear pays, and what clearing it gives. What is not
 * open yet can be inspected, and says why it cannot be started.
 */
import { useSignal } from "@preact/signals"
import type { Signal } from "@preact/signals"
import type { EnemyKind } from "../../content/enemies.ts"
import { EnemyDetails } from "./EnemyDetails.tsx"

import { clearPay, encounterOf, nextReset, playLock, samePlay, tierProgress, tierRewardsAvailable } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { challengeEnemies, describeLock, describeObjective, describePlay, describeTimeUntil } from "../describe.ts"
import type { UiStore } from "../store.ts"
import { Cta, Foe, ids } from "./parts.tsx"
import type { Nav, QuestTab } from "./parts.tsx"

const tabNames: { readonly [Tab in QuestTab]: string } = { main: "Main", secondary: "Side", hardcore: "Hardcore" }

export const Quests = ({ store, nav, tab, play, enter }: {
  readonly store: UiStore
  readonly nav: Nav
  readonly tab: QuestTab
  readonly play: Signal<Play>
  readonly enter: () => void
}) => {
  const briefing = store.menuBriefing
  const inspecting = useSignal<EnemyKind | null>(null), information = useSignal(false)
  const tuning = store.tuning.value
  const account = store.account.value
  const now = Date.now()
  const questIds = ids(tuning.quests)

  /** An entry of the list; a locked one says why. */
  const entry = (candidate: Play, key: string, number: string, name: string, state: string | null) => {
    const lock = playLock(tuning, account, candidate)
    const encounter = encounterOf(tuning, candidate)
    return (
      <button
        key={key}
        type="button"
        class={`entry${samePlay(candidate, play.value) ? " is-selected" : ""}`}
        data-locked={lock !== null || undefined}
        aria-pressed={samePlay(candidate, play.value)}
        onClick={() => { play.value = candidate; briefing.value = true }}
      >
        <span class="entry__number">{lock === null ? number : <Icon name="lock" />}</span>
        <span class="entry__name">{name}</span>
        <small class="entry__meta">
          {`Lv ${encounter.enemyLevel}`}
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
  const lock = playLock(tuning, account, selected)
  const encounter = encounterOf(tuning, selected)
  const challenge = tuning.challenges[encounter.challenge]
  const cleared = selected.kind === "quest" && (account.quests[selected.quest]?.firstClearedAt ?? null) !== null
  const repeatRewards = { currencies: { gold: clearPay(tuning.progression.gold, encounter.enemyLevel) }, experience: clearPay(tuning.progression.account.run, encounter.enemyLevel), unlocks: [] }
  const rewards = () => {
    if (selected.kind === "quest") {
      const spec = tuning.quests[selected.quest]
      return cleared
        ? <RewardItems rewards={repeatRewards} store={store} nav={nav} />
        : <RewardItems rewards={spec.rewards} store={store} nav={nav} />
    }
    const spec = tuning.tracks[selected.track].tiers[selected.tier - 1]!.rewards
    return tierRewardsAvailable(tuning, account, selected.track, selected.tier, now)
      ? <RewardItems rewards={{ ...spec, unlocks: [] }} store={store} nav={nav} />
      : <span class="brief__done">Collected · resets in {describeTimeUntil(nextReset(tuning.reset, now), now)}</span>
  }

  return (
    <div class={`screen quests${briefing.value ? " is-briefing" : " is-browsing"}`}>
      <div class="page-intro"><h1>Challenges</h1></div>
      <div class="tabs" role="tablist">
        {(Object.keys(tabNames) as Array<QuestTab>).map((id) => (
          <button key={id} type="button" role="tab" class={`tab${id === tab ? " is-selected" : ""}`} aria-selected={id === tab} onClick={() => { briefing.value = false; nav.replace({ kind: "quests", tab: id }) }}>
            {tabNames[id]}
          </button>
        ))}
      </div>
      <div class="quests__list">{list()}</div>
      <section class="brief"><div class="brief__content">
        <button type="button" class="text-button mobile-challenge-back" onClick={() => (briefing.value = false)} aria-label="Challenge list"><Icon name="back" /></button>
        <div class="brief__heading"><h2 class="brief__name">{describePlay(tuning, selected)}</h2><button type="button" class="icon-button" aria-label="Challenge details" onClick={() => (information.value = true)}><Icon name="info" /></button></div>

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

        </div>

        <div class="brief__foes">
          {challengeEnemies(challenge).map((kind) => <Foe key={kind} store={store} kind={kind} inspect={(kind) => (inspecting.value = kind)} />)}
          {challenge.waves.endless !== null && <span class="brief__more">…then endless waves</span>}
        </div>
        <section class="brief__reward-section"><div class={`reward-line${cleared ? " is-repeat" : ""}`}><b>{selected.kind === "quest" ? cleared ? "Clear" : "First clear" : "Milestone"}</b>{rewards()}</div></section>
        </div>
        <div class="brief__end">
          <span class={lock === null ? "brief__done" : "lock-message"}>{lock === null ? "" : describeLock(tuning, lock)}</span>
          <div class="brief__actions">
            <button type="button" class="icon-button" aria-label="Party" onClick={() => nav.go({ kind: "team" })}><Icon name="team" /></button>
            <Cta disabled={lock !== null || store.busy.value} onClick={enter}><Icon name="play" />{store.busy.value ? "…" : "Start"}</Cta>
          </div>
        </div>
      </section>
      {information.value && <Dialog title={describePlay(tuning, selected)} close={() => (information.value = false)}><p>{challenge.description}</p><p>{tuning.arenas[challenge.arena].name}</p><p>Each clear also earns:</p><RewardItems rewards={repeatRewards} store={store} nav={nav} /></Dialog>}
      {inspecting.value !== null && <EnemyDetails store={store} kind={inspecting.value} close={() => (inspecting.value = null)} />}
    </div>
  )
}
