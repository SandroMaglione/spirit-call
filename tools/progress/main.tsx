/**
 * The progress report: a new account's journey through the game, from the
 * game's own numbers and rules, with the numbers editable on the page.
 * Dev server only (http://localhost:5199/tools/progress/); never built.
 */
import { render } from "preact"
import { useMemo, useState } from "preact/hooks"
import { defaultTuning } from "../../src/config/tuning.ts"
import type { Tuning } from "../../src/config/tuning.ts"
import type { CharacterId } from "../../src/content/characters.ts"
import { elements } from "../../src/content/elements.ts"
import type { ElementId } from "../../src/content/elements.ts"
import { validateContent } from "../../src/content/validate.ts"
import { levelScale, statsAtLevel } from "../../src/features/build.ts"
import { Bars, Chart } from "./chart.tsx"
import type { Bar, Marker, Point, Series } from "./chart.tsx"
import { journeyOf, sourceNames, sources } from "./journey.ts"
import type { Journey, Moment } from "./journey.ts"
import { defaultPlay, knobs, playing, tuningFor } from "./knobs.ts"
import type { PlayOptions, Skill, Values } from "./knobs.ts"
import "./progress.css"

const farmFlag = 12
const elementOrder: ReadonlyArray<ElementId> = ["water", "fire", "wind", "rock", "thunder"]
const elementColor = (element: ElementId) => `var(--el-${element})`
const sourceColor = (index: number) => `var(--s${index + 1})`
const rankColor = (rank: number) => `var(--rank${Math.min(rank, 3)})`

const compact = (value: number): string =>
  Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M` : Math.abs(value) >= 1e4 ? `${Math.round(value / 1e3)}k` : Math.abs(value) >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : `${Math.round(value * 100) / 100}`
const hours = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)} h`

/** The knob values and play options in the address, so a reload or a shared link keeps them. */
const fromHash = (): { values: Values; play: PlayOptions } => {
  try {
    const saved = JSON.parse(decodeURIComponent(location.hash.slice(1))) as { values?: Values; play?: Partial<PlayOptions> }
    return { values: saved.values ?? {}, play: { ...defaultPlay, ...saved.play } }
  } catch {
    return { values: {}, play: defaultPlay }
  }
}

const teamAverage = (moment: Moment): number => {
  const levels = Object.values(moment.levels).slice(0, 3)
  return levels.reduce((sum, level) => sum + (level ?? 0), 0) / Math.max(1, levels.length)
}

const questLabel = (tuning: Tuning, quest: keyof Tuning["quests"], rank: number) => `${tuning.quests[quest].name}${rank > 1 ? ` · rank ${rank}` : ""}`

const Delta = (props: { readonly now: number; readonly shipped: number; readonly format: (value: number) => string; readonly lowerIsBetter?: boolean }) => {
  const change = props.now - props.shipped
  if (Math.abs(change) < 1e-9) return <span class="delta same">same as shipped</span>
  return <span class="delta">{change > 0 ? "▲" : "▼"} {props.format(Math.abs(change))} vs shipped {props.format(props.shipped)}</span>
}

const Tile = (props: { readonly label: string; readonly value: string; readonly sub?: string; readonly now: number; readonly shipped: number; readonly format: (value: number) => string }) => (
  <div class="tile">
    <div class="tile-label">{props.label}</div>
    <div class="tile-value">{props.value}</div>
    {props.sub === undefined ? null : <div class="tile-sub">{props.sub}</div>}
    <Delta now={props.now} shipped={props.shipped} format={props.format} />
  </div>
)

const summary = (journey: Journey) => {
  const last = journey.moments.at(-1)
  const sum = (by: Record<string, number> | undefined) => Object.values(by ?? {}).reduce((total, value) => total + value, 0)
  return {
    runs: journey.runs,
    hours: journey.hours,
    // When the last thing of the collection came.
    collected: journey.moments.find((moment) => moment.owned >= journey.collection)?.hours ?? null,
    farmed: journey.rows.reduce((total, row) => total + row.farmed, 0),
    gold: sum(last?.gold),
    walls: journey.rows.filter((row) => row.walls.length > 0).length,
    heavy: journey.rows.filter((row) => row.farmed >= farmFlag).length
  }
}

