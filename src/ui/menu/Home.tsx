/**
 * The home: everything is one tap away. The places to go down the left, the
 * account and its currencies on top, the party at the bottom left (a tap on
 * a face leads with her), and the next thing to play, with its enemies,
 * over one Play.
 */
import { accountLevel, ascend, characterLevel, encounterOf, owns, relicPrice, relicsOpen, train } from "../../account/account.ts"
import { activeBanner, callProblem, callsHeld } from "../../account/calls.ts"
import type { Play } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import { challengeEnemies, describePlay } from "../describe.ts"
import { elementOf } from "../draft.ts"
import { Icon } from "../Icon.tsx"
import { Face, ModelStage } from "../kit/art.tsx"
import { Pill, RoundButton } from "../kit/controls.tsx"
import { Bar, Label } from "../kit/panel.tsx"
import { Screen, SideTabs } from "../kit/shell.tsx"
import type { UiStore } from "../store.ts"
import { ids, PartyStrip, Wallet } from "./parts.tsx"
import type { Nav, Screen as Place } from "./screens.ts"

/** Where `play` sits: its chapter, "Side quest", or its track. */
export const playCaption = (store: UiStore, play: Play): string => {
  const tuning = store.tuning.value
  if (play.kind === "tier") return tuning.tracks[play.track].kind === "trial" ? "Trial" : "Hardcore"
  const chapter = tuning.quests[play.quest].chapter
  return chapter === null ? "Side quest" : tuning.chapters[chapter as keyof typeof tuning.chapters].name
}

export const Home = ({ store, nav, leader, play, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly leader: CharacterId; readonly play: Play; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value, team = store.menuDraft.value.team
  const level = accountLevel(tuning, account), encounter = encounterOf(tuning, play)
  const canTrain = ids(tuning.characters).some((id) => owns(account, { kind: "character", id }) && (train(tuning, account, id).ok || ascend(tuning, account, id).ok))
  // Something to do at the Call: a call held, and someone on the banner to bring.
  const now = Date.now(), canCall = callProblem(tuning, account, activeBanner(tuning, now).banner, now) === null && callsHeld(tuning, account) > 0
  // Something to buy at the shop: a relic's next tier the dust pays for.
  const canBuy = relicsOpen(tuning, account) && ids(tuning.relics).some((id) => (relicPrice(tuning, account, id)?.dust ?? Infinity) <= (account.wallet.dust ?? 0))
  const places: { readonly [Id in string]: Place } = {
    characters: { kind: "character", character: leader, tab: "overview" },
    challenges: { kind: "quests", tab: play.kind === "tier" ? (tuning.tracks[play.track].kind === "trial" ? "trials" : "hardcore") : tuning.quests[play.quest].line },
    call: { kind: "call", tab: "banner" },
    shop: { kind: "shop", tab: "relics" },
    inventory: { kind: "inventory" },
    practice: { kind: "extra", mode: "training" }
  }
  return <Screen name="home">
    <div class="home__stage"><ModelStage key={leader} character={leader} /></div>
    <header class="topbar">
      <span class="account" aria-label={`Account level ${level.level}`}>
        <Face of={{ character: leader }} tint={elementOf(tuning, leader)} selected />
        <span><b>Lv {level.level}</b><Bar value={level.needed === 0 ? 1 : level.into / level.needed} label="Account experience" /></span>
      </span>
      <div class="topbar__fill" />
      <Wallet store={store} />
      <RoundButton icon="settings" tone="dark" label="Settings" onClick={() => nav.go({ kind: "settings" })} />
    </header>
    <SideTabs label="Menu" onChange={(id) => nav.go(places[id]!)} tabs={[
      { id: "challenges", label: "Challenges" },
      { id: "characters", label: "Characters", badge: canTrain },
      { id: "call", label: "Spirit Call", badge: canCall },
      { id: "shop", label: "Shop", badge: canBuy },
      { id: "inventory", label: "Inventory" },
    ]} />
    {store.notices.value.length > 0 && <div class="home__notices" role="status">{store.notices.value.map((notice, i) => <p key={i}>{notice}</p>)}<Pill size="small" tone="dark" onClick={() => (store.notices.value = [])}>Dismiss</Pill></div>}
    <div class="home__party in-left">
      <PartyStrip store={store} team={team} leader={leader} size={44} pick={(member) => (store.menuCharacter.value = member)} edit={() => nav.go({ kind: "team" })} />
      <span class="home__leader"><b>{tuning.characters[leader].name}</b><small>Lv {characterLevel(tuning, account, leader).level}</small></span>
    </div>
    <div class="home__next in-right">
      <Label>{playCaption(store, play)}</Label>
      <h2>{describePlay(tuning, play)}</h2>
      <button type="button" class="home__foes" aria-label="See the challenge" onClick={() => nav.go(places["challenges"]!)}>
        {challengeEnemies(tuning.challenges[encounter.challenge]).slice(0, 4).map((kind) => <Face key={kind} of={{ enemy: kind }} size={26} />)}
        <span>Lv {encounter.enemyLevel}</span><Icon name="next" />
      </button>
      <div class="home__play">
        <Pill tone="dark" size="small" icon="practice" onClick={() => nav.go(places["practice"]!)}>Practice</Pill>
        <Pill icon="play" size="large" disabled={store.busy.value} onClick={enter}>Play</Pill>
      </div>
    </div>
  </Screen>
}
