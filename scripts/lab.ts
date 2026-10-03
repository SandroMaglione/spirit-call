/**
 * The difficulty lab: how hard each wave of each challenge is to play.
 *
 *   pnpm lab                 every challenge, at enemy level 1
 *   pnpm lab crossfire 30    one challenge, at most this many seconds per wave
 *
 * For every scripted wave, the bot (see `test/bot.ts`) fights it with the
 * Swordsman until it is cleared: in close, swinging at whatever is in reach
 * while it dodges what it has noticed coming. Twice: as a quick player
 * (reacting to a telegraph after 0.25 s) and as one still learning (0.4 s,
 * fewer decisions). Reported: hits taken per minute, seconds to clear, and
 * for the quick player dashes per minute and pressure (the share of the
 * time something on screen would hit a player standing still). Nothing
 * here fails: it is numbers to tune against.
 */
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { ChallengeId } from "../src/content/challenges.ts"
import { fighter, learner, runBot } from "../test/bot.ts"

const [only, secondsArgument] = process.argv.slice(2)
const seconds = Number(secondsArgument ?? 60)
const ids = (Object.keys(defaultTuning.challenges) as Array<ChallengeId>).filter((id) => only === undefined || id === only)

const rate = (count: number, over: number) => ((count * 60) / over).toFixed(1).padStart(5)
const clear = (at: number | null) => (at === null ? "  -" : at.toFixed(0).padStart(3))

console.log("Per wave: quick player (hits/min, s to clear, dashes/min, pressure) | learning player (hits/min, s to clear).\n")
for (const id of ids) {
  const challenge = defaultTuning.challenges[id]
  console.log(`${challenge.name} (${id})`)
  challenge.waves.scripted.forEach((wave, index) => {
    const tuning = tuningWith({ challenges: { [id]: { waves: { scripted: [wave], endless: null } } } })
    const quick = runBot({ tuning, challenge: id, seconds, style: fighter })
    const slow = runBot({ tuning, challenge: id, seconds, style: learner })
    const pressure = `${Math.round(quick.pressure * 100)}%`.padStart(4)
    console.log(
      `  wave ${index + 1}  quick ${rate(quick.hits, quick.clearedAt ?? seconds)} ${clear(quick.clearedAt)} ${rate(quick.dashes, quick.clearedAt ?? seconds)} ${pressure}` +
        ` | learning ${rate(slow.hits, slow.clearedAt ?? seconds)} ${clear(slow.clearedAt)}   ${wave.map((entry) => (typeof entry === "string" ? entry : `${entry.elite} ${entry.kind}`)).join(", ")}`
    )
  })
  console.log("")
}