const PlayNumber = (props: { readonly label: string; readonly help: string; readonly value: number; readonly shipped: number; readonly step: number; readonly min: number; readonly max?: number; readonly set: (value: number) => void }) => (
  <label class={props.value !== props.shipped ? "knob changed" : "knob"} title={props.help}>
    <span class="knob-label">{props.label}</span>
    <input type="number" min={props.min} max={props.max} step={props.step} value={props.value} onInput={(event) => {
      const input = event.currentTarget as HTMLInputElement, value = Number(input.value)
      if (input.value !== "" && Number.isFinite(value) && value >= props.min && (props.max === undefined || value <= props.max)) props.set(value)
    }} />
    <span class="knob-default">shipped {props.shipped}</span>
  </label>
)

/** How a player plays: levels under the enemies she goes in at, and the runs she loses. */
const SkillNumbers = (props: { readonly skill: Skill; readonly shipped: Skill; readonly set: (skill: Skill) => void }) => (
  <>
    <PlayNumber label="Levels under the enemies" help="How many levels below a quest's enemies the team goes in (and in hardcore); negative waits until it is above them." value={props.skill.levelsAhead} shipped={props.shipped.levelsAhead} step={1} min={-20}
      set={(levelsAhead) => props.set({ levelsAhead, lost: props.skill.lost })} />
    <PlayNumber label="Runs lost (%)" help="The share of runs lost, each paying half its gold for getting half-way." value={Math.round(props.skill.lost * 100)} shipped={Math.round(props.shipped.lost * 100)} step={5} min={0} max={90}
      set={(lost) => props.set({ levelsAhead: props.skill.levelsAhead, lost: lost / 100 })} />
  </>
)

