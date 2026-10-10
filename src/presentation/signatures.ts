/**
 * Each skill's own look, drawn over what the simulation does (it changes
 * nothing): a skill is told apart by its shape as much as by its color, so
 * no two ultimates go off the same way. Gust's dive and the Cyclone set the
 * bar: the body leaves the floor, it comes in two beats (a rise, a slam),
 * something stands in the world a moment, and what it catches is seen to
 * move.
 *
 * - Flare Jump: a jet of fire thrown ahead as she kicks off an explosion,
 *   the floor scorched.
 * - Overdrive: fire bursting out around her as her gun flares up; then,
 *   while it lasts, her body lit with fire and its halo blazing (see
 *   `DrawPlayer`), a blaze at the muzzle and a spent casing with every
 *   shot, and each shot bursting in a quick, hard pop of fire (the
 *   Gunner's fire blows up; flames are Hearth's).
 * - Tidefall: she bounces in place like a drop of water, stretching up
 *   out of her puddle and splatting back down, wobbling, droplets thrown
 *   out, and the Tide's ring of water around her.
 * - Tidal Echo: her echo standing up out of a splash behind her,
 *   pale and see-through, walking after her and throwing as she does; a
 *   stream of drops to her as it heals, foam rising as it goes.
 * - Tide Dome: water welling up and closing over her; a dome of water
 *   standing over whoever is on the field, bands of light running up it.
 * - Riptide Bond: a chain of water whipping out to the toughest enemy and
 *   locking on; while it fights for her, water runs through its body (see
 *   `DrawEnemies`) and a thin chain holds it to the one on the field; the
 *   chain snapping as it goes back, a heavy splash on it.
 * - Spark Totem: lightning out of the sky planting it.
 * - Thunderclap: she rises, charging; a bolt strikes her as it goes off,
 *   then each enemy struck in turn, and a ring of crackling thunder.
 * - Spark Step: a crack of thunder as she goes, a tear of lightning where
 *   she ran with her afterimages, a scorched line crackling a while, and
 *   the enemies she passed popping a beat later.
 * - Overcharge: a bolt out of the sky into her and thunder bursting out;
 *   then, while it lasts, her body lit with thunder and its halo blazing
 *   (see `DrawPlayer`), lightning thrown out with each blow, and every
 *   dash a Spark Step of its own.
 * - Kindle: the floor glowing hot in a ring at its distance, heat bending
 *   the air over it (`Haze`), embers lifting off it.
 * - Wildfire: she rises on heat and comes down in a wave of it; then the
 *   pyre around her, the air over it bending, and what it burns streaming
 *   back into her as embers.
 * - Barriers (no shipped skill raises one now): walls of wind standing up
 *   off the floor, streaks running up them.
 *
 * Skills in `ownLook` are not drawn by the shared looks too (see
 * `presentation/effects.ts`).
 */
import { projection, view } from "../config/view.ts"
import { isMelee } from "../content/attacks.ts"
import type { CompanionsEffect, CutEffect, EmberRingEffect, SkillId } from "../content/skills.ts"
import { companionStart } from "../features/companions.ts"
import { toScreen } from "../math/iso.ts"
import { lerp, normalizeOr, sub } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Action, Barrier, Cast, Companion, Dome, Pyre, Hit, Overcharged, Overdriven, Explosion, Game, RenderNodes, Player, Position, Turned, PrevPosition, RenderClock, RenderHost, Tuning, UltimateCalled, Zap } from "../schema.ts"
import type { CastValue } from "../schema.ts"
import type { Fx } from "./fx.ts"
import type { Haze } from "./haze.ts"
import type { CompanionNode, FeedbackState } from "./host-types.ts"
import type { Shapes } from "./shapes.ts"

/** Skills drawn here alone: the shared looks (a nova's ring, a cut's streaks, a zap's bolt) leave them out. */
export const ownLook: ReadonlySet<SkillId> = new Set<SkillId>(["flareJump", "barrage", "tidalWave", "tide", "brace", "floodgate", "thunderclap", "sparkStep", "stormFlurry", "kindle", "wildfire", "faultLine", "landslide"])

/** Skills whose hits are seen in their own look alone: the flat shape of what they strike is not drawn too (see `presentation/telegraphs.ts`). */
export const unmarkedHits: ReadonlySet<SkillId> = new Set<SkillId>(["sparkStep", "stormFlurry", "faultLine", "landslide"])

const water = view.elements.water
const foam = 0xe8f6ff
const fire = view.elements.fire
const flame = view.ultimate
const thunder = view.elements.thunder
const white = view.hitFlash

// ── Drawing ───────────────────────────────────────────────────────────────

/** A floor point (world) as the overlay draws it, `lift` pixels up (at zoom 1). */
const at = (world: Vec2, lift = 0): Vec2 => {
  const point = toScreen(projection, world)
  return { x: point.x, y: point.y - lift * projection.zoom }
}
const z = (pixels: number): number => pixels * projection.zoom
const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const around = (center: Vec2, radius: number, angle: number): Vec2 => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
const easeOut = (t: number): number => 1 - (1 - t) ** 3
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t))
/** The same small wobble every frame for the same seed (cracks that hold still). */
const wobble = (seed: number): number => Math.sin(seed * 12.9898) * 0.5 + Math.sin(seed * 4.1414) * 0.5

/** A sheet standing on the floor from `a` to `b` (world), `height` pixels tall. */
const sheet = (g: Shapes, a: Vec2, b: Vec2, height: number, color: number, alpha: number): void => {
  const fa = at(a)
  const fb = at(b)
  const ta = at(a, height)
  const tb = at(b, height)
  g.fillPoly([fa.x, fa.y, fb.x, fb.y, tb.x, tb.y, ta.x, ta.y], color, alpha)
}

/** A wall standing in a ring of `radius` around `center` (world), `height` pixels tall, its top edge drawn in `edge`. */
const cylinder = (g: Shapes, center: Vec2, radius: number, height: number, color: number, alpha: number, edge: number, edgeAlpha: number, segments = 40): void => {
  for (let index = 0; index < segments; index++) {
    const a = around(center, radius, (index / segments) * Math.PI * 2)
    const b = around(center, radius, ((index + 1) / segments) * Math.PI * 2)
    sheet(g, a, b, height, color, alpha)
    const ta = at(a, height)
    const tb = at(b, height)
    g.line(ta.x, ta.y, tb.x, tb.y, z(4), edge, edgeAlpha)
  }
}

/** A body-shaped glow standing at `where` (world): her afterimage. */
const ghost = (g: Shapes, where: Vec2, color: number, alpha: number): void => {
  const foot = at(where)
  g.fillEllipse(foot.x, foot.y - z(20), z(10), z(22), color, alpha)
  g.fillEllipse(foot.x, foot.y - z(20), z(5), z(14), white, alpha)
}

/** The floor scorched within `radius` of `where` (world), fading over `life` seconds. */
const scorch = (fx: Fx, where: Vec2, radius: number, life = 1.2): void => {
  fx.animate(life, (t, g) => {
    const foot = at(where)
    g.fillEllipse(foot.x, foot.y, z(radius), z(radius) * projection.squash, 0x3a2620, 0.28 * (1 - t))
    g.fillEllipse(foot.x, foot.y, z(radius * 0.6), z(radius * 0.6) * projection.squash, 0x2a1c18, 0.2 * (1 - t))
  })
}

