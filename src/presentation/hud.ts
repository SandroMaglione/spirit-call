/**
 * The in-arena HUD (plain DOM): what is being played and how far the run
 * is (top left: a mark per wave), the character on the field (bottom
 * center: health and energy), the team (right: a portrait tab each), skill
 * slots, the wave banner, and the touch pad. Colors follow the element of
 * the character on the field (`data-element`).
 */
import { actionButtons, teamButtons } from "../config/input.ts"
import { bySlot, skillSlots } from "../content/skills.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { SkillSpec } from "../content/skills.ts"
import type { StateId } from "../content/elements.ts"
import { view } from "../config/view.ts"
import { Challenge, Controls, Dash, ElementState, Enemy, EnemyLevel, Energy, Flow, Game, Health, Member, PendingSpawn, Player, RenderClock, RenderHost, Run, Skills, Sounds, TeamSwitch, TouchInput, Tuning, Waves, Weapon } from "../schema.ts"
import type { SkillsValue, WavesValue } from "../schema.ts"
import type { ChallengeSpec } from "../content/challenges.ts"
import { skillRecharge } from "../features/skills.ts"
import { elementOf } from "../ui/draft.ts"
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
    hud.root.dataset["device"] = touchMode ? "touch" : "desktop"
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
    // Ready while a charge is left; otherwise waiting for the next one.
    dash: player === undefined || player.data.dash.get().charges > 0 ? 0 : player.data.dash.get().cooldown / tuning.dash.cooldown,
    ultimate: slots?.ultimate.recharge ?? 1
  }
  // Seconds left, on the buttons that wait for a cooldown (the ultimate waits for energy, the attack only a moment).
  const seconds = {
    attack: 0,
    special: player === undefined || (slots?.special.spec.cooldown ?? 0) <= 0 ? 0 : player.data.skills.get().special.cooldown,
    dash: player === undefined || player.data.dash.get().charges > 0 ? 0 : player.data.dash.get().cooldown,
    ultimate: 0
  }
  if (slots !== undefined) {
    for (const slot of skillSlots) setText(pad.buttons[slot].root.querySelector("span"), slots[slot].spec.label)
  }
  for (const name of actionButtons) {
    const zone = live.layout.buttons[name]
    const refs = pad.buttons[name]
    const state = live.buttons[name]
    place(refs.root, zone.center.x, zone.center.y, zone.radius)
    refs.root.classList.toggle("is-held", state.held)
    refs.root.classList.toggle("is-ready", fill[name] <= 0)
    refs.cooldown.style.setProperty("--cd", String(Math.max(0, Math.min(1, fill[name]))))
    setText(refs.seconds, seconds[name] > 0.05 ? seconds[name].toFixed(1) : "")
    const aim = state.aim
    refs.aim.hidden = aim === null || zone.aimRadius === undefined
    if (aim !== null && zone.aimRadius !== undefined) {
      place(refs.aim, zone.center.x + aim.x * zone.aimRadius, zone.center.y + aim.y * zone.aimRadius, 14)
    }
  }
})

/** How the HUD names the player's state. */
const stateNames: Record<StateId, string> = { burning: "BURNING", soaked: "SOAKED" }

