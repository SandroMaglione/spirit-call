/**
 * The report's charts: plain SVG, one y-axis each, a crosshair tooltip
 * on lines and areas, and a tooltip per bar. The shipped numbers are
 * drawn as gray dashed "ghosts" behind the edited ones.
 */
import { useRef, useState } from "preact/hooks"
import type { ComponentChildren } from "preact"

export type Point = readonly [number, number]

export interface Series {
  readonly id: string
  readonly label: string
  /** A CSS color (a variable of the page). */
  readonly color: string
  readonly points: ReadonlyArray<Point>
  readonly dashed?: boolean
  /** Holds its value until the next point (levels, quest steps). */
  readonly step?: boolean
}

export interface Marker {
  readonly x: number
  readonly label: string
}

const width = 640, height = 260
const margin = { left: 52, right: 104, top: 14, bottom: 34 }
const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom

/** Round tick positions from 0 to at least `max`. */
const ticks = (max: number, count = 5): ReadonlyArray<number> => {
  if (max <= 0) return [0, 1]
  const raw = max / count, power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((each) => each * power).find((each) => each >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, index) => index * step)
}

/** The value of `points` at `x`: the last point at or before it. */
export const valueAt = (points: ReadonlyArray<Point>, x: number): number | null => {
  let low = 0, high = points.length - 1, found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (points[middle]![0] <= x + 1e-9) {
      found = middle
      low = middle + 1
    } else high = middle - 1
  }
  return found < 0 ? null : points[found]![1]
}

const path = (points: ReadonlyArray<Point>, sx: (x: number) => number, sy: (y: number) => number, step = false) =>
  points.map(([x, y], index) => {
    const previous = points[index - 1]
    const corner = step && previous !== undefined ? `L${sx(x).toFixed(1)},${sy(previous[1]).toFixed(1)}` : ""
    return `${index === 0 ? "M" : corner + "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`
  }).join("")

/** `points` with a corner before each rise, as a step line draws them. */
const stepped = (points: ReadonlyArray<Point>): ReadonlyArray<Point> =>
  points.flatMap((point, index): Array<Point> => (index === 0 ? [point] : [[point[0], points[index - 1]![1]], point]))

/** Spreads labels wanted at `ys` at least `gap` apart, in order. */
const spread = (ys: ReadonlyArray<number>, gap = 13): ReadonlyArray<number> => {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y)
  for (let index = 1; index < order.length; index++) order[index]!.y = Math.max(order[index]!.y, order[index - 1]!.y + gap)
  const placed: Array<number> = []
  for (const each of order) placed[each.index] = Math.min(each.y, height - margin.bottom)
  return placed
}

export const Legend = (props: { readonly items: ReadonlyArray<{ readonly label: string; readonly color: string; readonly kind: "line" | "dashed" | "box" | "ghost" }> }) => (
  <div class="legend">
    {props.items.map((item) => (
      <span class="legend-item">
        <svg width="18" height="10" aria-hidden="true">
          {item.kind === "box"
            ? <rect x="2" y="0" width="14" height="10" rx="2" fill={item.color} />
            : <line x1="1" x2="17" y1="5" y2="5" stroke={item.kind === "ghost" ? "var(--ghost)" : item.color} stroke-width="2" stroke-dasharray={item.kind === "line" ? undefined : "4 3"} />}
        </svg>
        {item.label}
      </span>
    ))}
  </div>
)

export interface ChartProps {
  readonly title: string
  readonly note?: ComponentChildren
  /** Stacked areas sharing the same x positions, bottom first. */
  readonly stack?: ReadonlyArray<Series>
  readonly lines?: ReadonlyArray<Series>
  /** The shipped numbers, for comparison. */
  readonly ghosts?: ReadonlyArray<Series>
  /** A shaded range between two rising step lines (drawn as lines too). */
  readonly band?: { readonly from: ReadonlyArray<Point>; readonly to: ReadonlyArray<Point>; readonly color: string }
  readonly markers?: ReadonlyArray<Marker>
  readonly xTitle: string
  readonly formatX: (x: number) => string
  readonly formatY: (y: number) => string
  /** A last line for the tooltip at `x`. */
  readonly extra?: (x: number) => string | null
}

