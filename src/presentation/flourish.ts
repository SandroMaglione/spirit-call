/**
 * The big moments of a fight, drawn over what the simulation does:
 *
 * - An ultimate's moment (see `UltimateMoment`): the camera pushes in, the
 *   world dims around her, the edges glow in her element's color, its lines
 *   turn in and its light gathers into her, building; then it goes off with
 *   a flash, a ring, a deep blast, and a shake, and its element's own
 *   release (see `release`); the skill's own look is `signatures.ts`'s.
 * - Gust's hop: wind streaming off her as she dives, and rings, streaks,
 *   and dust where she lands.
 * - Flare Jump's leap: flames trailing off her as she flies back, sparks
 *   where she lands.
 * - A volley's shells: smoke trailing behind them (where they blast is
 *   `signatures.ts`'s).
 * - A champion's roar as a phase begins (see `Roused`): a flash of its
 *   element, rings, and a long shake; and its shockwaves throwing up dust
 *   along their rings as they run out.
 */
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Airborne, Cast, Explosion, Facing, Game, Hitbox, Lobbed, Player, Position, PrevPosition, RenderClock, RenderHost, Roused, Sounds, Tuning, UltimateCalled, UltimateMoment } from "../schema.ts"
import type { ElementId } from "../content/elements.ts"
import { airborneLift, diving } from "./actors.ts"
import type { RenderHostValue } from "./host-types.ts"

