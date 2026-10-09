import { useId } from "preact/hooks"
import type { ClassId } from "../content/classes.ts"
import type { SkillId } from "../content/skills.ts"

type AbilityKind = ClassId | SkillId | "dash"

/** Each silhouette describes a move: its direction, projectile, or area of effect. */
const shapes = {
  stoneGuard: "M16 2 21 6 20 12 12 12 11 6Z M5 16 10 19 9 26 3 28 1 21Z M27 16 31 21 29 28 23 26 22 19Z M16 14 21 17v5l-5 5-5-5v-5Z",
  stoneRise: "M1 28 3 17 7 13 11 28Z M10 28 12 9 17 3 22 28Z M21 28 24 15 28 18 31 28Z M1 30h30v2H1Z",
  blade: "M28 3C25 17 16 27 3 29 9 25 14 20 18 13 14 17 10 19 5 20 15 14 20 8 28 3Z",
  gun: "M5 22 23 4 28 4 28 9 10 27 4 28Z M4 13l9-9 2 2-9 9Z M17 28l9-9 2 2-9 9Z",
  disc: "M16 3A13 13 0 1 1 3 16 13 13 0 0 1 16 3ZM16 8A8 8 0 1 0 24 16 8 8 0 0 0 16 8ZM16 12l4 4-4 4-4-4Z",
  staff: "M25 2 30 7 27 12 22 14 18 10 20 5Z M20 12l-3 8-13 9 8-14Z M12 9 4 14l5-7Z",
  gauntlets: "M6 13V9a3 3 0 0 1 6 0V8a3 3 0 0 1 6 0v1a3 3 0 0 1 6 0v4h1a3 3 0 0 1 3 3v4a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8Z M10 21h10v2H10Z",
  dash: "M29 4C25 18 19 25 7 29 14 23 18 16 20 10L9 16Z M3 9h11l-3 3H1Z M2 18h8l-3 3H1Z",
  bladeWave: "M3 9C11 9 14 2 23 3 31 4 29 13 22 12 28 9 25 6 22 7 16 9 10 14 3 12Z M2 17C14 19 22 12 28 16 35 22 25 29 20 23 27 25 28 21 24 20 17 22 9 22 2 20Z M4 26h10l-4 3H4Z",
  flareJump: "M18 2 18 11 24 6 28 17 27 24 20 29 11 29 5 24 4 17 10 9 10 19 15 14Z M3 5h9L8 9H1Z M1 12h6l-3 3H1Z",
  tidalWave: "M2 27V21C7 22 9 17 9 12 9 5 18 0 26 5 32 9 30 18 22 18 28 13 24 8 20 11 18 14 23 20 29 21L29 28C24 29 22 24 18 26 12 30 9 25 5 27Z",
  cyclone: "M16 2C29 2 34 18 24 26 29 18 24 9 17 9 10 9 7 14 7 20 1 13 6 2 16 2Z M27 27C17 36 1 27 3 17 5 25 14 29 20 24 24 21 25 18 23 14 30 17 32 22 27 27Z M18 13c5 4 1 11-4 8-4-2-2-8 4-8Z",
  barrage: "M10 2 5 13l5-3 3-7Z M20 1 12 17l6-4 5-10Z M29 7 21 23l6-4 4-10Z M9 14l4 5-4 5-4-5Z M18 18l4 6-4 6-4-6Z M27 23l3 4-3 4-3-4Z",
  tide: "M16 2 24 13 25 19 22 24H10L7 19l1-6Z M2 20l3 2 1 5 5 3H5l-4-5Z M30 20l-3 2-1 5-5 3h6l4-5Z",
  sparkTotem: "M13 10h6v16l5 4H8l5-4Z M16 3l7 7-7 5-7-5Z M7 2 2 11h4l-2 7 7-10H7Z M27 3l-4 8h4l-2 6 6-9h-4Z",
  thunderclap: "M16 1 7 12h7l-2 10 12-14h-8Z M3 14l4 3-2 5 5 5-6-1-3-6Z M29 14l-4 3 2 5-5 5 6-1 3-6Z M13 25h6v2h-6Z M15 23h2v6h-2Z"
} satisfies Record<AbilityKind, string>

export const AbilityIcon = ({ kind, charged = false }: { readonly kind: AbilityKind; readonly charged?: boolean }) => {
  const id = useId()
  return <svg class="menu-icon ability-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffde8" /><stop offset=".45" stop-color="#f6deac" /><stop offset="1" stop-color="#bf955d" /></linearGradient></defs>
    {charged && <circle cx="16" cy="16" r="15" fill="none" stroke="#fff2c7" stroke-width="1" stroke-dasharray="5 3" />}
    <path d={shapes[kind]} fill={`url(#${id})`} fill-rule="evenodd" transform={charged ? "translate(4 4) scale(.75)" : undefined} />
    {charged && <path d="m26 1 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#fffde8" />}
  </svg>
}
