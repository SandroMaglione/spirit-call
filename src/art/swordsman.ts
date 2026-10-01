/**
 * The Swordsman: silver hair, a teal coat, and a long sword carried on the
 * back. Seen three-quarters from the front, turned to the screen's right.
 *
 * Two resolutions for the same on-screen size (about the body's height):
 * `swordsman` is 28 pixels tall at 1.5 screen pixels each, with close to
 * normal proportions (four heads tall); `swordsmanSmall` is 22 pixels tall
 * at 2 each, with a bigger head, like classic handheld RPG sprites.
 */
import { humanoid } from "./humanoid.ts"

export const swordsman = humanoid({
  name: "swordsman",
  width: 24,
  height: 32,
  anchor: { x: 11.5, y: 30 },
  pixelSize: 1.5,
  head: {
    x: 7,
    y: 2,
    front: [
      "..kkkkk..",
      ".khhwhHk.",
      "khhHhHHjk",
      "kHHsHsHjk",
      "kHsessejk",
      "kjssssSjk",
      ".kjsSSjk."
    ],
    back: [
      "..kkkkk..",
      ".khhwhHk.",
      "khhhhHHjk",
      "khHhHHjjk",
      "kHHjHjjJk",
      "kjHjjjJJk",
      ".kjjJJJk."
    ]
  },
  torso: {
    x: 4,
    y: 9,
    front: [
      "......kSk......",
      "....kkcgckk....",
      ".kkTTTcgcTTqqk.",
      ".ktkTTTcTTqkqk.",
      ".ktkTTTcTTqkqk.",
      ".ktkTTTcTqqkqk.",
      ".kTkbbbgbbbkQk.",
      ".ktkTTTqTTqkqk.",
      ".kskTTTkTTqksk.",
      "..k.kTqkTqk.k..",
      "....kqqkqqk....",
      "....kkkkkkk...."
    ],
    back: [
      "......kSk......",
      "....kkTTTkk....",
      ".kkTTTTTTTTqqk.",
      ".ktkTTTTTTqkqk.",
      ".ktkTTTTTTqkqk.",
      ".ktkTTTTTqqkqk.",
      ".kTkbbbbbbbkQk.",
      ".ktkTTTqTTqkqk.",
      ".kskTTTkTTqksk.",
      "..k.kTqkTqk.k..",
      "....kqqkqqk....",
      "....kkkkkkk...."
    ]
  },
  legs: {
    x: 4,
    y: 19,
    left: [
      "....knNk.......",
      "....knNk.......",
      "....knNk.......",
      "....knNk.......",
      "....knNk.......",
      "....knNk.......",
      "....knNk.......",
      "....kbBk.......",
      "....kbBk.......",
      "...kbbBk.......",
      "...kkkkk......."
    ],
    right: [
      ".......knNk....",
      ".......knNk....",
      ".......knNk....",
      ".......knNk....",
      ".......knNk....",
      ".......knNk....",
      ".......knNk....",
      ".......kbBk....",
      ".......kbBk....",
      ".......kbbBk...",
      ".......kkkkk..."
    ]
  },
  step: 2,
  sword: { front: { x: 3, y: 5, direction: 1, length: 14 }, back: { x: 19, y: 5, direction: -1, length: 15 } }
})

export const swordsmanSmall = humanoid({
  name: "swordsmanSmall",
  width: 16,
  height: 24,
  anchor: { x: 7.5, y: 23 },
  pixelSize: 2,
  head: {
    x: 3,
    y: 1,
    front: [
      "..kkkkk..",
      ".khhwhhk.",
      "khhhhHHjk",
      "khHhHHHjk",
      "kHsHsHsjk",
      "kHsessejk",
      "kjssssSjk",
      ".kkSSSkk."
    ],
    back: [
      "..kkkkk..",
      ".khhwhhk.",
      "khhhhHHjk",
      "khHhHHjjk",
      "kHHjHjjJk",
      "kjHjjjJJk",
      "kjjjJJJJk",
      ".kkJJJkk."
    ]
  },
  torso: {
    x: 1,
    y: 9,
    front: [
      "...kkcgckk...",
      ".kkTTcccTTqkk",
      ".ktkTTcTTqkqk",
      ".ktkbbgbbbkqk",
      ".kskTTqTTqksk",
      "..k.kqqkqqk.k"
    ],
    back: [
      "...kkTTTkk...",
      ".kkTTTTTTTqkk",
      ".ktkTTTTTqkqk",
      ".ktkbbbbbbkqk",
      ".kskTTqTTqksk",
      "..k.kqqkqqk.k"
    ]
  },
  legs: {
    x: 1,
    y: 15,
    left: [
      "...knNk......",
      "...knNk......",
      "...knNk......",
      "...knNk......",
      "...knNk......",
      "...kbBk......",
      "..kbbBk......",
      "..kkkkk......"
    ],
    right: [
      "......knNk...",
      "......knNk...",
      "......knNk...",
      "......knNk...",
      "......knNk...",
      "......kbBk...",
      "......kbbBk..",
      "......kkkkk.."
    ]
  },
  step: 1,
  sword: { front: { x: 0, y: 3, direction: 1, length: 11 }, back: { x: 15, y: 3, direction: -1, length: 13 } }
})