const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`

/** A point on the floor as the overlay draws it (projected coordinates), `lift` pixels up. */
const screenAt = (at: Vec2, lift = 0): Vec2 => {
  const point = toScreen(projection, at)
  return { x: point.x, y: point.y - lift }
}

/** How high her body's middle shows, in pixels (for a flash on her rather than at her feet). */
const bodyLift = () => view.impact.height * projection.zoom

/**
 * How an ultimate's element goes off, on top of its flash: wind in streaks
 * whirling out, fire in embers shooting up, water thrown up and falling
 * back, thunder in bolts out of the sky, rock in grit and dust.
 */
const release = (fx: RenderHostValue["fx"], element: ElementId | null, at: Vec2, body: Vec2, color: number): void => {
  switch (element) {
    case "wind":
      for (let streak = 0; streak < 30; streak++) {
        const angle = (streak / 30) * Math.PI * 2
        const speed = 520 + Math.random() * 120
        // Out and around: each streak thrown off a turn.
        fx.mote(body, Math.cos(angle) * speed - Math.sin(angle) * 260, (Math.sin(angle) * speed + Math.cos(angle) * 260) * 0.5, { color: streak % 3 === 0 ? view.hitFlash : color, size: 3, life: 0.4, stretch: 7, drag: 3, gravity: 0 })
      }
      return
    case "fire":
      fx.burst(at, { color, count: 34, speed: 260, size: 4.5, life: 0.7, gravity: -1100, drag: 1, stretch: 5 })
      fx.burst(at, { color: view.ultimate, count: 16, speed: 200, size: 3.5, life: 0.5, gravity: -900, drag: 1, stretch: 4 })
      return
    case "water":
      for (let drop = 0; drop < 36; drop++) fx.mote(body, (Math.random() - 0.5) * 520, -380 - Math.random() * 320, { color: drop % 3 === 0 ? 0xe8f6ff : color, size: 3.5 + Math.random() * 2, life: 0.7, gravity: 1500, drag: 0.6 })
      return
    case "thunder":
      for (let bolt = 0; bolt < 3; bolt++) {
        const x = at.x + (bolt - 1) * 90 * projection.zoom
        fx.bolt([{ x: x + (Math.random() - 0.5) * 60, y: at.y - 480 * projection.zoom }, { x: x + (Math.random() - 0.5) * 40, y: at.y - 240 * projection.zoom }, { x: (x + at.x) / 2, y: at.y - 20 * projection.zoom }], color, 0.25)
      }
      fx.burst(body, { color, count: 22, speed: 560, size: 3, life: 0.35, stretch: 6, drag: 3 })
      return
    case "rock":
      fx.burst(at, { color: view.stone.light, count: 30, speed: 380, size: 7, life: 0.8, gravity: -120, drag: 3, alpha: 0.55 })
      fx.burst(body, { color: view.stone.dark, count: 20, speed: 520, size: 5, life: 0.6, gravity: 1200 })
      return
    default:
      fx.burst(body, { color, count: 26, speed: 520, size: 4, life: 0.5, stretch: 5, drag: 2 })
  }
}

export const ShowUltimateMoments = Game.System("Shooter/ShowUltimateMoments", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) }, with: [Player] }) },
  resources: { moment: Game.System.readResource(UltimateMoment), tuning: Game.System.readResource(Tuning) },
  events: { called: Game.System.readEvent(UltimateCalled), cast: Game.System.readEvent(Cast) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), sounds: Game.System.service(Sounds) }
}, ({ queries, resources, events, services }) => {
  const host = services.host
  const feedback = host.feedback
  const refs = host.hud.moment
  const spec = view.ultimateMoment
  const tuning = resources.tuning.get()
  const seconds = services.clock.frameSeconds
  for (const called of events.called.all()) {
    refs.style.setProperty("--el", css(view.elements[tuning.characters[called.character].element]))
    services.sounds.play("ultimateCall")
  }
  const moment = resources.moment.get()
  const [player] = queries.player.each()
  if (moment.cast !== null && moment.seconds > 0) {
    // Pushed in quickly, then held until it goes off.
    const build = 1 - moment.remaining / moment.seconds
    const t = Math.min(1, build * 1.6)
    feedback.moment = Math.max(feedback.moment, 1 - (1 - t) ** 3)
    refs.style.setProperty("--build", build.toFixed(3))
    // Her element's light drawn in toward her from all around.
    if (player !== undefined && moment.character !== null) {
      const color = view.elements[tuning.characters[moment.character].element]
      const body = screenAt(player.data.position.get(), bodyLift())
      const count = Math.floor(spec.gather * seconds + Math.random())
      for (let index = 0; index < count; index++) {
        const angle = Math.random() * Math.PI * 2
        const reach = 110 + Math.random() * 90
        const life = 0.3 + Math.random() * 0.15
        const from = { x: body.x + Math.cos(angle) * reach, y: body.y + Math.sin(angle) * reach * 0.6 }
        host.fx.mote(from, (body.x - from.x) / life, (body.y - from.y) / life, { color, size: 2.5 + Math.random() * 2.5, life, stretch: 4 })
      }
    }
  } else feedback.moment = Math.max(0, feedback.moment - seconds / spec.release)
  refs.style.opacity = feedback.moment.toFixed(3)
  // It goes off: a flash on her, rings out across the floor, streaks, a deep blast, and a shake.
  for (const cast of events.cast.all()) {
    if (cast.called !== true) continue
    const element = cast.effect.element
    const color = element === null ? view.ultimate : view.elements[element]
    const at = screenAt(cast.from)
    const body = screenAt(cast.from, bodyLift())
    host.fx.flash(body, spec.flash, view.hitFlash, 0.18)
    host.fx.flash(body, spec.flash * 1.4, color, 0.35)
    host.fx.ring(at, 200 * projection.zoom, color, 0.5)
    release(host.fx, element, at, body, color)
    feedback.shake = Math.max(feedback.shake, spec.shake)
    feedback.punch = Math.max(feedback.punch, 1.2)
    services.sounds.play("ultimateRelease")
  }
})

export const ShowAirborne = Game.System("Shooter/ShowAirborne", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), facing: Game.Query.read(Facing), airborne: Game.Query.optional(Airborne) },
      with: [Player]
    }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } })
  },
  events: { cast: Game.System.readEvent(Cast), explosion: Game.System.readEvent(Explosion) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, events, services }) => {
  const host = services.host
  const fx = host.fx
  const seconds = services.clock.frameSeconds
  const [player] = queries.player.each()
  if (player !== undefined && player.data.airborne.present) {
    const airborne = player.data.airborne.get()
    const at = player.data.position.get()
    const lift = airborneLift(airborne)
    if (airborne.kind === "plunge" && diving(airborne)) {
      // Diving: her element (wind for the Gust, water for the Tidefall) streaming off her, back along where she came from.
      const body = screenAt(at, lift * projection.zoom + bodyLift() * 0.5)
      const back = normalizeOr(toScreen(projection, { x: -(airborne.dive?.velocity.x ?? 0), y: -(airborne.dive?.velocity.y ?? 0) }), { x: 0, y: -1 })
      const element = airborne.landing[0]?.effect.element ?? "wind"
      const trail = element === null ? view.elements.wind : view.elements[element]
      if (element === "water") {
        // Water does not stream like wind: drops shaken off her, falling with her.
        const count = Math.floor(160 * seconds + Math.random())
        for (let index = 0; index < count; index++) {
          fx.mote({ x: body.x + (Math.random() - 0.5) * 22, y: body.y + (Math.random() - 0.5) * 16 }, (Math.random() - 0.5) * 160, -60 - Math.random() * 80, { color: Math.random() < 0.3 ? view.hitFlash : trail, size: 3 + Math.random() * 2, life: 0.3, gravity: 1200, drag: 0.5 })
        }
      } else {
        const count = Math.floor(520 * seconds + Math.random())
        for (let index = 0; index < count; index++) {
          const from = { x: body.x + (Math.random() - 0.5) * 14, y: body.y + (Math.random() - 0.5) * 14 }
          fx.mote(from, back.x * 260 + (Math.random() - 0.5) * 40, back.y * 260 - 60 * Math.random(), { color: Math.random() < 0.3 ? view.hitFlash : trail, size: 2.5 + Math.random() * 2.5, life: 0.22, stretch: 6, drag: 4 })
        }
      }
    } else if (airborne.kind === "leap") {
      // Flames trailing off her as she flies.
      const body = screenAt(at, lift * projection.zoom + bodyLift() * 0.5)
      const count = Math.floor(90 * seconds + Math.random())
      for (let index = 0; index < count; index++) {
        fx.mote({ x: body.x + (Math.random() - 0.5) * 14, y: body.y + (Math.random() - 0.5) * 10 }, (Math.random() - 0.5) * 40, -40 - Math.random() * 60, { color: Math.random() < 0.4 ? view.ultimate : view.elements.fire, size: 3 + Math.random() * 3, life: 0.35, gravity: -120, drag: 2 })
      }
    }
  }
  // What lands: Gust's blast, as rings of wind, streaks thrown out all around, and dust.
  for (const cast of events.cast.all()) {
    if (cast.landing !== true || cast.effect.kind !== "blast") continue
    const at = screenAt(cast.from)
    const color = cast.effect.element === null ? view.playerArea : view.elements[cast.effect.element]
    fx.ring(at, cast.effect.radius * projection.zoom, color, 0.4)
    fx.ring(at, cast.effect.radius * 0.55 * projection.zoom, view.hitFlash, 0.3)
    fx.flash(at, 34, view.hitFlash, 0.12)
    fx.burst(at, { color, count: 34, speed: 560, size: 3.5, life: 0.4, stretch: 6, drag: 4 })
    for (let index = 0; index < 12; index++) fx.dust(at, { x: Math.cos(index * 0.52), y: Math.sin(index * 0.52) }, 0xd8d2c4)
    host.feedback.shake = Math.max(host.feedback.shake, 9)
    host.feedback.punch = Math.max(host.feedback.punch, 0.8)
  }
  // A volley's shells trail smoke on their way up and over.
  for (const { data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    if (lobbed.faction !== "player" || lobbed.elapsed < 0 || lobbed.elapsed >= lobbed.effect.flightTime || Math.random() > seconds * 40) continue
    const flight = lobbed.elapsed / lobbed.effect.flightTime
    const ground = { x: lobbed.from.x + (lobbed.to.x - lobbed.from.x) * flight, y: lobbed.from.y + (lobbed.to.y - lobbed.from.y) * flight }
    const at = screenAt(ground, (4 * view.grenadeArc * flight * (1 - flight) + 6) * projection.zoom)
    fx.mote(at, (Math.random() - 0.5) * 20, -10 - Math.random() * 15, { color: 0x6b6470, size: 4 + Math.random() * 3, life: 0.5, gravity: -30, drag: 2, alpha: 0.5 })
  }
})

export const ShowChampions = Game.System("Shooter/ShowChampions", {
  queries: {
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } })
  },
  events: { roused: Game.System.readEvent(Roused) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), sounds: Game.System.service(Sounds) }
}, ({ queries, events, services }) => {
  const host = services.host
  const fx = host.fx
  const spec = view.champion.roar
  // It roars: a flash of its element, rings out across the floor, sparks, and a long shake.
  for (const roused of events.roused.all()) {
    const color = roused.element === null ? view.telegraphLocked : view.elements[roused.element]
    const at = screenAt(roused.at)
    const body = screenAt(roused.at, bodyLift() * 1.6)
    host.fx.flash(body, spec.flash, view.hitFlash, 0.2)
    host.fx.flash(body, spec.flash * 1.5, color, 0.45)
    for (let ring = 0; ring < 3; ring++) fx.ring(at, (180 + ring * 110) * projection.zoom, color, 0.45 + ring * 0.15)
    fx.burst(body, { color, count: 40, speed: 620, size: 4.5, life: 0.6, stretch: 5, drag: 2 })
    host.feedback.shake = Math.max(host.feedback.shake, spec.shake)
    host.feedback.punch = Math.max(host.feedback.punch, 1.4)
    services.sounds.play("ultimateRelease")
  }
  // A shockwave on its way out: dust thrown up along its ring.
  const seconds = services.clock.frameSeconds
  for (const { data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    if (hitbox.grows === undefined || hitbox.area.kind !== "ring" || hitbox.area.radius <= 0) continue
    const area = hitbox.area
    const count = Math.floor(area.radius * spec.dust * seconds + Math.random())
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2
      const out = { x: Math.cos(angle), y: Math.sin(angle) }
      const from = screenAt({ x: area.center.x + out.x * area.radius, y: area.center.y + out.y * area.radius })
      fx.dust(from, normalizeOr(toScreen(projection, out), { x: 0, y: -1 }), view.champion.roar.dustColor)
    }
  }
})
