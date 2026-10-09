/**
 * Where the game's own art shows in the UI. The UI only marks the places
 * (`data-model`, `data-portrait`); the presentation draws into them (see
 * `presentation/showcase.ts`), so the UI never touches the renderer. Models
 * draw between the backdrop and the UI: anything of the UI over a model's
 * place covers it.
 */
import { useSignal } from "@preact/signals"
import { useRef } from "preact/hooks"

import type { CharacterId } from "../../content/characters.ts"
import type { CosmeticId } from "../../content/cosmetics.ts"
import type { EnemyKind } from "../../content/enemies.ts"
import { Icon } from "../Icon.tsx"

/**
 * Where a character's model stands, playing her idle, in the looks she
 * wears (`tint`: one tried on instead; `none`: her own colors). Its `--el`
 * (from a `data-element` around it) colours her rim light.
 */
export const Model = ({ character, turn, reveal, tint, class: className = "" }: { readonly character: CharacterId; readonly turn?: number; readonly reveal?: boolean; readonly tint?: string | undefined; readonly class?: string }) => (
  <div class={`model ${className}`} data-model={character} data-turn={turn} data-reveal={reveal ? "true" : undefined} data-tint={tint} />
)

/** A model the player can turn by dragging it; it fills its parent. This never sends input to the arena. */
export const ModelStage = ({ character, tint }: { readonly character: CharacterId; readonly tint?: string | undefined }) => {
  const turn = useSignal(-0.45), pulse = useSignal({ id: 0, x: 50, y: 50 })
  const drag = useRef<{ readonly pointer: number; readonly x: number; readonly turn: number } | null>(null)
  return <div class="model-stage">
    <Model character={character} turn={turn.value} tint={tint} />
    <button type="button" class="model-stage__touch" aria-label={`Rotate ${character}`}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        pulse.value = { id: pulse.value.id + 1, x: 100 * (event.clientX - rect.left) / rect.width, y: 100 * (event.clientY - rect.top) / rect.height }
        drag.current = { pointer: event.pointerId, x: event.clientX, turn: turn.value }
        if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => { if (drag.current?.pointer === event.pointerId) turn.value = drag.current.turn + (event.clientX - drag.current.x) * 0.012 }}
      onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} onLostPointerCapture={() => (drag.current = null)}
      onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) { event.preventDefault(); turn.value += event.key === "ArrowLeft" ? -0.35 : 0.35 } }}>
      {pulse.value.id > 0 && <span class="model-stage__ring" key={pulse.value.id} style={{ left: `${pulse.value.x}%`, top: `${pulse.value.y}%` }} />}
    </button>
  </div>
}

/** What a portrait shows: a character, an enemy kind, a look (a tint on her spirit, what a trail sheds), or what a character sheds on her own. */
export type PortraitOf = { readonly character: CharacterId } | { readonly enemy: EnemyKind } | { readonly look: CosmeticId } | { readonly trail: CharacterId }

/** A picture of a character, an enemy, or a look; it fills its parent (a card's art, a face). */
export const Portrait = ({ of }: { readonly of: PortraitOf }) => (
  <span class="portrait" data-portrait={"character" in of ? of.character : "enemy" in of ? `enemy:${of.enemy}` : "look" in of ? `look:${of.look}` : `trail:${of.trail}`} />
)

/** A round portrait on `tint`'s colours (an element's): a party member, a roster pick. `size` in units (38 when left out). */
export const Face = ({ of, tint, selected = false, locked = false, size }: { readonly of: PortraitOf; readonly tint?: string | undefined; readonly selected?: boolean; readonly locked?: boolean; readonly size?: number }) => (
  <span class={`face${selected ? " is-on" : ""}${locked ? " is-locked" : ""}`} data-tint={tint ?? ""} style={size === undefined ? undefined : { width: `${size}px`, height: `${size}px` }}>
    <Portrait of={of} />
    {locked && <span class="face__lock"><Icon name="lock" /></span>}
  </span>
)
