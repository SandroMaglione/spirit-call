/**
 * The in-arena HUD (plain DOM): health, dash, challenge progress, skill
 * slots, the wave banner, and the touch pad.
 */
import { touchButtons } from "../config/input.ts"
import { skillSlots } from "../content/skills.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { SkillSpec } from "../content/skills.ts"
import { Build, Challenge, Controls, Dash, Enemy, Energy, Flow, Game, Health, PendingSpawn, Player, RenderClock, RenderHost, Run, Skills, Sounds, Stats, TouchInput, Tuning, Waves, Weapon } from "../schema.ts"
import type { SkillsValue, WavesValue } from "../schema.ts"
import type { ChallengeSpec } from "../content/challenges.ts"
import { bySlot, skillRecharge } from "../features/skills.ts"
import { resolveBuild } from "../features/build.ts"
import { setText } from "./draw.ts"

/**
 * The on-screen touch controls: the stick under the thumb (or a faint hint
 * where it usually is), the buttons with their cooldowns, and the drag marker
 * of an aiming button. Keyboard-only HUD parts hide while playing by touch.
 */
export const SyncTouchPad = Game.System("Shooter/SyncTouchPad", {
  queries: {
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy), weapon: Game.Query.read(Weapon) }, with: [Player] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), touch: Game.System.service(TouchInput) }
}, ({ queries, resources, services }) => {
  const hud = services.host.hud
  const pad = hud.pad
  const touchMode = resources.controls.get().device === "touch"
  if (pad.root.hidden === touchMode) {
    pad.root.hidden = !touchMode
    for (const element of hud.desktopOnly) element.hidden = touchMode
  }
  if (!touchMode) return
  const live = services.touch.view()
  const place = (element: HTMLElement, x: number, y: number, radius: number) => {
    element.style.transform = `translate(${x - radius}px, ${y - radius}px)`
    element.style.width = element.style.height = `${radius * 2}px`
  }
  const stickRadius = live.layout.stick.radius
  if (live.stick === null) {
    // Where the thumb usually rests: a hint of the floating stick.
    const region = live.layout.stick.region
    const rest = { x: region.left + stickRadius * 2, y: region.top + region.height - stickRadius * 2 }
    place(pad.stick, rest.x, rest.y, stickRadius)
    place(pad.knob, stickRadius, stickRadius, stickRadius * 0.45)
    pad.stick.classList.remove("is-active")
  } else {
    place(pad.stick, live.stick.origin.x, live.stick.origin.y, stickRadius)
    place(pad.knob, stickRadius + live.stick.knob.x - live.stick.origin.x, stickRadius + live.stick.knob.y - live.stick.origin.y, stickRadius * 0.45)
    pad.stick.classList.add("is-active")
  }

  const tuning = resources.tuning.get()
  const [player] = queries.player.each()
  const slots = player === undefined ? undefined : skillStatus(tuning, player.data.skills.get(), player.data.energy.get().current)
  const fill = {
    // The attack recharges between moves.
    attack: player === undefined ? 0 : recharge(player.data.weapon.get()),
    special: slots?.special.recharge ?? 0,
    dash: player === undefined ? 0 : player.data.dash.get().cooldown / tuning.dash.cooldown,
    ultimate: slots?.ultimate.recharge ?? 1
  }
  if (slots !== undefined) {
    for (const slot of skillSlots) setText(pad.buttons[slot].root.querySelector("span"), slots[slot].spec.label)
  }
  for (const name of touchButtons) {
    const zone = live.layout.buttons[name]
    const refs = pad.buttons[name]
    const state = live.buttons[name]
    place(refs.root, zone.center.x, zone.center.y, zone.radius)
    refs.root.classList.toggle("is-held", state.held)
    refs.root.classList.toggle("is-ready", fill[name] <= 0)
    refs.cooldown.style.height = `${Math.max(0, Math.min(100, fill[name] * 100))}%`
    const aim = state.aim
    refs.aim.hidden = aim === null || zone.aimRadius === undefined
    if (aim !== null && zone.aimRadius !== undefined) {
      place(refs.aim, zone.center.x + aim.x * zone.aimRadius, zone.center.y + aim.y * zone.aimRadius, 14)
    }
  }
})

/** Each slot's skill and how far it is from ready (0..1, see `skillRecharge`). */
const skillStatus = (tuning: TuningValue, skills: SkillsValue, energy: number) =>
  bySlot((slot) => {
    const spec: SkillSpec = tuning.skills[skills[slot].skill]
    return { spec, recharge: skillRecharge(spec, skills[slot].cooldown, energy) }
  })

