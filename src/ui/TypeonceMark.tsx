/**
 * The Typeonce Games mark, as the studio draws it for games: its 16 px pixel
 * grid (copied from the studio's brand package, `pixel-mark.ts`; `#` is a
 * filled pixel), drawn in the text's colour on whole pixels.
 */
const grid = [
  "....############",
  "..##############",
  ".##############.",
  ".#############..",
  "#######.........",
  "######..........",
  "#####...###.....",
  "####...####.....",
  ".###..#####.....",
  "..##..#####.....",
  "......#####.....",
  "......#####.....",
  "......#####.....",
  "......#####.....",
  "......####......",
  "......###.......",
]

/** One rectangle per run of filled pixels in a row. */
const path = grid.flatMap((row, y) => [...row.matchAll(/#+/g)].map((run) => `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`)).join("")

export const TypeonceMark = () => (
  <svg class="menu-icon typeonce-mark" viewBox="0 0 16 16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path d={path} /></svg>
)