/** Lightning out of the sky onto `where` (world). */
const skyBolt = (fx: Fx, where: Vec2, color: number, life = 0.22, top = 420): void => {
  const foot = at(where)
  const points: Array<Vec2> = []
  for (let step = 0; step <= 5; step++) points.push({ x: foot.x + (step === 5 ? 0 : (Math.random() - 0.5) * z(40)), y: foot.y - z(top) * (1 - step / 5) })
  fx.bolt(points, color, life)
  fx.flash({ x: foot.x, y: foot.y - z(10) }, z(22), white, 0.1)
  fx.flash({ x: foot.x, y: foot.y - z(10) }, z(40), color, 0.2)
  fx.ring(foot, z(50), color, 0.3)
}

/** A rise for `seconds` to `height` pixels, held, then a slam down in `slam` seconds (see `FeedbackState.hover`). */
const riseAndSlam = (feedback: FeedbackState, seconds: number, height: number, slam = 0.07): void => {
  feedback.hover = {
    age: 0,
    life: seconds + slam,
    lift: (age) => age < seconds ? height * easeOut(age / seconds) : height * (1 - (age - seconds) / slam)
  }
}

// ── The skills ────────────────────────────────────────────────────────────

/** Where the one on the field stands this frame (for looks that follow her). */
const tracked = { at: { x: 0, y: 0 } as Vec2 }

const flareJump = (fx: Fx, cast: CastValue, radius: number): void => {
  const foot = at(cast.from)
  const body = at(cast.from, 20)
  const ahead = normalizeOr(toScreen(projection, cast.direction), { x: 0, y: 1 })
  // The jet she kicks off: fire thrown hard ahead of her.
  fx.sparks(body, ahead, { color: fire, count: 26, speed: 900, spread: 0.35, size: 5, life: 0.35, stretch: 6, gravity: 0, drag: 5 })
  fx.sparks(body, ahead, { color: flame, count: 14, speed: 700, spread: 0.2, size: 3.5, life: 0.25, stretch: 6, gravity: 0, drag: 5 })
  fx.flash(body, z(60), flame, 0.16)
  // The blast she kicks off from, the floor scorched.
  fx.ring(foot, z(radius), fire, 0.35)
  scorch(fx, cast.from, radius * 0.9)
  explosion(fx, cast.from, radius * 0.8)
}

const barrageVolley = (fx: Fx, cast: CastValue, shells: number, interval: number): void => {
  for (let shell = 0; shell < shells; shell++) {
    fx.later(shell * interval, () => {
      // Each shell fired up off her, a flash at the muzzle.
      const muzzle = at(cast.from, 44)
      fx.flash(muzzle, z(34), flame, 0.1)
      for (let streak = 0; streak < 4; streak++) fx.mote({ x: muzzle.x + (Math.random() - 0.5) * 8, y: muzzle.y }, (Math.random() - 0.5) * 80, -1300, { color: streak === 0 ? white : fire, size: 4, life: 0.22, stretch: 8, gravity: 0, drag: 0 })
      fx.burst(muzzle, { color: 0x6b6470, count: 4, speed: 80, size: 5, life: 0.5, gravity: -60, drag: 2, alpha: 0.5 })
    })
  }
}

/**
 * The Gunner's fire goes off as an explosion, not as flames (those are
 * Hearth's): a fireball, a shockwave racing out low over the floor, smoke
 * rolling up, and debris thrown out and falling back.
 */
const explosion = (fx: Fx, where: Vec2, radius: number): void => {
  const foot = at(where)
  const heart = at(where, 14)
  fx.flash(heart, z(radius * 0.55), white, 0.08)
  fx.flash(heart, z(radius * 1.1), flame, 0.2)
  fx.flash(heart, z(radius * 0.8), fire, 0.3)
  fx.animate(0.28, (t, g, glow) => {
    const reach = z(radius * (0.5 + 1.1 * easeOut(t)))
    glow.strokeEllipse(foot.x, foot.y, reach, reach * projection.squash, z(5) * (1 - t), flame, 0.9 * (1 - t))
    g.fillEllipse(foot.x, foot.y, z(radius * 0.7), z(radius * 0.7) * projection.squash, 0x2a1c18, 0.3 * (1 - t))
  })
  for (let puff = 0; puff < 9; puff++) {
    const angle = (puff / 9) * Math.PI * 2
    fx.mote({ x: heart.x + Math.cos(angle) * z(radius * 0.3), y: heart.y + Math.sin(angle) * z(radius * 0.15) }, Math.cos(angle) * 50, -40 - Math.random() * 50, { color: puff % 3 === 0 ? 0x8a7f78 : 0x5d5560, size: 9 + Math.random() * 6, life: 0.8, gravity: -50, drag: 2, alpha: 0.55 })
  }
  fx.burst(heart, { color: flame, count: 12, speed: 520, size: 3, life: 0.35, stretch: 5, gravity: 900, drag: 2 })
  fx.burst(heart, { color: 0x3a2e2a, count: 8, speed: 380, size: 3.5, life: 0.5, gravity: 1300 })
}

/** Overdrive taking hold: her gun flaring up, a blast of fire bursting out around her, embers rising off her. */
const overdriveIgnite = (fx: Fx, feedback: FeedbackState, cast: CastValue, radius: number): void => {
  explosion(fx, cast.from, radius * 0.8)
  fx.ring(at(cast.from), z(radius), flame, 0.35)
  fx.ring(at(cast.from), z(radius * 0.6), fire, 0.3)
  fx.flash(at(cast.from, 26), z(70), white, 0.12)
  feedback.shake = Math.max(feedback.shake, view.ultimateShake * 0.7)
  feedback.punch = Math.max(feedback.punch, 0.9)
  for (let ember = 0; ember < 24; ember++) {
    const foot = at(cast.from, Math.random() * 40)
    fx.mote({ x: foot.x + (Math.random() - 0.5) * z(40), y: foot.y }, (Math.random() - 0.5) * 80, -120 - Math.random() * 160, { color: ember % 3 === 0 ? white : ember % 2 === 0 ? flame : fire, size: 2.5 + Math.random() * 2, life: 0.7, gravity: -80, drag: 1.5 })
  }
}

/** An overdriven shot leaving: a blaze at the muzzle, a spent casing thrown out to her side. */
const overdriveShot = (fx: Fx, from: Vec2, direction: Vec2): void => {
  const muzzle = at(add(from, direction, 26), 22)
  const ahead = normalizeOr(toScreen(projection, direction), { x: 1, y: 0 })
  fx.flash(muzzle, z(26), flame, 0.07)
  fx.sparks(muzzle, ahead, { color: flame, count: 5, speed: 420, spread: 0.35, size: 2.5, life: 0.12, stretch: 4 })
  const side = Math.random() < 0.5 ? 1 : -1
  fx.mote(at(from, 24), -ahead.y * side * 160 - ahead.x * 40, ahead.x * side * 60 - 180, { color: 0xe7c46a, size: 2.5, life: 0.45, gravity: 1100, drag: 0.4 })
}

/** An overdriven shot bursting: a quick, hard pop of fire, a ring snapping out, a jolt. */
const shotBlast = (fx: Fx, feedback: FeedbackState, where: Vec2, radius: number): void => {
  const heart = at(where, 12)
  fx.flash(heart, z(radius * 0.9), flame, 0.1)
  fx.flash(heart, z(radius * 0.45), white, 0.05)
  fx.ring(at(where), z(radius), flame, 0.18)
  fx.burst(heart, { color: flame, count: 7, speed: 380, size: 2.5, life: 0.25, stretch: 4, gravity: 700, drag: 2 })
  fx.mote(heart, (Math.random() - 0.5) * 40, -50, { color: 0x5d5560, size: 8, life: 0.5, gravity: -40, drag: 2, alpha: 0.45 })
  feedback.shake = Math.max(feedback.shake, 2.5)
}

