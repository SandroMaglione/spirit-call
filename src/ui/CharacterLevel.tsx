/**
 * The selected character's level: experience toward the next one (from
 * fighting with it), what the next level gives, and training to it with gold
 * (so a new or benched character can catch up).
 */
import { characterLevel, owns, train, trainingCost } from "../account/account.ts"
import type { CharacterId } from "../content/characters.ts"
import { statsAtLevel } from "../features/build.ts"
import { describeAmounts, statNames, statOrder } from "./describe.ts"
import type { UiActions, UiStore } from "./store.ts"

export const CharacterLevel = ({ store, actions, character }: { readonly store: UiStore; readonly actions: UiActions; readonly character: CharacterId }) => {
  const tuning = store.tuning.value
  const account = store.account.value
  if (!owns(account, { kind: "character", id: character })) return null
  const progress = characterLevel(tuning, account, character)
  const cost = trainingCost(tuning, account, character)
  const base = tuning.characters[character].stats
  const now = statsAtLevel(tuning, base, progress.level)
  const next = statsAtLevel(tuning, base, progress.level + 1)
  return (
    <div class="level">
      <span class="level__title">
        {tuning.characters[character].name} <b>Lv {progress.level}</b>
        {cost === null && <span class="level__max">max</span>}
      </span>
      {cost !== null && (
        <>
          <span class="level__track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.needed} aria-valuenow={progress.into}>
            <i style={{ width: `${(100 * progress.into) / progress.needed}%` }} />
          </span>
          <span class="level__numbers">
            {Math.floor(progress.into)} / {progress.needed} XP
          </span>
          <span class="level__next">
            Next:{" "}
            {statOrder
              .filter((stat) => next[stat] !== now[stat])
              .map((stat) => `${statNames[stat]} ${now[stat]} → ${next[stat]}`)
              .join(" · ")}
          </span>
          <button type="button" class="level__train" disabled={!train(tuning, account, character).ok} onClick={() => actions.train(character)}>
            Train to Lv {progress.level + 1} · {describeAmounts(tuning, cost)}
          </button>
        </>
      )}
    </div>
  )
}
