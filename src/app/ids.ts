/**
 * Random ids (a new account's). `crypto.randomUUID` only exists in secure
 * contexts (HTTPS or localhost), and the game is also opened over plain HTTP
 * on the local network (a phone on the dev server), so without it a
 * version-4 UUID is made from `crypto.getRandomValues`, which exists in both.
 */
export interface RandomSource {
  readonly randomUUID?: () => string
  readonly getRandomValues: <T extends Uint8Array<ArrayBuffer>>(array: T) => T
}

export const randomId = (source: RandomSource = crypto): string => {
  if (typeof source.randomUUID === "function") return source.randomUUID()
  const bytes = source.getRandomValues(new Uint8Array(16))
  // Version 4 (random) and the RFC 4122 variant.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