const Sidebar = (props: { readonly values: Values; readonly play: PlayOptions; readonly setValues: (values: Values) => void; readonly setPlay: (play: PlayOptions) => void; readonly patch: object }) => {
  const groups = [...new Set(knobs.map((knob) => knob.group))]
  const [copied, setCopied] = useState(false)
  const patchText = JSON.stringify(props.patch, null, 2)
  const changed = Object.keys(props.values).length > 0 || JSON.stringify(props.play) !== JSON.stringify(defaultPlay)
  return (
    <aside class="sidebar">
      <div class="sidebar-head">
        <h2>Numbers</h2>
        <button type="button" disabled={!changed} onClick={() => { props.setValues({}); props.setPlay(defaultPlay) }}>Reset all</button>
      </div>
      <section>
        <h4>Player</h4>
        <PlayNumber label="Minutes a run" help="How long a run takes with its menus: turns runs into hours played." value={props.play.minutesPerRun} shipped={defaultPlay.minutesPerRun} step={0.5} min={0.5}
          set={(value) => props.setPlay({ ...props.play, minutesPerRun: value })} />
        <SkillNumbers skill={props.play} shipped={defaultPlay} set={(skill) => props.setPlay({ ...props.play, ...skill })} />
      </section>
      <section>
        <h4>Range: skilled player</h4>
        <SkillNumbers skill={props.play.skilled} shipped={defaultPlay.skilled} set={(skilled) => props.setPlay({ ...props.play, skilled })} />
      </section>
      <section>
        <h4>Range: struggling player</h4>
        <SkillNumbers skill={props.play.struggling} shipped={defaultPlay.struggling} set={(struggling) => props.setPlay({ ...props.play, struggling })} />
      </section>
      {groups.map((group) => (
        <section>
          <h4>{group}</h4>
          {knobs.filter((knob) => knob.group === group).map((knob) => {
            const shipped = knob.read(defaultTuning)
            const value = props.values[knob.id] ?? shipped
            return (
              <label class={value !== shipped ? "knob changed" : "knob"} title={knob.help}>
                <span class="knob-label">{knob.label}</span>
                <input type="number" min={knob.min} step={knob.step} value={value} onInput={(event) => {
                  const next = Number((event.currentTarget as HTMLInputElement).value)
                  if (!Number.isFinite(next) || next < knob.min || (event.currentTarget as HTMLInputElement).value === "") return
                  const { [knob.id]: _, ...rest } = props.values
                  props.setValues(next === shipped ? rest : { ...rest, [knob.id]: next })
                }} />
                <span class="knob-default">
                  shipped {shipped}
                  {value !== shipped ? <button type="button" class="link" onClick={(event) => {
                    event.preventDefault()
                    const { [knob.id]: _, ...rest } = props.values
                    props.setValues(rest)
                  }}>reset</button> : null}
                </span>
              </label>
            )
          })}
        </section>
      ))}
      <section>
        <h4>Patch</h4>
        <p class="hint">The changed numbers as a tuning patch (for <code>pnpm balance --tuning</code>). Nothing here edits content.</p>
        <button type="button" disabled={patchText === "{}"} onClick={() => {
          void navigator.clipboard?.writeText(patchText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
        }}>{copied ? "Copied" : "Copy patch"}</button>
        <pre class="patch">{patchText}</pre>
      </section>
    </aside>
  )
}

const App = () => {
  const initial = useMemo(fromHash, [])
  const [values, setValuesState] = useState<Values>(initial.values)
  const [play, setPlayState] = useState<PlayOptions>(initial.play)
  const save = (next: { values: Values; play: PlayOptions }) => {
    const empty = Object.keys(next.values).length === 0 && JSON.stringify(next.play) === JSON.stringify(defaultPlay)
    history.replaceState(null, "", empty ? location.pathname : `#${encodeURIComponent(JSON.stringify(next))}`)
  }
  const setValues = (next: Values) => { setValuesState(next); save({ values: next, play }) }
  const setPlay = (next: PlayOptions) => { setPlayState(next); save({ values, play: next }) }

  const shipped = useMemo(() => journeyOf(defaultTuning, defaultPlay), [])
  const { patch, tuning } = useMemo(() => tuningFor(values), [values])
  const journey = useMemo(() => journeyOf(tuning, play), [tuning, play])
  const skilled = useMemo(() => journeyOf(tuning, playing(play, play.skilled)), [tuning, play])
  const struggling = useMemo(() => journeyOf(tuning, playing(play, play.struggling)), [tuning, play])
  const range = (of: Journey) => new Map(of.rows.map((row) => [`${row.quest}@${row.rank}`, of.hoursAt(row.runs)]))
  const skilledAt = range(skilled), strugglingAt = range(struggling)
  /** Main quests cleared (every rank) by hours played. */
  const progress = (of: Journey): ReadonlyArray<Point> => [[0, 0], ...of.rows.map((row, index): Point => [of.hoursAt(row.runs), index + 1])]
  const problems = useMemo(() => (Object.keys(values).length === 0 ? [] : validateContent(tuning)), [tuning, values])
  const now = summary(journey), before = summary(shipped)
  const rankDone: ReadonlyArray<Marker> = Array.from({ length: tuning.ranks.count }, (_, index) => journey.rows.findLast((row) => row.rank === index + 1))
    .flatMap((row, index) => (row === undefined ? [] : [{ x: journey.hoursAt(row.runs), label: `rank ${index + 1} done` }]))
  const characters = journey.arrivals.map((arrival) => arrival.character)
  const levelLines: ReadonlyArray<Series> = [
    ...characters.map((character: CharacterId): Series => ({
      id: character,
      label: tuning.characters[character].name,
      color: elementColor(tuning.characters[character].element),
      step: true,
      points: journey.moments.flatMap((moment): Array<Point> => (moment.levels[character] === undefined ? [] : [[moment.hours, moment.levels[character]]]))
    })),
    { id: "enemies", label: "Quest enemies", color: "var(--ink-2)", dashed: true, step: true, points: journey.rows.map((row): Point => [journey.hoursAt(row.runs - 1), row.enemyLevel]) }
  ]
  const totalOf = (by: Record<string, number>) => Object.values(by).reduce((sum, value) => sum + value, 0)
  const stackOf = (pick: (moment: Moment) => Record<string, number>): ReadonlyArray<Series> =>
    sources.map((source, index) => ({ id: source, label: sourceNames[source], color: sourceColor(index), points: journey.moments.map((moment): Point => [moment.hours, pick(moment)[source] ?? 0]) }))
      .filter((series) => series.points.some(([, y]) => y > 0))
  const strength = (each: Tuning): ReadonlyArray<Point> =>
    Array.from({ length: each.progression.character.curve.maxLevel }, (_, index): Point => [index + 1, levelScale(each.progression.stats, index + 1)])
  const shippedRows = new Map(shipped.rows.map((row) => [`${row.quest}@${row.rank}`, row]))
  const bars: ReadonlyArray<Bar> = journey.rows.map((row) => {
    const old = shippedRows.get(`${row.quest}@${row.rank}`)
    return {
      key: `${row.quest}@${row.rank}`,
      value: row.farmed,
      ghost: old?.farmed ?? null,
      color: rankColor(row.rank),
      tooltip: [
        `${questLabel(tuning, row.quest, row.rank)} (enemy level ${row.enemyLevel})`,
        `${row.trial} of them in a trial, for essences`,
        `Team entering: ${row.team.map((member) => `${tuning.characters[member.character].name} ${member.level}`).join(", ")}`,
        `Cleared at ${hours(journey.hoursAt(row.runs))} played${row.walls.length > 0 ? ` · waited with no trial: ${row.walls.map((id) => tuning.characters[id].name).join(", ")}` : ""}`
      ]
    }
  })
  const firstOfRank: ReadonlyArray<Marker> = Array.from({ length: tuning.ranks.count }, (_, index) => journey.rows.findIndex((row) => row.rank === index + 1))
    .flatMap((at, index) => (at <= 0 ? [] : [{ x: at, label: `rank ${index + 1} →` }]))

  return (
    <div class="viz-root">
      <Sidebar values={values} play={play} setValues={setValues} setPlay={setPlay} patch={patch} />
      <main>
        <header>
          <h1>Player journey</h1>
          <p>
            A new account played through the game's own account rules (<code>test/progression-model.ts</code>): every quest at every rank as it opens, the
            team trained evenly with all its gold, farming the best quest (or a trial, for essences) until the team's average level reaches the next quest's
            enemies, then every audition and track tier, then levels until all ten are at the top. Change a number on the left; gray dashed lines are the shipped numbers.
          </p>
          {problems.length === 0 ? null : (
            <div class="problems">
              <strong>These numbers break content rules (validateContent):</strong>
              <ul>{problems.slice(0, 6).map((problem) => <li>{problem}</li>)}</ul>
            </div>
          )}
        </header>
        <div class="tiles">
          <Tile label="Everything owned" value={now.collected === null ? "never" : hours(now.collected)} sub={`target about 55 h · skilled ${summary(skilled).collected === null ? "never" : hours(summary(skilled).collected!)} – struggling ${summary(struggling).collected === null ? "never" : hours(summary(struggling).collected!)}`} now={now.collected ?? 0} shipped={before.collected ?? 0} format={hours} />
          <Tile label="All ten at the top" value={hours(now.hours)} sub={`target about 100 h · skilled ${hours(skilled.hours)} – struggling ${hours(struggling.hours)} · ${now.runs} runs`} now={now.hours} shipped={before.hours} format={hours} />
          <Tile label="Runs farming" value={`${now.farmed}`} sub={`${Math.round((now.farmed / Math.max(1, now.runs)) * 100)}% of all runs`} now={now.farmed} shipped={before.farmed} format={(value) => `${Math.round(value)}`} />
          <Tile label="Gold earned" value={compact(now.gold)} now={now.gold} shipped={before.gold} format={compact} />
          <Tile label="Quests with heavy farming" value={`${now.heavy}`} sub={`${farmFlag}+ runs before them · ${now.walls} with a wall`} now={now.heavy} shipped={before.heavy} format={(value) => `${Math.round(value)}`} />
        </div>
        <div class="charts">
          <Chart
            title="Main quests cleared"
            note={`Main quests cleared, every rank counted, by hours played: the line's player, and the range from a skilled one (${play.skilled.levelsAhead} levels under the enemies, ${Math.round(play.skilled.lost * 100)}% lost) to a struggling one (${play.struggling.levelsAhead} levels under, ${Math.round(play.struggling.lost * 100)}% lost).`}
            lines={[
              { id: "skilled", label: "Skilled", color: "var(--s1)", dashed: true, step: true, points: progress(skilled) },
              { id: "line", label: "The line", color: "var(--ink-1)", step: true, points: progress(journey) },
              { id: "struggling", label: "Struggling", color: "var(--s2)", dashed: true, step: true, points: progress(struggling) }
            ]}
            band={{ from: progress(skilled), to: progress(struggling), color: "var(--s1)" }}
            ghosts={[{ id: "shipped", label: "The line (shipped)", color: "var(--ghost)", step: true, points: progress(shipped) }]}
            markers={rankDone}
            xTitle={`Hours played, at ${play.minutesPerRun} minutes a run`}
            formatX={hours}
            formatY={(value) => `${Math.round(value)}`}
            extra={(x) => {
              const row = journey.rows.findLast((each) => journey.hoursAt(each.runs) <= x + 1e-9)
              return row === undefined ? null : `The line's last: ${questLabel(tuning, row.quest, row.rank)}`
            }}
          />
          <Chart
            title="Character levels"
            note="Each character's level as she is trained, against the enemy level of the main quest she enters next."
            lines={levelLines}
            ghosts={[{ id: "shipped", label: "Team average (shipped)", color: "var(--ghost)", step: true, points: shipped.moments.map((moment): Point => [moment.hours, teamAverage(moment)]) }]}
            markers={rankDone}
            xTitle={`Hours played, at ${play.minutesPerRun} minutes a run`}
            formatX={hours}
            formatY={(value) => `${Math.round(value)}`}
          />
          <Bars
            title="Farming before each main quest"
            note="Runs played to get ready for each main quest, in the order played. The gray cap is the shipped numbers."
            bars={bars}
            legend={Array.from({ length: tuning.ranks.count }, (_, index) => ({ label: `Rank ${index + 1}`, color: rankColor(index + 1) }))}
            groups={firstOfRank}
            formatY={(value) => `${Math.round(value)}`}
          />
          <Chart
            title="Gold earned, by source"
            note="Gold earned so far, stacked by where it came from, and what training and ascending spent."
            stack={stackOf((moment) => moment.gold)}
            lines={[{ id: "spent", label: "Spent", color: "var(--ink-1)", dashed: true, points: journey.moments.map((moment): Point => [moment.hours, moment.goldSpent]) }]}
            ghosts={[{ id: "shipped", label: "Earned (shipped)", color: "var(--ghost)", points: shipped.moments.map((moment): Point => [moment.hours, totalOf(moment.gold)]) }]}
            markers={rankDone}
            xTitle={`Hours played, at ${play.minutesPerRun} minutes a run`}
            formatX={hours}
            formatY={compact}
          />
          <Chart
            title="The collection"
            note={`How many of the ${journey.collection} things to own (characters, aspects, relics and their tiers, looks) are owned, by hours played.`}
            lines={[
              { id: "skilled", label: "Skilled", color: "var(--s1)", dashed: true, step: true, points: skilled.moments.map((moment): Point => [moment.hours, moment.owned]) },
              { id: "line", label: "The line", color: "var(--ink-1)", step: true, points: journey.moments.map((moment): Point => [moment.hours, moment.owned]) },
              { id: "struggling", label: "Struggling", color: "var(--s2)", dashed: true, step: true, points: struggling.moments.map((moment): Point => [moment.hours, moment.owned]) }
            ]}
            ghosts={[{ id: "shipped", label: "The line (shipped)", color: "var(--ghost)", step: true, points: shipped.moments.map((moment): Point => [moment.hours, moment.owned]) }]}
            markers={rankDone}
            xTitle={`Hours played, at ${play.minutesPerRun} minutes a run`}
            formatX={hours}
            formatY={(value) => `${Math.round(value)}`}
          />
          <Chart
            title="Essences earned, by element"
            note={`Ascension materials earned so far. Steps cost ${tuning.materialRules.ascension.map((step) => `${compact(step.count)} at ${step.level}`).join(", ")}.`}
            lines={[
              ...elementOrder.map((element): Series => ({ id: element, label: elements[element].name, color: elementColor(element), points: journey.moments.map((moment): Point => [moment.hours, moment.essences[element] ?? 0]) })),
              { id: "refined", label: "Refined", color: "var(--ink-2)", dashed: true, points: journey.moments.map((moment): Point => [moment.hours, moment.essences["refined"] ?? 0]) },
              { id: "core", label: "Core", color: "var(--ink-1)", dashed: true, points: journey.moments.map((moment): Point => [moment.hours, moment.essences["core"] ?? 0]) }
            ]}
            markers={rankDone}
            xTitle={`Hours played, at ${play.minutesPerRun} minutes a run`}
            formatX={hours}
            formatY={compact}
          />
          <Chart
            title="Strength by level"
            note="How many times stronger than level 1 a character (or an enemy) is: HP, ATK, and DEF all follow it."
            lines={[{ id: "strength", label: "Strength", color: "var(--s1)", points: strength(tuning) }]}
            ghosts={[{ id: "shipped", label: "Shipped", color: "var(--ghost)", points: strength(defaultTuning) }]}
            xTitle="Level"
            formatX={(value) => `${Math.round(value)}`}
            formatY={(value) => `${value.toFixed(1)}×`}
            extra={(x) => {
              const stats = statsAtLevel(tuning, tuning.characters.swordsman.stats, Math.round(x))
              return `Swordsman: ${stats.hp} HP, ${stats.atk} ATK, ${stats.def} DEF`
            }}
          />
        </div>
        <section class="table-section">
          <h3>Main quests, in the order played</h3>
          <table>
            <thead>
              <tr><th>Quest</th><th>Chapter</th><th class="num">Enemies</th><th>Team entering</th><th class="num">Farmed (trial)</th><th class="num">Cleared at (played)</th><th class="num">Skilled – struggling</th><th class="num">Gold held after</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {journey.rows.map((row) => {
                const old = shippedRows.get(`${row.quest}@${row.rank}`)
                const chapter = tuning.quests[row.quest].chapter
                return (
                  <tr>
                    <td>{questLabel(tuning, row.quest, row.rank)}</td>
                    <td>{chapter === null ? "" : (tuning.chapters as Record<string, { name: string }>)[chapter]?.name.split(" · ")[0]}</td>
                    <td class="num">{row.enemyLevel}</td>
                    <td>{row.team.map((member) => `${tuning.characters[member.character].name} ${member.level}`).join(", ")}</td>
                    <td class="num">{row.farmed} ({row.trial}){old !== undefined && old.farmed !== row.farmed ? <span class="was"> was {old.farmed}</span> : null}</td>
                    <td class="num">{hours(journey.hoursAt(row.runs))}{old !== undefined && old.runs !== row.runs ? <span class="was"> was {hours(shipped.hoursAt(old.runs))}</span> : null}</td>
                    <td class="num">{hours(skilledAt.get(`${row.quest}@${row.rank}`) ?? 0)} – {hours(strugglingAt.get(`${row.quest}@${row.rank}`) ?? 0)}</td>
                    <td class="num">{compact(row.gold)}</td>
                    <td>{[row.farmed >= farmFlag ? "FARM" : "", row.walls.length > 0 ? `WALL ${row.walls.map((id) => tuning.characters[id].name).join(" ")}` : ""].filter(Boolean).join(" ")}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}

render(<App />, document.getElementById("app")!)