/** Lines and stacked areas over a shared x, with a crosshair tooltip. */
export const Chart = (props: ChartProps) => {
  const stack = props.stack ?? [], lines = props.lines ?? [], ghosts = props.ghosts ?? []
  // The stacked tops: each band sits on the ones below it.
  const tops: Array<ReadonlyArray<Point>> = []
  stack.forEach((series, index) => tops.push(series.points.map(([x, y], at) => [x, y + (index === 0 ? 0 : tops[index - 1]![at]![1])] as Point)))
  const all = [...tops, ...lines.map((each) => each.points), ...ghosts.map((each) => each.points), ...(props.band === undefined ? [] : [props.band.from, props.band.to])]
  const xMax = Math.max(1e-9, ...all.flatMap((points) => points.map(([x]) => x)))
  const yTicks = ticks(Math.max(...all.flatMap((points) => points.map(([, y]) => y)), 0))
  const xTicks = ticks(xMax, 6).filter((tick) => tick <= xMax * 1.0001)
  const yMax = yTicks.at(-1)!
  const sx = (x: number) => margin.left + (x / xMax) * plotWidth
  const sy = (y: number) => margin.top + plotHeight - (y / yMax) * plotHeight
  const xs = [...new Set([...stack, ...lines, ...ghosts].flatMap((series) => series.points.map(([x]) => x)))]

  const [hover, setHover] = useState<{ readonly x: number; readonly left: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const move = (event: PointerEvent) => {
    const box = (event.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect()
    const wanted = ((event.clientX - box.left) * (width / box.width) - margin.left) / plotWidth * xMax
    // Snap to the nearest point of the first series: readers aim at a moment, not a line.
    let x = wanted
    if (xs.length > 0) x = xs.reduce((best, each) => (Math.abs(each - wanted) < Math.abs(best - wanted) ? each : best), xs[0]!)
    setHover({ x, left: (sx(x) / width) * box.width })
  }

  const ends = [
    ...stack.map((series, index) => {
      const last = tops[index]!.at(-1), below = index === 0 ? 0 : tops[index - 1]!.at(-1)![1]
      return { series, y: last === undefined ? 0 : sy((last[1] + below) / 2), thick: last !== undefined && sy(below) - sy(last[1]) > 9 }
    }).filter((each) => each.thick),
    ...(lines.length <= 6 ? lines.map((series) => ({ series, y: sy(series.points.at(-1)?.[1] ?? 0), thick: true })) : [])
  ]
  const placed = spread(ends.map((each) => each.y))
  const rows = hover === null ? [] : [
    ...stack.toReversed().map((series) => ({ series, value: valueAt(series.points, hover.x) })),
    ...lines.map((series) => ({ series, value: valueAt(series.points, hover.x) }))
  ]
  const total = hover !== null && stack.length > 1 ? stack.reduce((sum, series) => sum + (valueAt(series.points, hover.x) ?? 0), 0) : null

  return (
    <figure class="chart">
      <figcaption>
        <h3>{props.title}</h3>
        {props.note === undefined ? null : <p>{props.note}</p>}
      </figcaption>
      <Legend items={[
        ...stack.map((series) => ({ label: series.label, color: series.color, kind: "box" as const })),
        ...lines.map((series) => ({ label: series.label, color: series.color, kind: series.dashed === true ? "dashed" as const : "line" as const })),
        ...ghosts.map((series) => ({ label: series.label, color: series.color, kind: "ghost" as const }))
      ]} />
      <div class="frame" ref={frame}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={props.title}>
          {yTicks.map((tick) => (
            <g>
              <line class="grid" x1={margin.left} x2={margin.left + plotWidth} y1={sy(tick)} y2={sy(tick)} />
              <text class="tick" x={margin.left - 6} y={sy(tick) + 4} text-anchor="end">{props.formatY(tick)}</text>
            </g>
          ))}
          {xTicks.map((tick) => <text class="tick" x={sx(tick)} y={height - margin.bottom + 16} text-anchor="middle">{props.formatX(tick)}</text>)}
          <text class="axis-title" x={margin.left + plotWidth / 2} y={height - 3} text-anchor="middle">{props.xTitle}</text>
          {(props.markers ?? []).map((marker) => (
            <g>
              <line class="marker" x1={sx(marker.x)} x2={sx(marker.x)} y1={margin.top} y2={margin.top + plotHeight} />
              <text class="marker-label" x={sx(marker.x) - 4} y={margin.top + 10} text-anchor="end">{marker.label}</text>
            </g>
          ))}
          {stack.map((series, index) => {
            const top = tops[index]!, bottom = index === 0 ? top.map(([x]) => [x, 0] as Point) : tops[index - 1]!
            const area = `${path(top, sx, sy)}L${bottom.toReversed().map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("L")}Z`
            return <path d={area} fill={series.color} class="band" />
          })}
          {props.band === undefined ? null : (
            <path class="range" fill={props.band.color} d={`${path(props.band.from, sx, sy, true)}L${stepped(props.band.to).toReversed().map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("L")}Z`} />
          )}
          {ghosts.map((series) => <path d={path(series.points, sx, sy, series.step)} class="ghost" />)}
          {lines.map((series) => <path d={path(series.points, sx, sy, series.step)} fill="none" stroke={series.color} stroke-width="2" stroke-dasharray={series.dashed === true ? "5 4" : undefined} stroke-linejoin="round" />)}
          <line class="baseline" x1={margin.left} x2={margin.left + plotWidth} y1={sy(0)} y2={sy(0)} />
          {ends.map((each, index) => (
            <g>
              <line x1={margin.left + plotWidth + 4} x2={margin.left + plotWidth + 12} y1={placed[index]!} y2={placed[index]!} stroke={each.series.color} stroke-width="2" />
              <text class="end-label" x={margin.left + plotWidth + 15} y={placed[index]! + 4}>{each.series.label}</text>
            </g>
          ))}
          {hover === null ? null : <line class="crosshair" x1={sx(hover.x)} x2={sx(hover.x)} y1={margin.top} y2={margin.top + plotHeight} />}
          <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover === null ? null : (
          <div class="tooltip" style={{ left: `${hover.left}px`, transform: hover.left > (frame.current?.clientWidth ?? 0) * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
            <div class="tooltip-title">{props.formatX(hover.x)}</div>
            {total === null ? null : <div class="tooltip-row"><strong>{props.formatY(total)}</strong><span>in all</span></div>}
            {rows.map(({ series, value }) => (
              <div class="tooltip-row">
                <svg width="12" height="8" aria-hidden="true"><line x1="0" x2="12" y1="4" y2="4" stroke={series.color} stroke-width="2" /></svg>
                <strong>{value === null ? "–" : props.formatY(value)}</strong>
                <span>{series.label}</span>
              </div>
            ))}
            {ghosts.map((series) => {
              const value = valueAt(series.points, hover.x)
              return <div class="tooltip-row ghost-row"><strong>{value === null ? "–" : props.formatY(value)}</strong><span>{series.label}</span></div>
            })}
            {props.extra?.(hover.x) == null ? null : <div class="tooltip-extra">{props.extra(hover.x)}</div>}
          </div>
        )}
      </div>
    </figure>
  )
}

export interface Bar {
  readonly key: string
  readonly value: number
  readonly ghost: number | null
  readonly color: string
  readonly tooltip: ReadonlyArray<string>
}

/** One bar per entry, in order, with the shipped value as an outline. */
export const Bars = (props: { readonly title: string; readonly note?: ComponentChildren; readonly bars: ReadonlyArray<Bar>; readonly legend: ReadonlyArray<{ readonly label: string; readonly color: string }>; readonly groups: ReadonlyArray<Marker>; readonly formatY: (y: number) => string }) => {
  const yTicks = ticks(Math.max(1, ...props.bars.map((bar) => Math.max(bar.value, bar.ghost ?? 0))))
  const yMax = yTicks.at(-1)!
  const slot = plotWidth / Math.max(1, props.bars.length), barWidth = Math.max(2, slot - 2)
  const sy = (y: number) => margin.top + plotHeight - (y / yMax) * plotHeight
  const [hover, setHover] = useState<{ readonly index: number; readonly left: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const show = (index: number) => (event: PointerEvent) => {
    const box = (event.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect()
    setHover({ index, left: ((margin.left + slot * (index + 0.5)) / width) * box.width })
  }
  const hovered = hover === null ? undefined : props.bars[hover.index]
  return (
    <figure class="chart">
      <figcaption>
        <h3>{props.title}</h3>
        {props.note === undefined ? null : <p>{props.note}</p>}
      </figcaption>
      <Legend items={[...props.legend.map((item) => ({ ...item, kind: "box" as const })), { label: "Shipped numbers", color: "var(--ghost)", kind: "ghost" }]} />
      <div class="frame" ref={frame}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={props.title}>
          {yTicks.map((tick) => (
            <g>
              <line class="grid" x1={margin.left} x2={margin.left + plotWidth} y1={sy(tick)} y2={sy(tick)} />
              <text class="tick" x={margin.left - 6} y={sy(tick) + 4} text-anchor="end">{props.formatY(tick)}</text>
            </g>
          ))}
          {props.groups.map((group) => (
            <g>
              <line class="marker" x1={margin.left + slot * group.x} x2={margin.left + slot * group.x} y1={margin.top} y2={margin.top + plotHeight + 6} />
              <text class="tick" x={margin.left + slot * group.x + 3} y={height - margin.bottom + 16}>{group.label}</text>
            </g>
          ))}
          {props.bars.map((bar, index) => {
            const x = margin.left + slot * index + (slot - barWidth) / 2
            const top = sy(bar.value), radius = Math.min(4, barWidth / 2, sy(0) - top)
            return (
              <g class={hover?.index === index ? "bar hovered" : "bar"}>
                {bar.value > 0 ? <path fill={bar.color} d={`M${x},${sy(0)}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + barWidth - radius}Q${x + barWidth},${top} ${x + barWidth},${top + radius}V${sy(0)}Z`} /> : null}
                {bar.ghost !== null && bar.ghost > 0 ? <line class="ghost-cap" x1={x - 1} x2={x + barWidth + 1} y1={sy(bar.ghost)} y2={sy(bar.ghost)} /> : null}
                <rect x={margin.left + slot * index} y={margin.top} width={slot} height={plotHeight} fill="transparent" onPointerMove={show(index)} onPointerDown={show(index)} onPointerLeave={() => setHover(null)} />
              </g>
            )
          })}
          <line class="baseline" x1={margin.left} x2={margin.left + plotWidth} y1={sy(0)} y2={sy(0)} />
        </svg>
        {hovered === undefined || hover === null ? null : (
          <div class="tooltip" style={{ left: `${hover.left}px`, transform: hover.left > (frame.current?.clientWidth ?? 0) * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}>
            <div class="tooltip-title">{hovered.tooltip[0]}</div>
            <div class="tooltip-row"><strong>{props.formatY(hovered.value)}</strong><span>runs farmed before it</span></div>
            {hovered.ghost === null ? null : <div class="tooltip-row ghost-row"><strong>{props.formatY(hovered.ghost)}</strong><span>with shipped numbers</span></div>}
            {hovered.tooltip.slice(1).map((line) => <div class="tooltip-extra">{line}</div>)}
          </div>
        )}
      </div>
    </figure>
  )
}