/**
 * Tidefall, as she bounces up: her water body stretching tall as it leaves
 * the floor (rounding out at the top, stretching again as it drops), the
 * puddle under her drawn up after her.
 */
const tidefallBounce = (fx: Fx, feedback: FeedbackState, cast: CastValue, rise: number, dive: number): void => {
  feedback.squish = {
    age: 0,
    life: rise + dive,
    stretch: (age) => age < rise ? 0.4 * Math.sin(Math.PI * Math.min(1, age / (rise * 0.8))) : 0.3 * Math.min(1, (age - rise) / dive)
  }
  const center = cast.from
  fx.animate(rise, (t, g) => {
    const foot = at(center)
    const r = z(46) * (1 - easeOut(t))
    g.fillEllipse(foot.x, foot.y, r, r * projection.squash, water, 0.5 * (1 - t))
    g.fillEllipse(foot.x, foot.y, r * 0.55, r * 0.55 * projection.squash, foam, 0.4 * (1 - t))
  })
  const foot = at(center)
  for (let drop = 0; drop < 16; drop++) fx.mote({ x: foot.x + (Math.random() - 0.5) * z(24), y: foot.y }, (Math.random() - 0.5) * 90, -320 - Math.random() * 220, { color: drop % 3 === 0 ? foam : water, size: 3 + Math.random() * 2, life: 0.4, gravity: 1100, drag: 0.6 })
}

/**
 * Tidefall, as she plops down where she stood: her body splatting flat and
 * wobbling back like a drop of water, a puddle slapped out under her, a
 * crown of droplets thrown out of it, and the Tide (see `tide`).
 */
const tidefallPlop = (fx: Fx, feedback: FeedbackState, cast: CastValue, radius: number): void => {
  feedback.squish = { age: 0, life: 0.7, stretch: (age) => -0.5 * Math.cos(age * 26) * Math.exp(-age * 6) }
  const center = cast.from
  fx.animate(0.5, (t, g, glow) => {
    const foot = at(center)
    const r = z(40 + 50 * easeOut(Math.min(1, t * 2.5)))
    g.fillEllipse(foot.x, foot.y, r, r * projection.squash, water, 0.55 * (1 - t))
    glow.strokeEllipse(foot.x, foot.y, r, r * projection.squash, z(3), foam, 0.8 * (1 - t))
  })
  const foot = at(center)
  for (let drop = 0; drop < 28; drop++) {
    const angle = (drop / 28) * Math.PI * 2 + Math.random() * 0.2
    const out = 160 + Math.random() * 120
    fx.mote({ x: foot.x + Math.cos(angle) * z(30), y: foot.y + Math.sin(angle) * z(30) * projection.squash }, Math.cos(angle) * out, Math.sin(angle) * out * projection.squash - 260 - Math.random() * 120, { color: drop % 3 === 0 ? foam : water, size: 3 + Math.random() * 2.5, life: 0.55, gravity: 1200, drag: 0.4 })
  }
  tide(fx, feedback, cast, radius)
}

const tide = (fx: Fx, feedback: FeedbackState, cast: CastValue, radius: number): void => {
  const center = cast.from
  fx.flash(at(center, 20), z(90), water, 0.3)
  fx.flash(at(center, 10), z(40), white, 0.1)
  feedback.shake = Math.max(feedback.shake, view.ultimateShake * 0.8)
  feedback.punch = Math.max(feedback.punch, 0.9)
  fx.animate(0.7, (t, g) => {
    const reach = radius * easeOut(t)
    const height = 80 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - 0.3 * t)
    g.fillEllipse(at(center).x, at(center).y, z(reach), z(reach) * projection.squash, water, 0.16 * (1 - t))
    cylinder(g, center, reach, height, water, 0.22 * (1 - t * 0.6), foam, 0.85 * (1 - t))
  })
  // It falls back as rain all around.
  fx.later(0.45, () => {
    for (let drop = 0; drop < 70; drop++) {
      const where = at(around(center, radius * (0.4 + Math.random() * 0.65), Math.random() * Math.PI * 2), 70 + Math.random() * 40)
      fx.mote(where, (Math.random() - 0.5) * 60, 60 + Math.random() * 120, { color: Math.random() < 0.4 ? foam : water, size: 3 + Math.random() * 2.5, life: 0.45, gravity: 900, drag: 0.5 })
    }
  })
}

/** How high on a companion its throws and heals leave from (pixels at zoom 1). */
const companionChest = 26

/** Tidal Echo, called up: a splash behind her, her echo standing up out of it. */
const tidalEcho = (fx: Fx, cast: CastValue, effect: CompanionsEffect): void => {
  for (let index = 0; index < effect.count; index++) {
    const where = companionStart(cast.from, cast.direction, index, effect.count)
    const foot = at(where)
    fx.flash(at(where, 16), z(46), view.companion.color, 0.25)
    fx.ring(foot, z(50), foam, 0.35)
    fx.ring(foot, z(30), water, 0.3)
    // A puddle slapped out, a crown of drops thrown up out of it.
    fx.animate(0.45, (t, g) => {
      const r = z(26 + 30 * easeOut(Math.min(1, t * 2)))
      g.fillEllipse(foot.x, foot.y, r, r * projection.squash, water, 0.45 * (1 - t))
    })
    for (let drop = 0; drop < 24; drop++) {
      const angle = (drop / 24) * Math.PI * 2 + Math.random() * 0.2
      const out = 110 + Math.random() * 110
      fx.mote({ x: foot.x + Math.cos(angle) * z(18), y: foot.y + Math.sin(angle) * z(18) * projection.squash }, Math.cos(angle) * out, Math.sin(angle) * out * projection.squash - 240 - Math.random() * 120, { color: drop % 3 === 0 ? foam : water, size: 3 + Math.random() * 2.5, life: 0.55, gravity: 1200, drag: 0.4 })
    }
  }
}

/** A companion's throw: a splash off its hands as the disc leaves. */
const companionShot = (fx: Fx, from: Vec2, to: Vec2): void => {
  const body = at(from, companionChest)
  const toward = normalizeOr({ x: at(to).x - at(from).x, y: at(to).y - at(from).y }, { x: 1, y: 0 })
  for (let drop = 0; drop < 6; drop++) fx.mote(body, toward.x * 140 + (Math.random() - 0.5) * 100, toward.y * 140 - 40 - Math.random() * 60, { color: drop % 2 === 0 ? foam : water, size: 3, life: 0.35, gravity: 900, drag: 0.5 })
}

/** A companion's heal: drops arcing from it into her, glowing as they land. */
const companionHeal = (fx: Fx, from: Vec2): void => {
  const a = at(from, companionChest)
  fx.animate(0.7, (t, g, glow) => {
    const b = at(tracked.at, 26)
    for (let drop = 0; drop < 4; drop++) {
      const k = Math.min(1, Math.max(0, t * 1.3 - drop * 0.08))
      if (k <= 0 || k >= 1) continue
      const x = a.x + (b.x - a.x) * k
      const y = a.y + (b.y - a.y) * k - Math.sin(Math.PI * k) * z(30)
      g.fillCircle(x, y, z(3.5), water, 0.9)
      glow.fillCircle(x, y, z(1.5), view.totem.heal, 0.9)
    }
  })
  fx.later(0.6, () => fx.burst(at(tracked.at, 26), { color: view.totem.heal, count: 8, speed: 140, size: 3, life: 0.4, gravity: -200 }))
}

