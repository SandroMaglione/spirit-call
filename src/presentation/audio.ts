/**
 * Sounds for what happened since the last frame, panned by where it happened
 * on screen.
 */
import type { AttackMove } from "../content/attacks.ts"
import type { SkillEffect } from "../content/skills.ts"
import { projection, viewZoom } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import type { Vec2 } from "../math/vec.ts"
import { Action, Camera, Cast, Death, Explosion, Game, Hit, Impact, RenderHost, Sounds } from "../schema.ts"
import type { SoundName } from "./sound.ts"

/** The sound of each kind of move. It climbs in pitch through the combo (`comboPitchStep` per move); a power move goes deeper. */
const moveSounds: Record<AttackMove["shape"], SoundName> = { arc: "slash", thrust: "thrust", spin: "spin", shot: "shot" }
const comboPitchStep = 0.067
const powerPitch = 0.85

/** The sound of using a skill, by its effect (a nova sounds as it goes off: see `Explosion`). */
const castSounds: Record<SkillEffect["kind"], SoundName | null> = { cut: "wave", lob: "throw", nova: null }

/**
 * Sounds for what happened since the last frame: the player's actions (each
 * combo move its own swing), blows landing (heavier for heavy blows and
 * kills, harsh when the player is hit), explosions, blows turned by shields,
 * and the player's death. Each is panned by where it happened on screen.
 */
export const PlaySounds = Game.System("Shooter/PlaySounds", {
  events: {
    action: Game.System.readEvent(Action),
    cast: Game.System.readEvent(Cast),
    hit: Game.System.readEvent(Hit),
    death: Game.System.readEvent(Death),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion)
  },
  resources: { camera: Game.System.readResource(Camera) },
  services: { sounds: Game.System.service(Sounds), host: Game.System.service(RenderHost) }
}, ({ events, resources, services }) => {
  const sounds = services.sounds
  const camera = resources.camera.get()
  const screen = services.host.app.screen
  const zoom = viewZoom(screen)
  /** Left-right position on screen, softened so nothing plays fully in one ear. */
  const pan = (at: Vec2): number => {
    const x = toScreen(projection, { x: at.x - camera.x, y: at.y - camera.y }).x * zoom
    return Math.max(-1, Math.min(1, x / (screen.width / 2))) * 0.6
  }
  for (const action of events.action.all()) {
    if (action.kind === "attack") {
      sounds.play(moveSounds[action.move.shape], { pitch: action.power ? powerPitch : 1 + action.step * comboPitchStep })
      if (action.power) sounds.play("power")
    } else sounds.play(action.kind)
  }
  for (const cast of events.cast.all()) {
    const sound = castSounds[cast.effect.kind]
    if (sound !== null) sounds.play(sound, { pan: pan(cast.from) })
  }
  for (const hit of events.hit.all()) {
    if (hit.faction === "player") sounds.play("hurt")
    else sounds.play(hit.killed ? "kill" : hit.heavy ? "heavyHit" : "hit", { pan: pan(hit.at) })
  }
  for (const death of events.death.all()) {
    if (death.faction === "player") sounds.play("death")
  }
  for (const impact of events.impact.all()) {
    if (impact.shielded) sounds.play("block", { pan: pan(impact.at) })
  }
  // The Nova's deep boom; lighter blasts (a grenade, a weapon's shockwave) a shorter one.
  for (const explosion of events.explosion.all()) sounds.play(explosion.kind === "nova" && explosion.heavy ? "nova" : "boom", { pan: pan(explosion.at) })
})
