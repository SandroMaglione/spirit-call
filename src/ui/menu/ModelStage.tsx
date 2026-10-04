import { useSignal } from "@preact/signals"
import { useRef } from "preact/hooks"
import type { CharacterId } from "../../content/characters.ts"
import type { WeaponId } from "../../content/weapons.ts"
import { Model } from "./parts.tsx"

/** Drag the preview itself to turn it; this never sends input to the arena. */
export const ModelStage = ({ character, weapon }: { readonly character: CharacterId; readonly weapon: WeaponId }) => {
  const turn = useSignal(-0.45), pulse = useSignal({ id: 0, x: 50, y: 50 })
  const drag = useRef<{ readonly pointer: number; readonly x: number; readonly turn: number } | null>(null)
  return <div class="model-stage">
    <Model character={character} weapon={weapon} turn={turn.value} />
    <button type="button" class="spirit-touch" aria-label={`Rotate ${character}`}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        pulse.value = { id: pulse.value.id + 1, x: 100 * (event.clientX - rect.left) / rect.width, y: 100 * (event.clientY - rect.top) / rect.height }
        drag.current = { pointer: event.pointerId, x: event.clientX, turn: turn.value }
        if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => { if (drag.current?.pointer === event.pointerId) turn.value = drag.current.turn + (event.clientX - drag.current.x) * 0.012 }}
      onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} onLostPointerCapture={() => (drag.current = null)}
      onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) { event.preventDefault(); turn.value += event.key === "ArrowLeft" ? -0.35 : 0.35 } }}>
      {pulse.value.id > 0 && <span class="touch-ring" key={pulse.value.id} style={{ left: `${pulse.value.x}%`, top: `${pulse.value.y}%` }} />}
    </button>
  </div>
}