/** A companion leaving: it comes apart in foam, rising. */
const companionGone = (fx: Fx, where: Vec2): void => {
  const foot = at(where)
  fx.flash(at(where, 30), z(40), view.companion.color, 0.25)
  for (let mist = 0; mist < 20; mist++) fx.mote({ x: foot.x + (Math.random() - 0.5) * z(28), y: foot.y - Math.random() * z(60) }, (Math.random() - 0.5) * 60, -50 - Math.random() * 80, { color: mist % 3 === 0 ? water : view.companion.color, size: 4 + Math.random() * 5, life: 0.9, gravity: -30, drag: 1.2, alpha: 0.6 })
}

/**
 * A companion's body: walking or standing as her own does (her clips),
 * facing where it goes or throws, playing her throw as it throws; pale and
 * see-through, rising out of the floor as it comes and flickering over its
 * last moments.
 */
const moveCompanion = (node: CompanionNode, facing: Vec2, threw: boolean, age: number, left: number, seconds: number, now: number): void => {
  node.body.face(facing)
  node.body.animate({ x: node.root.position.x, y: node.root.position.z }, facing, seconds, false)
  const throwClip = node.body.moments?.attack?.[0]
  if (threw && throwClip !== undefined) node.body.play(throwClip, 0.35, 0)
  const rise = Math.min(1, age / 0.4)
  node.pivot.scale.setScalar(view.companion.size * (0.6 + 0.4 * rise))
  const flicker = left < 2 && Math.sin(now * 16) > 0 ? 0.45 : 1
  const shimmer = 0.9 + 0.1 * Math.sin(now * 4)
  node.body.paint(0xffffff, view.companion.color, view.companion.wash, view.companion.opacity * rise * flicker * shimmer)
}

/** Companions seen last frame (by entity): where, and what they had dealt (a throw since shows), to see the ones gone off. */
const companionsSeen = new Map<number, { readonly at: Vec2; readonly dealt: number }>()

/**
 * Tide Dome rising: water welling up out of the floor around her and closing
 * over her in a beat, a ring of spray where it meets the floor.
 */
const tideDomeRise = (fx: Fx, cast: CastValue, radius: number): void => {
  const foot = at(cast.from)
  fx.burst(foot, { color: water, count: 26, speed: 420, size: 4, life: 0.5, gravity: 900 })
  fx.burst(foot, { color: foam, count: 14, speed: 300, size: 3, life: 0.4, gravity: 900 })
  // Spray thrown up all along its rim as it closes.
  for (let index = 0; index < 18; index++) {
    const rim = at(around(cast.from, radius, (index / 18) * Math.PI * 2))
    fx.mote(rim, (Math.random() - 0.5) * 80, -260 - Math.random() * 160, { color: Math.random() < 0.5 ? foam : water, size: 3 + Math.random() * 2, life: 0.55, gravity: 900, drag: 0.5 })
  }
  fx.ring(foot, z(radius), foam, 0.45)
}

/** How tall a dome stands over its rim, as a share of its radius (pixels at zoom 1, before the floor's squash). */
const domeRise = 0.62

/**
 * A dome of water standing over `center` (world), `radius` around it: its
 * shell (see-through, brighter toward the rim, as water is), its rim on the
 * floor, bands running up it, and a glint gliding over it. `grow`: 0 to 1
 * as it rises; `fade`: 1 to 0 as it goes.
 */
const dome = (g: Shapes, glow: Shapes, center: Vec2, radius: number, grow: number, fade: number, now: number): void => {
  if (grow <= 0 || fade <= 0) return
  const foot = at(center)
  const rx = z(radius) * (0.4 + 0.6 * grow)
  const ry = rx * projection.squash
  const height = z(radius * domeRise) * grow
  // A ring of the shell at `k` of its height (0: its rim; 1: its top): a flat ellipse, narrowing upward.
  const latitude = (k: number) => ({ y: foot.y - height * Math.sin(k * Math.PI / 2), rx: rx * Math.cos(k * Math.PI / 2), ry: ry * Math.cos(k * Math.PI / 2) })
  // The shell, layered from the rim in: thicker water toward its edge (where the eye looks through more of it).
  const steps = 32
  for (let layer = 0; layer < 3; layer++) {
    const shrink = 1 - layer * 0.16
    const shell: Array<number> = []
    for (let step = 0; step <= steps; step++) {
      const angle = Math.PI + (step / steps) * Math.PI
      shell.push(foot.x + Math.cos(angle) * rx * shrink, foot.y + Math.sin(angle) * height * (1 - layer * 0.08))
    }
    for (let step = 0; step <= steps; step++) {
      const angle = (step / steps) * Math.PI
      shell.push(foot.x + Math.cos(angle) * rx * shrink, foot.y + Math.sin(angle) * ry * shrink)
    }
    g.fillPoly(shell, layer === 0 ? water : 0x9fd8ff, (layer === 0 ? 0.2 : 0.07) * fade)
  }
  // The floor under it, and its rim: a band of foam, lapping.
  g.fillEllipse(foot.x, foot.y, rx, ry, water, 0.12 * fade)
  g.strokeEllipse(foot.x, foot.y, rx, ry, z(5), foam, 0.7 * fade)
  g.strokeEllipse(foot.x, foot.y, rx * (0.96 + 0.02 * Math.sin(now * 5)), ry * (0.96 + 0.02 * Math.sin(now * 5)), z(2), water, 0.6 * fade)
  // Rings of light running up the shell, the near half brighter.
  for (let band = 0; band < 4; band++) {
    const rise = (now * 0.22 + band / 4) % 1
    const ring = latitude(rise * 0.92)
    const alpha = fade * Math.sin(rise * Math.PI) * 0.55
    const points = (from: number, to: number): Array<number> => {
      const out: Array<number> = []
      for (let step = 0; step <= 20; step++) {
        const angle = from + (to - from) * (step / 20)
        out.push(foot.x + Math.cos(angle) * ring.rx, ring.y + Math.sin(angle) * ring.ry)
      }
      return out
    }
    const near = points(0, Math.PI)
    const far = points(Math.PI, Math.PI * 2)
    for (let index = 2; index < near.length; index += 2) glow.line(near[index - 2]!, near[index - 1]!, near[index]!, near[index + 1]!, z(2.5), foam, alpha)
    for (let index = 2; index < far.length; index += 2) g.line(far[index - 2]!, far[index - 1]!, far[index]!, far[index + 1]!, z(1.5), foam, alpha * 0.4)
  }
  // Its outline over the top: the edge of the water, bright where it is seen edge-on.
  for (let step = 1; step <= steps; step++) {
    const a0 = Math.PI + ((step - 1) / steps) * Math.PI
    const a1 = Math.PI + (step / steps) * Math.PI
    const edge = 0.45 + 0.55 * Math.abs(Math.cos((a0 + a1) / 2))
    g.line(foot.x + Math.cos(a0) * rx, foot.y + Math.sin(a0) * height, foot.x + Math.cos(a1) * rx, foot.y + Math.sin(a1) * height, z(4), foam, 0.75 * edge * fade)
  }
  // A highlight up on its left shoulder, and a glint gliding over it.
  glow.fillEllipse(foot.x - rx * 0.45, foot.y - height * 0.7, z(radius * 0.18), z(radius * 0.07), white, 0.3 * fade, -0.5)
  const glint = now * 0.5 % 1
  const ga = Math.PI * (1.15 + 0.7 * glint)
  glow.fillEllipse(foot.x + Math.cos(ga) * rx * 0.8, foot.y + Math.sin(ga) * height * 0.85, z(10), z(5), white, 0.5 * fade * Math.sin(glint * Math.PI))
  // Drips running down it now and then.
  for (let drip = 0; drip < 5; drip++) {
    const phase = (now * 0.7 + drip * 0.37) % 1
    const side = wobble(drip * 7 + Math.floor(now * 0.7 + drip * 0.37)) * 0.9
    const k = 1 - phase
    const ring = latitude(k * 0.9)
    g.fillCircle(foot.x + side * ring.rx, ring.y + Math.sqrt(Math.max(0, 1 - side * side)) * ring.ry, z(3), foam, 0.7 * fade * Math.sin(phase * Math.PI))
  }
}

