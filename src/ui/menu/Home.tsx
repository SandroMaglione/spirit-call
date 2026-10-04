import { Icon } from "../Icon.tsx"
import { accountLevel, characterLevel, equipmentOf, playLock } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import { describeLock, describePlay } from "../describe.ts"
import { elementOf } from "../draft.ts"
import { nextMainQuest } from "../navigation.ts"
import type { UiStore } from "../store.ts"
import { Cta, ElementBadge, Model, Portrait } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Home = ({ store, nav, team, play, enter }: {
  readonly store: UiStore; readonly nav: Nav; readonly team: ReadonlyArray<CharacterId>; readonly play: Play; readonly enter: () => void
}) => {
  const tuning = store.tuning.value, account = store.account.value
  const leader = team[0]!, level = accountLevel(tuning, account)
  const weapon = equipmentOf(tuning, account, leader).weapon
  const next = nextMainQuest(tuning, account), lock = playLock(tuning, account, play)
  return <div class="screen home" data-element={elementOf(tuning, leader) ?? undefined}>
    <section class="home__identity">
      <h1>{tuning.characters[leader].name}</h1>
      <div class="account-progress">
        <span>Account Lv <b>{level.level}</b></span>
        <span>{level.needed === 0 ? "Maximum level" : `${Math.floor(level.into)} / ${level.needed} XP`}</span>
        <div class="progress-track" role="progressbar" aria-label="Account experience" aria-valuemin={0} aria-valuemax={level.needed || 1} aria-valuenow={level.needed === 0 ? 1 : level.into}><i style={{ width: `${level.needed === 0 ? 100 : 100 * level.into / level.needed}%` }} /></div>
      </div>
      <button type="button" class="portrait-card" data-element={elementOf(tuning, leader) ?? undefined} onClick={() => nav.go({ kind: "character", character: leader, tab: "overview" })}>
        <Portrait of={{ character: leader }} /><span><small>On the field</small><b>{tuning.characters[leader].name}</b><ElementBadge element={elementOf(tuning, leader)} /></span><Icon name="next" />
      </button>
    </section>
    <section class="home__spirit" aria-label={`${tuning.characters[leader].name}'s idle spirit`}>
      <div class="stage-orbit" aria-hidden="true" />
      <Model character={leader} weapon={weapon} />
      <div class="spirit-caption"><h2>{tuning.characters[leader].name}</h2><p>Lv {characterLevel(tuning, account, leader).level} · {tuning.weapons[weapon].name}</p></div>
    </section>
    <section class="home__journey">
      <div class="journey-card">
        <h2>{describePlay(tuning, play)}</h2>
        <button type="button" class="team-summary" onClick={() => nav.go({ kind: "team" })}>{team.map((member) => <Portrait key={member} of={{ character: member }} />)}<span>{team.length} / 3 members<br /><small>Edit team <Icon name="next" /></small></span></button>
        {lock !== null && <p class="lock-message">{describeLock(tuning, lock)}</p>}
        <Cta disabled={lock !== null || store.busy.value} onClick={enter}>{store.busy.value ? "Preparing…" : "Start challenge"} <Icon name="next" /></Cta>
        <button type="button" class="text-button" onClick={() => { store.menuBriefing.value = false; nav.go({ kind: "quests", tab: play.kind === "tier" ? "hardcore" : tuning.quests[play.quest].line }) }}>Choose a challenge</button>
      </div>
      {next !== null && next.kind === "quest" && <button type="button" class="next-quest" onClick={() => {
        store.menuPlay.value = next
        store.menuBriefing.value = true
        nav.go({ kind: "quests", tab: "main" })
      }}><span class="eyebrow">Next quest</span><h3>{describePlay(tuning, next)}</h3><Icon name="next" /></button>}
      {next === null && <div class="next-quest"><span class="eyebrow">Main quests complete</span><h3>A new test awaits</h3><button type="button" class="text-button" onClick={() => nav.go({ kind: "quests", tab: "hardcore" })}>Explore Hardcore <Icon name="next" /></button></div>}
    </section>
  </div>
}
