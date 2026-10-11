/**
 * Google Play's feature graphic (1024x500), drawn from the game's own pieces:
 * the five element spirits (their renders, cut out in `spirits/`) and the
 * menu's element emblems. Open `/tools/store/` on the dev server and
 * screenshot the graphic at 1024x500 (see docs/mobile.md).
 */
import "@fontsource/alegreya-sans/800.css"
import { render } from "preact"

import type { ElementId } from "../../src/content/elements.ts"
import { EmblemIcon } from "../../src/ui/EmblemIcon.tsx"
import "./store.css"

/** The spirits from left to right, the wind spirit (the game's icon) in front, in the middle. */
const spirits: ReadonlyArray<{ readonly element: ElementId; readonly size: number; readonly x: number; readonly y: number }> = [
  { element: "fire", size: 160, x: 150, y: 290 },
  { element: "water", size: 185, x: 330, y: 278 },
  { element: "wind", size: 240, x: 512, y: 262 },
  { element: "thunder", size: 190, x: 694, y: 278 },
  { element: "rock", size: 170, x: 874, y: 290 }
]

/** Specks of light in the sky: x, y, and size. */
const motes = [[70, 60, 4], [180, 140, 3], [300, 50, 3], [760, 70, 4], [880, 150, 3], [960, 50, 3], [120, 420, 3], [930, 420, 4], [420, 130, 2], [620, 120, 2]] as const

const Graphic = () => <div class="graphic">
  {spirits.map((s) => <div key={`aura-${s.element}`} class="graphic__aura" data-element={s.element} style={{ left: `${s.x}px`, top: `${s.y}px` }} />)}
  <div class="graphic__ring" />
  <h1 class="graphic__title">Spirit Call</h1>
  {spirits.map((s) => <img key={s.element} class="graphic__spirit" data-element={s.element} src={new URL(`./spirits/${s.element}.png`, import.meta.url).href} alt=""
    style={{ left: `${s.x}px`, top: `${s.y}px`, width: `${s.size}px`, height: `${s.size}px`, zIndex: s.element === "wind" ? 3 : s.size > 190 ? 2 : 1 }} />)}
  {spirits.map((s) => <div key={`emblem-${s.element}`} class="graphic__emblem" data-element={s.element} style={{ left: `${s.x}px`, top: `${s.y + s.size / 2 + 34}px` }}><EmblemIcon kind={s.element} /></div>)}
  {motes.map(([x, y, r], i) => <i key={i} class="graphic__mote" style={{ left: `${x}px`, top: `${y}px`, width: `${r}px`, height: `${r}px` }} />)}
</div>

render(<Graphic />, document.getElementById("app")!)
