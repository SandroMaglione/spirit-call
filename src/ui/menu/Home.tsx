import type { Signal } from "@preact/signals"
import { characterLevel } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import { Icon } from "../Icon.tsx"
import { describePlay } from "../describe.ts"
import { elementOf } from "../draft.ts"
import type { TeamDraft } from "../draft.ts"
import type { UiStore } from "../store.ts"
import { ModelStage } from "./ModelStage.tsx"
import { Cta, ElementBadge, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Home = ({ store, nav, draft, play, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly draft: Signal<TeamDraft>; readonly play: Play; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value, team = draft.value.team
  const leader = team.includes(store.menuCharacter.value) ? store.menuCharacter.value : team[0]!
  return <div class="screen home">
    <div class="home__spirit"><div class="stage-orbit" aria-hidden="true" /><ModelStage character={leader} /></div>
    <div class="lobby-shortcuts">
      <button type="button" aria-label="Characters" onClick={() => nav.go({ kind: "character", character: leader, tab: "overview" })}><small>Characters</small><Portrait of={{ character: leader }} /></button>
      <button type="button" aria-label="Party" onClick={() => nav.go({ kind: "team" })}><small>Party</small><Icon name="formation" /></button>
      <button type="button" aria-label="Challenges" onClick={() => nav.go({ kind: "quests", tab: play.kind === "tier" ? "hardcore" : tuning.quests[play.quest].line })}><small>Challenges</small><Icon name="quests" /></button>
    </div>
    <div class="home__identity"><ElementBadge element={elementOf(tuning, leader)} /><h1>{tuning.characters[leader].name}</h1><span>Lv {characterLevel(tuning, account, leader).level}</span>
      {team.length > 1 && <div class="lobby-party">{team.map((member) => <button type="button" key={member} aria-label={`Lead with ${tuning.characters[member].name}`} aria-pressed={member === leader} onClick={() => (store.menuCharacter.value = member)}><Portrait of={{ character: member }} /></button>)}</div>}
    </div>
    <div class="lobby-play">
      <Cta disabled={store.busy.value} onClick={enter}>{store.busy.value ? "…" : describePlay(tuning, play)}</Cta>
    </div>
  </div>
}
