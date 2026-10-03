/**
 * The difficulty lab: how hard each wave of each challenge is to survive
 * by dodging alone.
 *
 *   pnpm lab                 every challenge, at enemy level 1
 *   pnpm lab crossfire 30    one challenge, seconds per wave
 *
 * For every scripted wave, the dodging bot (see `test/bot.ts`) faces it for
 * a while, then a player who stands still does: hits per minute for each,
 * and the dashes dodging took. Nothing here fails: it is numbers to tune
 * against. A wave the bot cannot dodge cleanly asks for more than reading
 * telegraphs (or for a fix); a wave that barely touches a player standing
 * still asks for nothing.
 */
import { defaultTuning, tuningWith } from "../src/config/tuning.ts"
import type { ChallengeId } from "../src/content/challenges.ts"
import { runBot } from "../test/bot.ts"

const [only, secondsArgument] = process.argv.slice(2)
const seconds = Number(secondsArgument ?? 40)
const ids = (Object.keys(defaultTuning.challenges) as Array<ChallengeId>).filter((id) => only === undefined || id === only)

const perMinute = (hits: number) => ((hits * 60) / seconds).toFixed(1).padStart(6)

console.log(`Each wave for ${seconds} s. Hits per minute while dodging / standing still, dashes per minute while dodging, and pressure:`)
console.log("the share of the time something would hit a player standing still.\n")
for (const id of ids) {
  const challenge = defaultTuning.challenges[id]
  console.log(`${challenge.name} (${id})`)
  challenge.waves.scripted.forEach((wave, index) => {
    const tuning = tuningWith({ challenges: { [id]: { waves: { scripted: [wave], endless: null } } } })
    const dodging = runBot({ tuning, challenge: id, seconds })
    const still = runBot({ tuning, challenge: id, seconds, still: true })
    const pressure = `${Math.round(dodging.pressure * 100)}%`.padStart(4)
    console.log(`  wave ${index + 1}  dodging ${perMinute(dodging.hits)}  still ${perMinute(still.hits)}  dashes ${perMinute(dodging.dashes)}  pressure ${pressure}   ${wave.join(", ")}`)
  })
  console.log("")
}