/**
 * Riptide Bond lashing out: a chain of water whipping from her to the enemy
 * it turns, link by link, snapping tight around it with a splash.
 */
const riptideLash = (fx: Fx, feedback: FeedbackState, from: Vec2, to: Vec2): void => {
  const links = 12
  fx.animate(0.32, (t, g, glow) => {
    const out = easeOut(clamp01(t / 0.55))
    const along = { x: to.x - from.x, y: to.y - from.y }
    const side = normalizeOr({ x: -along.y, y: along.x }, { x: 0, y: 1 })
    for (let link = 0; link < links; link++) {
      const share = link / (links - 1)
      if (share > out) break
      // It whips: a wave along it that settles as it goes tight.
      const sway = Math.sin(share * Math.PI * 2 + t * 18) * 24 * (1 - t) * Math.sin(share * Math.PI)
      const where = at(add(add(from, along, share), side, sway), 24 + 6 * Math.sin(share * Math.PI))
      const turn = link % 2 === 0
      g.strokeEllipse(where.x, where.y, z(turn ? 7 : 4), z(turn ? 4 : 7), z(3), water, 0.9)
      glow.fillCircle(where.x, where.y, z(2), foam, 0.8)
    }
  })
  fx.later(0.18, () => {
    const body = at(to, 22)
    fx.flash(body, z(60), foam, 0.16)
    fx.burst(body, { color: water, count: 24, speed: 420, size: 4, life: 0.45, gravity: 700 })
    fx.ring(at(to), z(60), water, 0.4)
    feedback.punch = Math.max(feedback.punch, 1.1)
  })
}

/**
 * A turned enemy held: a thin chain of water from the one on the field to
 * it, sagging a little, drops running along it toward the enemy; it pulls
 * taut and flickers as its time runs out.
 */
const riptideChain = (g: Shapes, glow: Shapes, from: Vec2, to: Vec2, left: number, now: number): void => {
  const ending = left < 1.2
  const fade = Math.min(1, left / 0.3) * (ending && Math.sin(now * 28) < 0 ? 0.45 : 1)
  const span = Math.hypot(to.x - from.x, to.y - from.y)
  const links = Math.max(6, Math.round(span / 22))
  const sag = ending ? 3 : 10
  for (let link = 1; link < links; link++) {
    const share = link / links
    const height = 22 - Math.sin(share * Math.PI) * sag + Math.sin(now * 2.5 + link * 0.7) * 1.5
    const point = at(lerp(from, to, share), height)
    const turn = link % 2 === 0
    g.strokeEllipse(point.x, point.y, z(turn ? 3.5 : 2), z(turn ? 2 : 3.5), z(1.6), water, 0.45 * fade)
  }
  // Drops running along it, toward what it holds.
  for (let drop = 0; drop < 3; drop++) {
    const share = (now * 0.8 + drop / 3) % 1
    const point = at(lerp(from, to, share), 22 - Math.sin(share * Math.PI) * sag)
    glow.fillCircle(point.x, point.y, z(2.2), foam, 0.6 * fade * Math.sin(share * Math.PI))
  }
}

/** The chain snapping as a turned enemy goes back: links flung off, a heavy splash on it, a jolt. */
const riptideSnap = (fx: Fx, feedback: FeedbackState, from: Vec2, to: Vec2): void => {
  const body = at(to, 22)
  const links = 10
  for (let link = 1; link < links; link++) {
    const point = at(lerp(from, to, link / links), 22)
    fx.mote(point, (Math.random() - 0.5) * 260, -120 - Math.random() * 200, { color: Math.random() < 0.5 ? foam : water, size: 3 + Math.random() * 2, life: 0.5, gravity: 900, drag: 1 })
  }
  fx.flash(body, z(90), foam, 0.18)
  fx.flash(body, z(130), water, 0.3)
  fx.burst(body, { color: water, count: 40, speed: 620, size: 4.5, life: 0.55, gravity: 800 })
  fx.ring(at(to), z(90), water, 0.45)
  fx.ring(at(to), z(55), foam, 0.3)
  feedback.shake = Math.max(feedback.shake, view.ultimateShake * 0.6)
  feedback.punch = Math.max(feedback.punch, 1.2)
}

const sparkTotem = (fx: Fx, cast: CastValue, offset: number): void => {
  const where = add(cast.from, cast.direction, offset)
  skyBolt(fx, where, thunder, 0.3)
  fx.burst(at(where), { color: thunder, count: 16, speed: 300, size: 3, life: 0.3, stretch: 4 })
}

const thunderclap = (fx: Fx, cast: CastValue, radius: number, struck: ReadonlyArray<Vec2>): void => {
  const center = cast.from
  skyBolt(fx, center, thunder, 0.35, 520)
  fx.flash(at(center, 30), z(90), thunder, 0.3)
  // Each struck in turn by a bolt out of the sky.
  struck.forEach((where, index) => fx.later(0.04 + index * 0.05, () => skyBolt(fx, where, thunder, 0.25)))
  // A ring of thunder crackling out to its reach.
  for (let ring = 0; ring < 2; ring++) {
    fx.later(ring * 0.08, () => {
      const points: Array<Vec2> = []
      const reach = radius * (0.6 + ring * 0.4)
      for (let step = 0; step <= 28; step++) points.push(at(around(center, reach, (step / 28) * Math.PI * 2), 8))
      fx.bolt(points, thunder, 0.3)
    })
  }
}

/** A jagged line of lightning from `a` to `b` (projected), `kinks` turns, each thrown up to `spread` pixels aside. */
const jagged = (a: Vec2, b: Vec2, kinks: number, spread: number): Array<Vec2> => {
  const points: Array<Vec2> = [a]
  for (let kink = 1; kink < kinks; kink++) {
    const share = kink / kinks
    points.push({ x: a.x + (b.x - a.x) * share + (Math.random() - 0.5) * spread, y: a.y + (b.y - a.y) * share + (Math.random() - 0.5) * spread })
  }
  points.push(b)
  return points
}

const sparkStep = (fx: Fx, feedback: FeedbackState, cast: CastValue, effect: CutEffect): void =>
  sparkTear(fx, feedback, cast.from, cast.direction, effect.carries > 0 ? effect.carries : effect.length, effect.width)

/** A streak from `a` to `b` (projected) at most `width` across, tapering to a point at both ends (a line's ends would show cut off square). */
const spindle = (g: Shapes, a: Vec2, b: Vec2, width: number, color: number, alpha: number): void => {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1e-6 || width <= 0) return
  const across = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
  const steps = 12
  const sides: Array<{ readonly x: number; readonly y: number; readonly half: number }> = []
  for (let step = 0; step <= steps; step++) {
    const share = step / steps
    // Fullest a little past the middle, toward where she ends up.
    sides.push({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, half: (width / 2) * Math.sin(Math.PI * share ** 0.8) ** 0.7 })
  }
  // Down one side and back up the other.
  const points: Array<number> = []
  for (const side of sides) points.push(side.x + across.x * side.half, side.y + across.y * side.half)
  for (let index = sides.length - 1; index >= 0; index--) points.push(sides[index]!.x - across.x * sides[index]!.half, sides[index]!.y - across.y * sides[index]!.half)
  g.fillPoly(points, color, alpha)
}

