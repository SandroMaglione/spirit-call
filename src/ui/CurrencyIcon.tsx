import { useId } from "preact/hooks"
import type { CurrencyId } from "../content/currencies.ts"

/** The wallet, costs, and rewards use the same miniature currency artwork. */
export const CurrencyIcon = ({ currency }: { readonly currency: CurrencyId }) => {
  const id = useId()
  return <svg class={`menu-icon currency-icon currency-icon--${currency}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3c5" /><stop offset=".45" stop-color="#dfb560" /><stop offset="1" stop-color="#a77336" /></linearGradient>
      <linearGradient id={`${id}-gem`} x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e9ffff" /><stop offset=".5" stop-color="#8cdde9" /><stop offset="1" stop-color="#8f94d6" /></linearGradient>
      <radialGradient id={`${id}-dust`} cx=".5" cy=".5" r=".5"><stop stop-color="#fff6ff" /><stop offset=".55" stop-color="#d6a6ff" /><stop offset="1" stop-color="#7a5cc7" stop-opacity="0" /></radialGradient>
      <clipPath id={`${id}-shape`}>{currency === "gold" ? <circle cx="16" cy="16" r="12.5" /> : currency === "dust" ? <circle cx="16" cy="16" r="13" /> : <path d="m16 2 10 8 3 8-13 12L3 18l3-8Z" />}</clipPath>
    </defs>
    {currency === "dust" ? <>
      {/* A heap of glittering motes: what a relic turns into past its last tier. */}
      <circle cx="16" cy="17" r="12" fill={`url(#${id}-dust)`} />
      <path d="M6 24c3-5 7-7 10-7s7 2 10 7Z" fill="#b48ae8" stroke="#ecd9ff" stroke-width=".8" />
      <path d="M10 24c2-3 4-4 6-4s4 1 6 4Z" fill="#e6d0ff" />
      <path d="m16 5 1.6 4.4L22 11l-4.4 1.6L16 17l-1.6-4.4L10 11l4.4-1.6Z" fill="#fffaff" />
      <circle cx="9" cy="14" r="1.3" fill="#fbe9ff" />
      <circle cx="23.5" cy="15.5" r="1.1" fill="#fbe9ff" />
      <circle cx="12" cy="8" r=".9" fill="#fff" />
    </> : currency === "gold" ? <>
      <circle cx="16" cy="16" r="12.5" fill={`url(#${id}-gold)`} stroke="#f8d98c" stroke-width="1" />
      <circle cx="16" cy="16" r="9.5" fill="#b98b4430" stroke="#fff0af" stroke-width=".8" />
      <path d="m16 7 2.5 6.5L25 16l-6.5 2.5L16 25l-2.5-6.5L7 16l6.5-2.5Z" fill="#fff2ba" />
      <path d="m16 11 1.4 3.6L21 16l-3.6 1.4L16 21l-1.4-3.6L11 16l3.6-1.4Z" fill="#be8c42" />
      <path d="M6.5 11a11 11 0 0 1 12-6" fill="none" stroke="#fff9da" stroke-width="1.2" stroke-linecap="round" />
    </> : <>
      <path d="m16 2 10 8 3 8-13 12L3 18l3-8Z" fill={`url(#${id}-gem)`} stroke="#d7f8ff" stroke-width=".8" />
      <path d="m16 2 5 10-5 18-5-18Z" fill="#c9fbff" />
      <path d="m16 2-5 10-5-2Z" fill="#f2ffff" />
      <path d="m21 12 5-2 3 8-13 12Z" fill="#797dbd" fill-opacity=".6" />
      <path d="m11 12-8 6 13 12Z" fill="#62bbc9" />
      <path d="m11 12 5 18 5-18Z" fill="#e6fbff" fill-opacity=".6" />
      <path d="M6 10h20M3 18l8-6h10l8 6" fill="none" stroke="#e9ffff" stroke-width=".6" />
    </>}
    <g clip-path={`url(#${id}-shape)`}><path class="icon-sheen" d="M-12 0h5L22 32h-5Z" fill="#fff" /></g>
    <path class="icon-glint" d="m24 4 1.2 3.8L29 9l-3.8 1.2L24 14l-1.2-3.8L19 9l3.8-1.2Z" fill="#fffef2" />
  </svg>
}
