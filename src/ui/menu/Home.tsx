/**
 * The home screen: the team's leader on stage, the account's level and
 * wallet, the doors (quests, hardcore, the Extras), the team, and Play,
 * which enters what was picked last with the saved team in one tap.
 */
import { accountLevel, buildOf, characterLevel } from "../../account/account.ts"
import type { Play } from "../../account/account.ts"
import type { CharacterId } from "../../content/characters.ts"
import { resolveBuild } from "../../features/build.ts"
import { describePlay } from "../describe.ts"
import { elementOf } from "../draft.ts"
import type { UiStore } from "../store.ts"
import { Cta, ElementBadge, ids, Model, Portrait, Wallet } from "./parts.tsx"
import type { Nav } from "./parts.tsx"

export const Home = ({ store, nav, team, play, enter }: {
  readonly store: UiStore
  readonly nav: Nav
  readonly team: ReadonlyArray<CharacterId>
  readonly play: Play
  readonly enter: () => void
}) => {
  const tuning = store.tuning.value
  const account = store.account.value
  const leader = team[0]!
  const level = accountLevel(tuning, account)
  const maxed = level.needed === 0
  const weapon = resolveBuild(tuning, buildOf(tuning, account, leader)).weapon
  const mainQuests = ids(tuning.quests).filter((id) => tuning.quests[id].line === "main")
  const cleared = mainQuests.filter((id) => (account.quests[id]?.firstClearedAt ?? null) !== null).length
  const discoveries = ids(tuning.discoveries)
  const made = discoveries.filter((id) => account.discoveries[id] !== undefined).length
  return (
    <div class="screen home" data-element={elementOf(tuning, leader) ?? undefined}>
      <div class="home__account">
        <span class="home__level" title={maxed ? "Account level (max)" : `${Math.floor(level.into)} / ${level.needed} XP`}>
          {level.level}
        </span>
        <span class="home__xp" role="progressbar" aria-valuemin={0} aria-valuemax={maxed ? 1 : level.needed} aria-valuenow={maxed ? 1 : level.into}>
          <i style={{ width: `${maxed ? 100 : (100 * level.into) / level.needed}%` }} />
        </span>
      </div>
      <div class="home__top">
        <button type="button" class="home__discoveries" title="Discoveries" onClick={() => nav.go({ kind: "discoveries" })}>
          ✦ {made}/{discoveries.length}
        </button>
        <Wallet store={store} />
      </div>
      <button type="button" class="home__stage" aria-label={`${tuning.characters[leader].name}'s page`} onClick={() => nav.go({ kind: "character", character: leader, tab: "overview" })}>
        <Model character={leader} weapon={weapon} />
      </button>
      <div class="home__leader">
        <h1 class="home__name">{tuning.characters[leader].name}</h1>
        <span class="home__tag">
          <ElementBadge element={elementOf(tuning, leader)} />
          Lv {characterLevel(tuning, account, leader).level} · {tuning.weapons[weapon].name}
        </span>
        <button type="button" class="home__team" onClick={() => nav.go({ kind: "team" })}>
          {team.map((member) => (
            <span key={member} class="home__member" data-element={elementOf(tuning, member) ?? undefined}>
              <Portrait of={{ character: member }} />
            </span>
          ))}
          <span class="home__team-edit">Team ›</span>
        </button>
      </div>
      <nav class="home__doors">
        <button type="button" class="door" onClick={() => nav.go({ kind: "quests", tab: "main" })}>
          <b>Quests</b>
          <small>
            {cleared} / {mainQuests.length}
          </small>
        </button>
        <button type="button" class="door" onClick={() => nav.go({ kind: "quests", tab: "hardcore" })}>
          <b>Hardcore</b>
        </button>
        {/* Characters open from the leader on stage and from the team. */}
        <button type="button" class="door" onClick={() => nav.go({ kind: "extra", mode: "training" })}>
          <b>Extra</b>
          <small>Training</small>
        </button>
      </nav>
      <div class="home__play">
        <span class="home__next">{describePlay(tuning, play)}</span>
        <Cta onClick={enter}>Play</Cta>
      </div>
    </div>
  )
}