/** A dart of lightning from `from`, `length` along `direction`, through a lane `width` across (the Spark Step's look; an overcharged dash's too). */
const sparkTear = (fx: Fx, feedback: FeedbackState, from: Vec2, direction: Vec2, length: number, width: number): void => {
  const to = add(from, direction, length)
  const a = at(from, 20)
  const b = at(to, 20)
  // She bursts off in a crack of thunder.
  fx.flash(a, z(30), white, 0.08)
  fx.burst(a, { color: thunder, count: 18, speed: 380, size: 3, life: 0.3, stretch: 5 })
  // A tear of lightning where she ran, two bolts twisting about each other, her afterimages along it.
  fx.bolt(jagged(a, b, 7, z(34)), thunder, 0.4)
  fx.bolt(jagged(a, b, 9, z(22)), white, 0.25)
  fx.animate(0.5, (t, g, glow) => {
    const fade = 1 - t
    spindle(glow, a, b, z(30) * fade, thunder, 0.45 * fade)
    spindle(glow, a, b, z(9) * fade, white, 0.95 * fade)
    for (let image = 0; image < 7; image++) {
      const share = image / 7
      ghost(g, lerp(from, to, share), thunder, 0.5 * fade * (0.3 + share * 0.7))
    }
  })
  // A scorched line on the floor, crackling a while.
  fx.animate(1.1, (t, g) => {
    const fade = 1 - t
    const fa = at(from)
    const fb = at(to)
    spindle(g, fa, fb, z(12) * fade, thunder, 0.3 * fade)
    if (Math.random() < 0.35 * fade) {
      const share = Math.random()
      fx.bolt(jagged(lerp(fa, fb, Math.max(0, share - 0.08)), lerp(fa, fb, Math.min(1, share + 0.08)), 3, z(16)), thunder, 0.08)
    }
  })
  // She arrives in a ring of sparks.
  fx.later(0.12, () => {
    fx.flash(b, z(70), thunder, 0.18)
    fx.ring(at(to), z(110), thunder, 0.3)
    fx.burst(b, { color: white, count: 14, speed: 420, size: 3, life: 0.28, stretch: 5 })
    feedback.shake = Math.max(feedback.shake, 5)
  })
  // What she passed pops a beat later.
  fx.later(0.18, () => {
    for (let along = 30; along <= length; along += 40) {
      const where = at(add(add(from, direction, along), { x: -direction.y, y: direction.x }, (Math.random() - 0.5) * width * 0.7), 18)
      fx.flash(where, z(32), thunder, 0.14)
      fx.burst(where, { color: Math.random() < 0.5 ? white : thunder, count: 8, speed: 300, size: 2.5, life: 0.25, stretch: 4 })
    }
  })
}

/** Overcharge taking hold: a bolt out of the sky into her, thunder bursting out around her. */
const overchargeBurst = (fx: Fx, feedback: FeedbackState, cast: CastValue, radius: number): void => {
  const center = cast.from
  skyBolt(fx, center, thunder, 0.35, 560)
  fx.flash(at(center, 24), z(130), thunder, 0.3)
  fx.flash(at(center, 24), z(70), white, 0.14)
  fx.burst(at(center, 24), { color: thunder, count: 36, speed: 560, size: 3.5, life: 0.4, stretch: 5 })
  // Bolts thrown out to the burst's reach, all around.
  for (let arm = 0; arm < 8; arm++) {
    const angle = (arm / 8) * Math.PI * 2 + Math.random() * 0.4
    fx.bolt(jagged(at(center, 20), at(around(center, radius, angle), 6), 4, z(26)), arm % 2 === 0 ? white : thunder, 0.25)
  }
  fx.ring(at(center), z(radius), thunder, 0.4)
  fx.ring(at(center), z(radius * 0.6), white, 0.3)
  feedback.punch = Math.max(feedback.punch, 1.2)
  feedback.shake = Math.max(feedback.shake, view.ultimateShake)
}

/** An overcharged blow: lightning thrown from her fist out to its reach, sparking where it ends. */
const overchargeBlow = (fx: Fx, from: Vec2, direction: Vec2, reach: number): void => {
  const a = at(add(from, direction, 14), 22)
  const b = at(add(from, direction, reach), 18)
  fx.bolt(jagged(a, b, 3, z(16)), Math.random() < 0.5 ? white : thunder, 0.1)
  fx.burst(b, { color: thunder, count: 5, speed: 240, size: 2.5, life: 0.18, stretch: 4 })
}

/** Embers lifting off the floor at `where` (world), drifting up and out. */
const embers = (fx: Fx, where: Vec2, count: number, spread = 1): void => {
  const foot = at(where)
  for (let index = 0; index < count; index++) {
    fx.mote({ x: foot.x + (Math.random() - 0.5) * z(14) * spread, y: foot.y - Math.random() * z(6) }, (Math.random() - 0.5) * 50 * spread, -60 - Math.random() * 90, {
      color: Math.random() < 0.45 ? flame : fire,
      size: 2 + Math.random() * 2.5,
      life: 0.6 + Math.random() * 0.6,
      gravity: -40,
      drag: 1.2
    })
  }
}

/** The floor between `inner` and `outer` around `center` (world) filled, as flat quads. */
const annulus = (g: Shapes, center: Vec2, inner: number, outer: number, color: number, alpha: number, segments = 56): void => {
  if (alpha <= 0 || outer <= inner) return
  for (let index = 0; index < segments; index++) {
    const a = (index / segments) * Math.PI * 2
    const b = ((index + 1) / segments) * Math.PI * 2
    const [ia, oa, ob, ib] = [at(around(center, inner, a)), at(around(center, outer, a)), at(around(center, outer, b)), at(around(center, inner, b))]
    g.fillPoly([ia.x, ia.y, oa.x, oa.y, ob.x, ob.y, ib.x, ib.y], color, alpha)
  }
}

/** The floor glowing hot between `inner` and `outer` around `center` (world): ember light, hottest in the middle of the band, its edges bright. */
const hotBand = (g: Shapes, glow: Shapes, center: Vec2, inner: number, outer: number, alpha: number, now: number): void => {
  const foot = at(center)
  const width = outer - inner
  const flicker = 0.85 + 0.15 * Math.sin(now * 17)
  // Nested bands, each a little narrower: a soft glow, hottest along the middle.
  const layers = 7
  for (let layer = 0; layer < layers; layer++) {
    const inset = (width * 0.45 * layer) / layers
    annulus(layer < 2 ? g : glow, center, inner + inset, outer - inset, layer < 4 ? fire : flame, (layer < 2 ? 0.06 : 0.07) * alpha * flicker)
  }
  g.strokeEllipse(foot.x, foot.y, z(outer), z(outer) * projection.squash, z(2.5), flame, 0.7 * alpha)
  if (inner > 0) g.strokeEllipse(foot.x, foot.y, z(inner), z(inner) * projection.squash, z(2), fire, 0.5 * alpha)
}