/** A color as CSS. */
const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`

/**
 * The team, one entry per slot: her face in her color (with her switch key
 * on a keyboard, and a dot for her state), her name, and her health. The
 * one on the field stands out; a fallen one is grayed; the others dim while
 * the next switch waits, and glow gold with their ultimate ready. On touch
 * screens each face sits on its switch button.
 */
export const SyncTeam = Game.System("Shooter/SyncTeam", {
  queries: {
    members: Game.Query({
      selection: {
        member: Game.Query.read(Member),
        health: Game.Query.read(Health),
        skills: Game.Query.read(Skills),
        energy: Game.Query.read(Energy),
        state: Game.Query.read(ElementState),
        player: Game.Query.optional(Player)
      }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning), teamSwitch: Game.System.readResource(TeamSwitch), controls: Game.System.readResource(Controls) },
  services: { host: Game.System.service(RenderHost), touch: Game.System.service(TouchInput) }
}, ({ queries, resources, services }) => {
  const tuning = resources.tuning.get()
  const team = services.host.hud.team
  const touchMode = resources.controls.get().device === "touch"
  team.root.classList.toggle("is-touch", touchMode)
  const wait = resources.teamSwitch.get().cooldown
  const waiting = wait > 0
  // The switch's wait, as the share of it left (it fills each face that waits).
  team.root.style.setProperty("--wait", String(Math.min(1, wait / tuning.team.switchCooldown)))
  const members = queries.members.each()
  // A team of one has nothing to switch to.
  const shown = members.length > 1
  const layout = touchMode ? services.touch.view().layout : undefined
  team.members.forEach((refs, slot) => {
    const found = shown ? members.find(({ data }) => data.member.get().slot === slot) : undefined
    refs.root.hidden = found === undefined
    if (found === undefined) return
    const { data } = found
    const character = data.member.get().character
    const health = data.health.get()
    const fallen = health.current <= 0
    const ultimate = data.skills.get().ultimate
    const ready = skillRecharge(tuning.skills[ultimate.skill], ultimate.cooldown, data.energy.get().current) <= 0
    const state = data.state.get().current
    refs.root.classList.toggle("is-field", data.player.present)
    refs.root.classList.toggle("is-fallen", fallen)
    refs.root.classList.toggle("is-waiting", waiting && !data.player.present && !fallen)
    refs.root.classList.toggle("is-ready", ready && !fallen)
    refs.root.style.setProperty("--color", css(view.characters[character]))
    const element = elementOf(tuning, character)
    if (element === null) delete refs.root.dataset["element"]
    else refs.root.dataset["element"] = element
    if (refs.portrait.dataset["portrait"] !== character) refs.portrait.dataset["portrait"] = character
    setText(refs.face.querySelector("kbd"), String(slot + 1))
    refs.face.dataset["initial"] = tuning.characters[character].name.charAt(0)
    setText(refs.name, tuning.characters[character].name)
    refs.health.style.width = `${(100 * health.current) / health.max}%`
    refs.state.className = state === null ? "" : `team__state--${state.id}`
    // On touch, the face sits on the slot's switch button, the name and health to its left.
    const zone = layout?.buttons[teamButtons[slot]!]
    if (zone === undefined) {
      refs.root.style.removeProperty("top")
      refs.root.style.removeProperty("right")
      refs.face.style.removeProperty("width")
      refs.face.style.removeProperty("height")
      return
    }
    refs.root.style.top = `${zone.center.y - zone.radius}px`
    refs.root.style.right = `${services.host.size.width - zone.center.x - zone.radius}px`
    refs.face.style.width = refs.face.style.height = `${zone.radius * 2}px`
  })
})

/** Each slot's skill and how far it is from ready (0..1, see `skillRecharge`). */
const skillStatus = (tuning: TuningValue, skills: SkillsValue, energy: number) =>
  bySlot((slot) => {
    const spec: SkillSpec = tuning.skills[skills[slot].skill]
    return { spec, recharge: skillRecharge(spec, skills[slot].cooldown, energy) }
  })

/**
 * Progress toward a challenge's objective, in a few words: the enemies left
 * in the wave (the wave marks show which wave), or for surviving the time
 * left and the wave.
 */
const challengeProgress = (challenge: ChallengeSpec, waves: WavesValue, time: number, remaining: number): string => {
  const marked = challenge.objective.kind === "clearWaves"
  const wave = waves.number === 0
    ? "get ready"
    : waves.phase === "break" || waves.phase === "complete" ? (marked ? "cleared" : `wave ${waves.number} cleared`) : (marked ? `${remaining} left` : `wave ${waves.number} · ${remaining} left`)
  const progress = challenge.objective.kind === "survive" ? `survive ${Math.max(0, Math.ceil(challenge.objective.seconds - time))}s · ${wave}` : wave
  return progress.charAt(0).toUpperCase() + progress.slice(1)
}

/** A mark per wave of `total` (none for 0): cleared ones full, the one going on half. */
const showWaves = (marks: HTMLElement, total: number, waves: WavesValue): void => {
  while (marks.children.length < total) marks.append(document.createElement("i"))
  while (marks.children.length > total) marks.lastElementChild!.remove()
  const done = waves.phase === "break" || waves.phase === "complete" ? waves.number : waves.number - 1
  for (let index = 0; index < total; index++) {
    const mark = marks.children[index]!
    mark.className = index < done ? "is-done" : index === done && waves.number > 0 ? "is-current" : ""
  }
}

/** How much of the current move's recovery is left, 0..1. */
const recharge = (weapon: { readonly cooldown: number; readonly recovery: number }): number =>
  weapon.recovery <= 0 ? 0 : weapon.cooldown / weapon.recovery

export const SyncHud = Game.System("Shooter/SyncHud", {
  queries: {
    player: Game.Query({
      selection: { health: Game.Query.read(Health), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy), state: Game.Query.read(ElementState), member: Game.Query.read(Member) },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy) } }),
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } })
  },
  resources: {
    waves: Game.System.readResource(Waves),
    run: Game.System.readResource(Run),
    tuning: Game.System.readResource(Tuning),
    challenge: Game.System.readResource(Challenge),
    enemyLevel: Game.System.readResource(EnemyLevel)
  },
  machines: { flow: Game.System.machine(Flow) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock), sounds: Game.System.service(Sounds) }
}, ({ queries, resources, machines, services }) => {
  const hud = services.host.hud
  const waves = resources.waves.get()
  const feedback = services.host.feedback
  const tuning = resources.tuning.get()
  const challenge = tuning.challenges[resources.challenge.get()]
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
  // The HUD belongs to a run going on: hidden on the menu and on the results screen (in src/ui), which says how it went.
  const away = machines.flow.get() !== "Playing"
  if (hud.root.hidden !== away) hud.root.hidden = away

  const stats = services.host.stats
  stats.sinceHud += services.clock.frameSeconds
  if (stats.sinceHud < 0.1) return
  stats.sinceHud = 0
  const player = queries.player.singleOptional()
  const field = player.ok ? player.value?.data : undefined
  if (field !== undefined) {
    // Each slot drains as its cooldown runs down and as energy fills up.
    const slots = skillStatus(tuning, field.skills.get(), field.energy.get().current)
    for (const slot of skillSlots) {
      const refs = hud.skills[slot]
      setText(refs.root.querySelector("span"), slots[slot].spec.name)
      refs.cooldown.style.height = `${100 * slots[slot].recharge}%`
      refs.root.classList.toggle("is-ready", slots[slot].recharge <= 0)
    }
    const character = field.member.get().character
    setText(hud.name, tuning.characters[character].name)
    const element = elementOf(tuning, character)
    if ((hud.root.dataset["element"] ?? null) !== element) {
      if (element === null) delete hud.root.dataset["element"]
      else hud.root.dataset["element"] = element
    }
    const health = field.health.get()
    hud.health.style.width = `${(100 * health.current) / health.max}%`
    setText(hud.healthText, `${Math.ceil(health.current)}`)
    const ultimate = tuning.skills[field.skills.get().ultimate.skill]
    hud.energy.style.width = `${ultimate.energy <= 0 ? 100 : Math.min(100, (100 * field.energy.get().current) / ultimate.energy)}%`
  } else {
    hud.health.style.width = "0%"
    hud.energy.style.width = "0%"
    setText(hud.healthText, "")
  }
  // Her state, next to her name.
  const state = field?.state.get().current ?? null
  hud.state.hidden = state === null
  if (state !== null) {
    setText(hud.state, `${stateNames[state.id]} ${state.remaining.toFixed(1)}s`)
    hud.state.className = `hud__state hud__state--${state.id}`
  }
  // What is being played, and how far the run is: small, out of the way.
  if (!tuning.waves.enabled) {
    setText(hud.quest, "Training")
    setText(hud.progress, "")
    showWaves(hud.waves, 0, waves)
    return
  }
  const remaining = queries.enemies.each().length + queries.pending.each().length + waves.queue.length
  setText(hud.quest, challenge.name)
  showWaves(hud.waves, challenge.objective.kind === "clearWaves" ? challenge.waves.scripted.length : 0, waves)
  setText(hud.progress, challengeProgress(challenge, waves, resources.run.get().time, remaining))
})
