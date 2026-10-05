import { useId } from "preact/hooks"
import type { ElementId } from "../content/elements.ts"

export type EmblemKind = ElementId | "xp"

const emblems = {
  xp: { shape: "M16 2 27 8 30 20 23 29H9L2 20 5 8Z", light: "#f0edff", middle: "#a9b7f3", dark: "#6263a9" },
  wind: { shape: "M3 8 14 3 29 7 22 12 11 11 18 16 29 15 23 23 12 29 14 21 4 18 10 14Z", light: "#e8fff2", middle: "#78e6c7", dark: "#278a88" },
  fire: { shape: "M17 2 18 10 23 6 27 14 28 21 23 28 16 31 7 28 3 21 5 13 11 8 11 15 15 12Z", light: "#fff2b9", middle: "#ffad63", dark: "#c95a49" },
  water: { shape: "M16 2 27 17 29 23 24 29 16 31 8 29 3 23 5 17Z", light: "#e5ffff", middle: "#81d9ff", dark: "#416abf" },
  thunder: { shape: "M18 1 4 18h10l-2 13L29 12H18Z", light: "#f7edff", middle: "#d5a4fa", dark: "#8062c2" }
} satisfies Record<EmblemKind, { readonly shape: string; readonly light: string; readonly middle: string; readonly dark: string }>

/** Filled silhouettes and light-catching facets remain readable at wallet size. */
export const EmblemIcon = ({ kind }: { readonly kind: EmblemKind }) => {
  const id = useId(), spec = emblems[kind]
  return <svg class={`menu-icon emblem-icon emblem-icon--${kind}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-surface`} x1="0" y1="0" x2="1" y2="1"><stop stop-color={spec.light} /><stop offset=".45" stop-color={spec.middle} /><stop offset="1" stop-color={spec.dark} /></linearGradient>
      <clipPath id={`${id}-shape`}><path d={spec.shape} /></clipPath>
    </defs>
    <path d={spec.shape} fill={`url(#${id}-surface)`} stroke={spec.light} stroke-width=".7" stroke-linejoin="round" />
    <g clip-path={`url(#${id}-shape)`}>
      <path d="M16 1 12 14 1 9Z" fill={spec.light} /><path d="m16 1 16 8-12 7Z" fill={spec.middle} />
      <path d="m12 14 4 18L1 23Z" fill={spec.dark} fill-opacity=".55" /><path d="m20 16 12 7-16 9Z" fill={spec.dark} />
      <path d="m12 14 8 2-4 16Z" fill={spec.light} fill-opacity=".6" />
      <path d="M1 9 12 14 20 16 32 9M12 14 16 32" fill="none" stroke={spec.light} stroke-opacity=".5" stroke-width=".5" />
      <path class="icon-sheen" d="M-12 0h5L22 32h-5Z" fill="#fff" />
    </g>
    {kind === "xp" && <><path d="m16 7 2 6 6 3-6 3-2 6-2-6-6-3 6-3Z" fill="#fff5d9" /><path d="m16 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#8286c5" /></>}
    <path class="icon-glint" d="m24 4 1.2 3.8L29 9l-3.8 1.2L24 14l-1.2-3.8L19 9l3.8-1.2Z" fill="#fffef2" />
  </svg>
}