/** Progress toward a challenge's objective, for the HUD: the wave out of the total, or the time left to survive. */
const challengeProgress = (challenge: ChallengeSpec, waves: WavesValue, time: number, remaining: number): string => {
  const total = challenge.objective.kind === "clearWaves" ? `/${challenge.waves.scripted.length}` : ""
  const wave = waves.number === 0
    ? "get ready"
    : waves.phase === "break" || waves.phase === "complete" ? `wave ${waves.number}${total} cleared` : `wave ${waves.number}${total} · ${remaining} left`
  return challenge.objective.kind === "survive" ? `survive ${Math.max(0, Math.ceil(challenge.objective.seconds - time))}s · ${wave}` : wave
}

/** How much of the current move's recovery is left, 0..1. */
const recharge = (weapon: { readonly cooldown: number; readonly recovery: number }): number =>
  weapon.recovery <= 0 ? 0 : weapon.cooldown / weapon.recovery

export const SyncHud = Game.System("Shooter/SyncHud", {
  queries: {
    player: Game.Query({ selection: { dash: Game.Query.read(Dash), health: Game.Query.read(Health), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: {
    stats: Game.System.readResource(Stats),
    waves: Game.System.readResource(Waves),
    run: Game.System.readResource(Run),
    tuning: Game.System.readResource(Tuning),
    build: Game.System.readResource(Build),
    challenge: Game.System.readResource(Challenge)
  },
  machines: { flow: Game.System.machine(Flow) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), sounds: Game.System.service(Sounds) }
}, ({ queries, resources, machines, services }) => {
  const hud = services.host.hud
  const waves = resources.waves.get()
  const feedback = services.host.feedback
  const challenge = resources.tuning.get().challenges[resources.challenge.get()]
  if (waves.number !== feedback.bannerWave) {
    feedback.bannerWave = waves.number
    if (waves.number > 0) {
      services.sounds.play("waveStart")
      hud.banner.textContent = challenge.objective.kind === "clearWaves" ? `WAVE ${waves.number} / ${challenge.waves.scripted.length}` : `WAVE ${waves.number}`
      hud.banner.classList.remove("is-showing")
      void hud.banner.offsetWidth // restart the CSS animation
      hud.banner.classList.add("is-showing")
    }
  }
  // The HUD belongs to the arena: hidden while the menu is open (the results screen is in src/ui).
  const inMenu = machines.flow.get() === "Menu"
  if (hud.root.hidden !== inMenu) hud.root.hidden = inMenu

  const stats = services.host.stats
  stats.sinceHud += services.clock.frameSeconds
  if (stats.sinceHud < 0.1) return
  stats.sinceHud = 0
  const player = queries.player.singleOptional()
  const dash = player.ok && player.value !== undefined ? player.value.data.dash.get() : undefined
  const health = player.ok && player.value !== undefined ? player.value.data.health.get() : { current: 0, max: resolveBuild(resources.tuning.get(), resources.build.get()).stats.hp }
  if (player.ok && player.value !== undefined) {
    // Each slot drains as its cooldown runs down and as energy fills up.
    const slots = skillStatus(resources.tuning.get(), player.value.data.skills.get(), player.value.data.energy.get().current)
    for (const slot of skillSlots) {
      const refs = hud.skills[slot]
      setText(refs.root.querySelector("span"), slots[slot].spec.name)
      refs.cooldown.style.height = `${100 * slots[slot].recharge}%`
      refs.root.classList.toggle("is-ready", slots[slot].recharge <= 0)
    }
  }
  hud.health.style.width = `${(100 * health.current) / health.max}%`
  hud.healthText.textContent = `${Math.ceil(health.current)} / ${health.max}`
  const remaining = queries.enemies.each().length + queries.pending.each().length + waves.queue.length
  hud.wave.textContent = !resources.tuning.get().waves.enabled
    ? "training"
    : `${challenge.name} · ${challengeProgress(challenge, waves, resources.run.get().time, remaining)}`
  hud.dash.textContent = dash === undefined ? "" : dash.cooldown <= 0 ? "DASH ready" : `DASH ${dash.cooldown.toFixed(2)}s`
  const combat = resources.stats.get()
  hud.combat.textContent = `kills ${combat.kills} · shots ${combat.shots}`
  hud.stats.textContent = `${stats.fps.toFixed(0)} fps · sim ${stats.simMs.toFixed(1)}ms · draw ${stats.drawMs.toFixed(1)}ms · ${services.host.actors.children.length} nodes · ${services.host.fx.active + services.host.trails.active} fx`
})