const kindle = (fx: Fx, haze: Haze, cast: CastValue, effect: EmberRingEffect): void => {
  const center = cast.from
  const { inner, outer, delay, linger } = effect
  const fade = 0.35
  const total = delay + linger + fade
  // Building up: its edges drawn on the floor, the band warming, heat starting to rise; embers gathering into it.
  fx.animate(total, (t, g, glow) => {
    const now = performance.now() / 1000
    const seconds = t * total
    const foot = at(center)
    if (seconds < delay) {
      const warm = seconds / delay
      const pulse = 0.75 + 0.25 * Math.sin(now * 22)
      g.strokeEllipse(foot.x, foot.y, z(outer), z(outer) * projection.squash, z(2), flame, 0.6 * warm * pulse)
      g.strokeEllipse(foot.x, foot.y, z(inner), z(inner) * projection.squash, z(1.5), fire, 0.45 * warm * pulse)
      hotBand(g, glow, center, inner, outer, 0.35 * warm * warm, now)
      haze.add({ at: center, radius: outer, inner: inner / outer, rise: 40 * warm, strength: 3 * warm })
      return
    }
    // Burning: the band hot, the air over it bending; then it cools away.
    const burning = seconds - delay
    const swell = easeOut(clamp01(burning / 0.08))
    const left = clamp01((total - seconds) / fade)
    hotBand(g, glow, center, inner, outer, swell * left, now)
    haze.add({ at: center, radius: outer, inner: inner / outer, rise: 120 * swell, strength: 7 * left })
  })
  const gather = 20
  for (let index = 0; index < gather; index++) {
    fx.later(Math.random() * delay * 0.8, () => {
      const where = at(around(center, inner + (outer - inner) * Math.random(), Math.random() * Math.PI * 2))
      const from = { x: where.x + (Math.random() - 0.5) * z(30), y: where.y - z(30 + Math.random() * 30) }
      const seconds = 0.3
      fx.mote(from, (where.x - from.x) / seconds, (where.y - from.y) / seconds, { color: Math.random() < 0.5 ? flame : fire, size: 2.5, life: seconds, gravity: 0, drag: 0, stretch: 2 })
    })
  }
  // It goes up: a ring rushing out along it, embers lifting all along it while it burns.
  fx.later(delay, () => {
    fx.ring(at(center), z(outer), flame, 0.3)
    const count = 26
    for (let index = 0; index < count; index++) {
      const where = around(center, inner + (outer - inner) * Math.random(), (index / count) * Math.PI * 2 + Math.random() * 0.2)
      fx.later(Math.random() * linger * 0.7, () => embers(fx, where, 2))
    }
  })
}

const wildfireRise = (fx: Fx, haze: Haze, feedback: FeedbackState, moment: number): void => {
  const height = 80
  riseAndSlam(feedback, moment, height)
  // The heat she rises on: the air under and around her bending, embers streaming up.
  fx.animate(moment + 0.05, (t) => {
    haze.add({ at: tracked.at, radius: 70, inner: 0, rise: 200 * easeOut(clamp01(t * 1.2)), strength: 8 })
    if (Math.random() < 0.8) embers(fx, tracked.at, 2, 2)
  })
}

const wildfire = (fx: Fx, haze: Haze, cast: CastValue, radius: number): void => {
  const center = cast.from
  fx.flash(at(center, 10), z(radius * 0.5), flame, 0.2)
  fx.ring(at(center), z(radius), flame, 0.35)
  // A wave of heat running out to the pyre's edge.
  fx.animate(0.45, (t) => {
    const reach = radius * easeOut(t)
    haze.add({ at: center, radius: reach, inner: 0.7, rise: 90, strength: 10 * (1 - t) })
  })
  for (let index = 0; index < 20; index++) embers(fx, around(center, radius * Math.random(), Math.random() * Math.PI * 2), 2)
}

/**
 * A pyre standing where it was cast: the floor hot under it, its
 * edge glowing, the air over it bending, embers lifting; rising as cast and
 * fading as it goes.
 */
const pyreBurning = (fx: Fx, haze: Haze, g: Shapes, glow: Shapes, center: Vec2, radius: number, rising: number, fade: number, now: number): void => {
  const alpha = rising * fade
  const foot = at(center)
  glow.fillEllipse(foot.x, foot.y, z(radius), z(radius) * projection.squash, fire, 0.05 * alpha)
  hotBand(g, glow, center, radius * 0.8, radius, alpha * (0.8 + 0.2 * Math.sin(now * 6)), now)
  haze.add({ at: center, radius, inner: 0, rise: 150, strength: 4.5 * alpha })
  if (Math.random() < 0.9 * alpha) embers(fx, around(center, radius * Math.sqrt(Math.random()), Math.random() * Math.PI * 2), 1, 1.5)
}

/** What a pyre burns coming back: embers streaming from what it struck into the one on the field. */
const pyreDrain = (fx: Fx, from: Vec2, to: Vec2): void => {
  const start = at(from, 20)
  const end = at(to, 26)
  const seconds = 0.35
  for (let index = 0; index < 3; index++) {
    fx.mote({ x: start.x + (Math.random() - 0.5) * 12, y: start.y + (Math.random() - 0.5) * 12 }, (end.x - start.x) / seconds, (end.y - start.y) / seconds, { color: index === 0 ? flame : fire, size: 3, life: seconds, gravity: 0, drag: 0, stretch: 2.5 })
  }
}

// ── The system ────────────────────────────────────────────────────────────

