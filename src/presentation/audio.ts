/**
 * Sounds for what happened since the last frame, panned by where it happened
 * on screen.
 */
import type { AttackMove } from "../content/attacks.ts"
import type { SkillEffect } from "../content/skills.ts"
import { projection, viewZoom } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import type { Vec2 } from "../math/vec.ts"
import { Action, Broke, Camera, PerfectDodged, Cast, Death, Explosion, Game, Hit, Impact, Reaction, RenderHost, Sounds, Zap, GuardBlocked } from "../schema.ts"
import type { StateId } from "../content/elements.ts"
import type { ReactionKind } from "../schema.ts"
import type { SoundName } from "./sound.ts"

/** The sound of each kind of move. It climbs in pitch through the combo (`comboPitchStep` per move); a power move goes deeper. */
const moveSounds: Record<AttackMove["shape"], SoundName> = { arc: "slash", thrust: "thrust", spin: "spin", shot: "shot", disc: "disc", lob: "throw" }
const comboPitchStep = 0.067
const powerPitch = 0.85

/** The sound of using a skill, by its effect (a nova sounds as it goes off: see `Explosion`; a volley as its shells land). */
const castSounds: Record<SkillEffect["kind"], SoundName | null> = { cut: "wave", blast: "wave", leap: "boom", lob: "throw", nova: null, vortex: "spin", barrage: "throw", totem: "throw", thunderclap: null, guard: "crack", rockfall: "crack" }

/** The sound of a state taking hold (a charge and a sweep are heard in their blow), and of each state bursting. */
const applySounds: Record<StateId, SoundName | null> = { burning: "ignite", soaked: "splash", charged: null, swept: null, cracked: "crack" }
const burstSounds: Record<StateId, SoundName> = { burning: "nova", soaked: "splash", charged: "zap", swept: "spin", cracked: "shatter" }

/** The sound of what elements do (an arc is heard as its zap). */
const reactionSound = (kind: ReactionKind, state: StateId | null): SoundName | null => {
  switch (kind) {
    case "apply":
      return state === null ? null : applySounds[state]
    case "burst":
      return state === null ? null : burstSounds[state]
    case "slam":
      return "slam"
    case "out":
      return "sizzle"
    case "arc":
      return null
  }
}

/**
 * Sounds for what happened since the last frame: the player's actions (each
 * combo move its own swing), blows landing (heavier for heavy blows and
 * kills, harsh when the player is hit), explosions, blows turned by shields,
 * a character falling, and switches. Each is panned by where it happened on
 * screen.
 */
export const PlaySounds = Game.System("Shooter/PlaySounds", {
  events: {
    action: Game.System.readEvent(Action),
    cast: Game.System.readEvent(Cast),
    hit: Game.System.readEvent(Hit),
    death: Game.System.readEvent(Death),
    broke: Game.System.readEvent(Broke),
    perfect: Game.System.readEvent(PerfectDodged),
    impact: Game.System.readEvent(Impact),
    explosion: Game.System.readEvent(Explosion),
    reaction: Game.System.readEvent(Reaction),
    zap: Game.System.readEvent(Zap),
    blocked: Game.System.readEvent(GuardBlocked)
  },
  resources: { camera: Game.System.readResource(Camera) },
  services: { sounds: Game.System.service(Sounds), host: Game.System.service(RenderHost) }
}, ({ events, resources, services }) => {
  const sounds = services.sounds
  const camera = resources.camera.get()
  const screen = services.host.size
  const zoom = viewZoom(screen)
  /** Left-right position on screen, softened so nothing plays fully in one ear. */
  const pan = (at: Vec2): number => {
    const x = toScreen(projection, { x: at.x - camera.x, y: at.y - camera.y }).x * zoom
    return Math.max(-1, Math.min(1, x / (screen.width / 2))) * 0.6
  }
  for (const block of events.blocked.all()) sounds.play("block", { volume: .8, pan: pan(block.at) })
  for (const action of events.action.all()) {
    if (action.kind === "attack") {
      sounds.play(moveSounds[action.move.shape], { pitch: action.power ? powerPitch : 1 + action.step * comboPitchStep })
      if (action.power) sounds.play("power")
    } else if (action.kind === "switch") {
      // A fall is heard through the death; the one coming in after it, softer.
      sounds.play("switch", { volume: action.fell ? 0.6 : 1 })
    } else if (action.kind !== "fall") sounds.play(action.kind)
  }
  for (const cast of events.cast.all()) {
    const sound = castSounds[cast.effect.kind]
    if (sound !== null) sounds.play(sound, { pan: pan(cast.from) })
  }
  // Thunder crackles as it strikes; a healing zap chimes.
  for (const zap of events.zap.all()) sounds.play(zap.heal ? "mend" : "zap", { pan: pan(zap.path[zap.path.length - 1] ?? zap.path[0]!), volume: zap.heal ? 0.7 : 0.8 })
  for (const reaction of events.reaction.all()) {
    const sound = reactionSound(reaction.kind, reaction.state)
    if (sound !== null) sounds.play(sound, { pan: pan(reaction.at), volume: reaction.kind === "out" ? 0.5 : 1 })
  }
  for (const hit of events.hit.all()) {
    // Burns are heard through their crackle, not as blows.
    if (hit.periodic) continue
    if (hit.faction === "player") sounds.play("hurt")
    else sounds.play(hit.killed ? "kill" : hit.heavy ? "heavyHit" : "hit", { pan: pan(hit.at) })
  }
  for (const death of events.death.all()) {
    if (death.faction === "player") sounds.play("death")
  }
  for (const broke of events.broke.all()) sounds.play("slam", { pan: pan(broke.at) })
  for (const perfect of events.perfect.all()) sounds.play("charged", { pan: pan(perfect.at) })
  for (const impact of events.impact.all()) {
    if (impact.shielded) sounds.play("block", { pan: pan(impact.at) })
  }
  // An ultimate's deep boom; lighter blasts (a grenade, an aspect's shockwave) a shorter one; water bursts with a splash, thunder crackles.
  for (const explosion of events.explosion.all()) {
    const light = explosion.element === "water" ? "splash" : explosion.element === "thunder" ? "zap" : "boom"
    // A rock erupting: a deep quake and gravel.
    if (explosion.kind === "eruption") sounds.play("quake", { pan: pan(explosion.at) })
    else sounds.play(explosion.kind === "nova" && explosion.heavy ? "nova" : light, { pan: pan(explosion.at) })
  }
})