export const ShowSignatures = Game.System("Shooter/ShowSignatures", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), overcharged: Game.Query.optional(Overcharged), overdriven: Game.Query.optional(Overdriven) }, with: [Player] }),
    domes: Game.Query({ selection: { dome: Game.Query.read(Dome), position: Game.Query.read(Position) } }),
    pyres: Game.Query({ selection: { pyre: Game.Query.read(Pyre), position: Game.Query.read(Position) } }),
    turned: Game.Query({ selection: { turned: Game.Query.read(Turned), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } }),
    barriers: Game.Query({ selection: { barrier: Game.Query.read(Barrier) } }),
    companions: Game.Query({ selection: { companion: Game.Query.read(Companion), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  events: {
    cast: Game.System.readEvent(Cast),
    called: Game.System.readEvent(UltimateCalled),
    zap: Game.System.readEvent(Zap),
    action: Game.System.readEvent(Action),
    explosion: Game.System.readEvent(Explosion),
    hit: Game.System.readEvent(Hit)
  },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), nodes: Game.System.service(RenderNodes) }
}, ({ queries, resources, events, services }) => {
  const host = services.host
  const fx = host.fx
  const feedback = host.feedback
  const tuning = resources.tuning.get()
  const [player] = queries.player.each()
  if (player !== undefined) tracked.at = lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha)

  // As an ultimate is called up (the world standing still): those that rise off the floor first.
  const moment = tuning.ultimate.moment
  for (const called of events.called.all()) {
    if (called.skill === "thunderclap") riseAndSlam(feedback, moment, 45)
    if (called.skill === "landslide") riseAndSlam(feedback, moment, 60)
    if (called.skill === "wildfire") wildfireRise(fx, host.haze, feedback, moment)
  }

  const zaps = events.zap.all()
  for (const cast of events.cast.all()) {
    if (cast.faction !== "player" || cast.skill === null) continue
    const effect = cast.effect
    switch (cast.skill) {
      case "flareJump":
        if (effect.kind === "leap") flareJump(fx, cast, effect.radius)
        break
      case "barrage":
        if (effect.kind === "barrage") barrageVolley(fx, cast, effect.shells, effect.interval)
        if (effect.kind === "overdrive") overdriveIgnite(fx, feedback, cast, effect.radius)
        break
      case "tidalWave":
        if (effect.kind === "plunge") tidefallBounce(fx, feedback, cast, effect.rise, effect.dive)
        if (effect.kind === "nova") tidefallPlop(fx, feedback, cast, effect.radius)
        break
      case "tide":
        if (effect.kind === "companions") tidalEcho(fx, cast, effect)
        break
      case "brace":
        if (effect.kind === "dome") tideDomeRise(fx, cast, effect.radius)
        break
      case "floodgate":
        // Its lash: the zap from where she cast it.
        if (effect.kind === "turn") for (const zap of zaps) if (zap.skill === "floodgate" && zap.path[0] === cast.from && zap.path[1] !== undefined) riptideLash(fx, feedback, cast.from, zap.path[1])
        break
      case "kindle":
        if (effect.kind === "emberRing") kindle(fx, host.haze, cast, effect)
        break
      case "wildfire":
        if (effect.kind === "pyre") wildfire(fx, host.haze, cast, effect.radius)
        break
      case "sparkTotem":
        if (effect.kind === "totem") sparkTotem(fx, cast, effect.offset)
        break
      case "thunderclap":
        if (effect.kind === "thunderclap") thunderclap(fx, cast, effect.radius, zaps.filter((zap) => !zap.heal).flatMap((zap) => zap.path.slice(1)))
        break
      case "sparkStep":
        if (effect.kind === "cut") sparkStep(fx, feedback, cast, effect)
        break
      case "stormFlurry":
        if (effect.kind === "overcharge") overchargeBurst(fx, feedback, cast, effect.radius)
        break
      default:
        break
    }
  }
  for (const zap of zaps) {
    // An overcharged dash: a Spark Step of its own.
    if (zap.skill === "stormFlurry" && zap.path.length >= 2) {
      const [from, to] = [zap.path[0]!, zap.path.at(-1)!]
      const effect = tuning.skills.stormFlurry.effect
      sparkTear(fx, feedback, from, normalizeOr(sub(to, from), { x: 1, y: 0 }), Math.hypot(to.x - from.x, to.y - from.y), effect.kind === "overcharge" ? effect.dashStrike.width : 70)
    }
  }
  // Overcharged (her body glows, see `DrawPlayer`): lightning thrown out with each blow.
  if (player !== undefined && player.data.overcharged.present) {
    for (const action of events.action.all()) {
      if (action.kind === "attack" && isMelee(action.move)) overchargeBlow(fx, action.at, action.direction, action.move.reach)
    }
  }
  // Overdriven (her body glows, see `DrawPlayer`): every shot a blaze at the muzzle, spent casings flying.
  if (player !== undefined && player.data.overdriven.present) {
    for (const action of events.action.all()) {
      if (action.kind === "attack" && action.move.shape === "shot") overdriveShot(fx, action.at, action.direction)
    }
  }
  // Fire blasting from a shell or a grenade: an explosion; an overdriven shot bursting: a quick, hard pop.
  for (const blast of events.explosion.all()) {
    if (blast.faction !== "player" || blast.element !== "fire" || blast.kind !== "blast") continue
    if (blast.skill === "barrage") shotBlast(fx, feedback, blast.at, blast.radius)
    else explosion(fx, blast.at, blast.radius)
  }
  // Barriers standing: walls of wind up off the floor, streaks running up them.
  const g = host.overlay
  const now = performance.now() / 1000
  for (const { data } of queries.barriers.each()) {
    const { shape, effect, remaining } = data.barrier.get()
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const fade = Math.min(1, remaining / view.barriers.fadeSeconds)
    if (shape.kind === "wall") {
      const height = 70
      sheet(g, shape.from, shape.to, height, color, 0.14 * fade)
      const top = [at(shape.from, height), at(shape.to, height)] as const
      g.line(top[0].x, top[0].y, top[1].x, top[1].y, z(2), white, 0.35 * fade)
      for (let streak = 0; streak < 14; streak++) {
        const along = lerp(shape.from, shape.to, (streak + 0.5) / 14)
        const rise = (now * 1.3 + wobble(streak) + 1) % 1
        const low = at(along, rise * height)
        const high = at(along, Math.min(height, rise * height + 18))
        g.line(low.x, low.y, high.x, high.y, z(2.5), white, 0.6 * fade * (1 - rise))
      }
      continue
    }
    const height = 90
    cylinder(g, shape.center, shape.radius, height, color, 0.06 * fade, white, 0.3 * fade)
    // Streaks spiraling up it.
    for (let streak = 0; streak < 18; streak++) {
      const rise = (now * 0.9 + streak / 18) % 1
      const angle = now * 2.2 + (streak / 18) * Math.PI * 2 + rise * 2.5
      const low = at(around(shape.center, shape.radius, angle), rise * height)
      const high = at(around(shape.center, shape.radius, angle + 0.25), Math.min(height, rise * height + 10))
      g.line(low.x, low.y, high.x, high.y, z(2.5), white, 0.65 * fade * (1 - rise))
    }
  }
  // Riptide Bond: a thin chain from the one on the field to each enemy it holds; the snap as one goes back.
  for (const { data } of queries.turned.each()) {
    if (player === undefined) continue
    riptideChain(g, g, tracked.at, lerp(data.previous.get(), data.position.get(), services.clock.alpha), data.turned.get().remaining, now)
  }
  for (const zap of zaps) {
    if (zap.skill !== "floodgate" || zap.path.length < 2) continue
    const lash = events.cast.all().some((cast) => cast.skill === "floodgate" && cast.from === zap.path[0])
    if (!lash) riptideSnap(fx, feedback, zap.path[0]!, zap.path[1]!)
  }
  // Tide Domes over the one on the field (following her smoothly), rising as cast and fading as they go.
  for (const { data } of queries.domes.each()) {
    const { effect, remaining, faction } = data.dome.get()
    const center = faction === "player" && player !== undefined ? tracked.at : data.position.get()
    const age = effect.seconds - remaining
    dome(g, g, center, effect.radius, easeOut(clamp01(age / 0.25)), Math.min(1, remaining / 0.4), now)
  }
  // Wildfire: the pyre where it was cast, and what it burns streaming back into the one on the field.
  for (const { data } of queries.pyres.each()) {
    const { effect, remaining } = data.pyre.get()
    const center = data.position.get()
    pyreBurning(fx, host.haze, g, g, center, effect.radius, easeOut(clamp01((effect.seconds - remaining) / 0.3)), Math.min(1, remaining / 0.5), now)
  }
  for (const hit of events.hit.all()) {
    const label = hit.source?.label
    if (player !== undefined && hit.faction === "enemy" && !hit.periodic && label?.kind === "skill" && tuning.skills[label.skill].effect.kind === "pyre") pyreDrain(fx, hit.at, tracked.at)
  }
  // Tidal Echo: her echo walking after her, throwing; foam as it goes.
  const shown = new Set<number>()
  for (const { entity, data } of queries.companions.each()) {
    const companion = data.companion.get()
    const seen = companionsSeen.get(entity.id.value)
    shown.add(entity.id.value)
    companionsSeen.set(entity.id.value, { at: lerp(data.previous.get(), data.position.get(), services.clock.alpha), dealt: companion.dealt })
    const node = services.nodes.get(entity.id)
    if (node?.kind === "companion") moveCompanion(node, companion.facing, seen !== undefined && companion.dealt > seen.dealt, companion.effect.seconds - companion.remaining, companion.remaining, services.clock.frameSeconds, now)
  }
  for (const [id, seen] of companionsSeen) {
    if (shown.has(id)) continue
    companionsSeen.delete(id)
    companionGone(fx, seen.at)
  }
  for (const zap of zaps) {
    if (zap.skill !== "tide") continue
    const [from, to] = zap.path
    if (from === undefined || to === undefined) continue
    if (zap.heal) companionHeal(fx, from)
    else companionShot(fx, from, to)
  }
})
