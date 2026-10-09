/**
 * The in-arena HUD (plain DOM): the menu button (top left), what is being
 * played and how far the run is (top center: a mark per wave), the
 * character on the field (bottom center: a thin health bar), the team
 * (right: a row each, as Genshin's party list), skill slots, the wave
 * banner, and the touch pad (icons; the ultimate's button fills with
 * energy). Colors follow the element of
 * the character on the field (`data-element`).
 */
import { actionButtons, drawnShare, partyLayout, stickRest, touchLayout } from "../config/input.ts"
import { bySlot, skillSlots } from "../content/skills.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import type { SkillSpec } from "../content/skills.ts"
import { view } from "../config/view.ts"
import { Challenge, Controls, Dash, ElementState, EnemyLevel, Energy, Flow, Game, Health, Hit, Member, Player, RenderClock, RenderHost, Run, Skills, Sounds, Stats, TeamSwitch, TouchInput, Tuning, Waves, BasicAttack } from "../schema.ts"
import type { SkillsValue, WavesValue } from "../schema.ts"
import type { ChallengeSpec } from "../content/challenges.ts"
import { dashOf } from "../features/build.ts"
import { skillRecharge } from "../features/skills.ts"
import { elementOf } from "../ui/draft.ts"
import { setText } from "./draw.ts"
import { skillIcons, stateIcons, classIcons } from "./icons.ts"

/**
 * The on-screen touch controls: the stick under the thumb (or a faint hint
 * where it usually is), the buttons with their cooldowns, and the drag marker
 * of an aiming button. Keyboard-only HUD parts hide while playing by touch.
 */
export const SyncTouchPad = Game.System("Shooter/SyncTouchPad", {
  queries: {
    player: Game.Query({
      selection: { dash: Game.Query.read(Dash), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy), basicAttack: Game.Query.read(BasicAttack), member: Game.Query.read(Member) },
      with: [Player]
    })
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
  // Input refreshes its hit regions on the next touch. At rest, draw the
  // current viewport immediately so rotation never leaves buttons offscreen.
  const layout = live.stick !== null || actionButtons.some((name) => live.buttons[name].held)
    ? live.layout : touchLayout(services.host.size, services.host.safeArea())
  const place = (element: HTMLElement, x: number, y: number, radius: number) => {
    element.style.transform = `translate(${x - radius}px, ${y - radius}px)`
    element.style.width = element.style.height = `${radius * 2}px`
  }
  const stickRadius = layout.stick.radius
  if (live.stick === null) {
    // Where the thumb usually rests: a hint of the floating stick.
    const rest = stickRest(services.host.size, services.host.safeArea())
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
    attack: player === undefined ? 0 : recharge(player.data.basicAttack.get()),
    special: slots?.special.recharge ?? 0,
    // Ready while a charge is left; otherwise waiting for the next one.
    dash: player === undefined || player.data.dash.get().charges > 0 ? 0 : player.data.dash.get().cooldown / dashOf(tuning, player.data.member.get().character).cooldown,
    ultimate: slots?.ultimate.recharge ?? 1
  }
  // Seconds left, on the buttons that wait for a cooldown (the ultimate waits for energy, the attack only a moment).
  const seconds = {
    attack: 0,
    special: player === undefined || (slots?.special.spec.cooldown ?? 0) <= 0 ? 0 : player.data.skills.get().special.cooldown,
    dash: player === undefined || player.data.dash.get().charges > 0 ? 0 : player.data.dash.get().cooldown,
    ultimate: player === undefined ? 0 : player.data.skills.get().ultimate.cooldown
  }
  // Icons: the attack's by her class, the skills' by the skill in each slot.
  if (player !== undefined) {
    showIcon(pad.buttons.attack.icon, classIcons, tuning.characters[player.data.member.get().character].class)
    for (const slot of skillSlots) showIcon(pad.buttons[slot].icon, skillIcons, player.data.skills.get()[slot].skill)
  }
  for (const name of actionButtons) {
    const zone = layout.buttons[name]
    const refs = pad.buttons[name]
    const state = live.buttons[name]
    place(refs.root, zone.center.x, zone.center.y, zone.radius * (drawnShare[name] ?? 1))
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

/** Shows `icons[id]` in `place`, touching the page only when it changes. */
const showIcon = <Id extends string>(place: HTMLElement, icons: { readonly [K in Id]: string }, id: Id): void => {
  if (place.dataset["icon"] === id) return
  place.dataset["icon"] = id
  place.innerHTML = icons[id]
}

/** A color as CSS. */
const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`

/**
 * The team, a row per slot as Genshin's party list: her name and health,
 * and her face in her color (with her switch key on a keyboard, and a dot
 * for her state). The one on the field stands out; a fallen one is grayed;
 * the others fill dark while the next switch waits, and show their
 * ultimate's icon once it is ready. On touch screens each face sits on its
 * switch button.
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
  const rows = touchMode ? partyLayout(services.host.size, services.host.safeArea()) : undefined
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
    // Her ultimate's icon left of her row once it is ready, as Genshin's: worth switching to her.
    showIcon(refs.burst, skillIcons, ultimate.skill)
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
    // On touch, as Genshin's party list: the rows down the right side, each face at its row's place.
    const zone = rows?.[slot]
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
 * Progress toward a challenge's objective, in a few characters, for the
 * objectives the wave marks do not show: for lasting until the fall the wave against the goal (then the wave alone,
 * past it), and practice the enemies defeated. Clearing waves shows its marks only;
 * training, nothing.
 */
const challengeProgress = (challenge: ChallengeSpec, waves: WavesValue, kills: number): string => {
  const objective = challenge.objective
  switch (objective.kind) {
    case "clearWaves":
      return ""
    case "endure":
      return waves.number <= objective.goal ? `Wave ${waves.number} / ${objective.goal}` : `Wave ${waves.number}`
    case "training":
      return ""
    case "practice":
      return `${kills} defeated`
  }
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
const recharge = (attack: { readonly cooldown: number; readonly recovery: number }): number =>
  attack.recovery <= 0 ? 0 : attack.cooldown / attack.recovery

export const SyncHud = Game.System("Shooter/SyncHud", {
  queries: {
    player: Game.Query({
      selection: { health: Game.Query.read(Health), skills: Game.Query.read(Skills), energy: Game.Query.read(Energy), state: Game.Query.read(ElementState), member: Game.Query.read(Member) },
      with: [Player]
    })
  },
  resources: {
    waves: Game.System.readResource(Waves),
    run: Game.System.readResource(Run),
    tuning: Game.System.readResource(Tuning),
    challenge: Game.System.readResource(Challenge),
    enemyLevel: Game.System.readResource(EnemyLevel),
    stats: Game.System.readResource(Stats)
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
    const element = elementOf(tuning, field.member.get().character)
    if ((hud.root.dataset["element"] ?? null) !== element) {
      if (element === null) delete hud.root.dataset["element"]
      else hud.root.dataset["element"] = element
    }
    const health = field.health.get()
    hud.health.style.width = `${(100 * health.current) / health.max}%`
    setText(hud.healthText, `${Math.ceil(health.current)} / ${Math.ceil(health.max)}`)
  } else {
    hud.health.style.width = "0%"
    setText(hud.healthText, "")
  }
  // Her state, as Genshin's: its icon over the left end of her health bar, a ring inside it running down with its time.
  const state = field?.state.get().current ?? null
  const clock = services.host.feedback.stateClock
  hud.state.hidden = state === null
  if (state === null) clock.id = null
  else {
    if (clock.id !== state.id || state.remaining > clock.full) {
      clock.id = state.id
      clock.full = state.remaining
    }
    showIcon(hud.state, stateIcons, state.id)
    hud.state.className = `hud__state hud__state--${state.id}`
    hud.state.style.setProperty("--left", String(clock.full <= 0 ? 0 : Math.min(1, state.remaining / clock.full)))
  }
  // What is being played, and how far the run is: small, out of the way.
  if (!tuning.waves.enabled) {
    setText(hud.quest, "Training")
    setText(hud.progress, "")
    showWaves(hud.waves, 0, waves)
    return
  }
  setText(hud.quest, challenge.name)
  showWaves(hud.waves, challenge.objective.kind === "clearWaves" ? challenge.waves.scripted.length : 0, waves)
  setText(hud.progress, challengeProgress(challenge, waves, resources.stats.get().kills))
})

/** The damage and the hits a second are over this many seconds. */
const rateWindow = 5

/**
 * The Extras' damage readout (training and practice), on one line under the
 * header: the damage a second and the hits a second, both over the last few
 * seconds. Blows on enemies only, as landed (a dummy that never falls shows
 * the blow as dealt).
 */
export const SyncDamageMeter = Game.System("Shooter/SyncDamageMeter", {
  resources: { tuning: Game.System.readResource(Tuning), challenge: Game.System.readResource(Challenge), run: Game.System.readResource(Run) },
  events: { hit: Game.System.readEvent(Hit) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ resources, events, services }) => {
  const refs = services.host.hud.meter
  const tuning = resources.tuning.get()
  const kind = tuning.challenges[resources.challenge.get()].objective.kind
  const shown = tuning.waves.enabled && (kind === "training" || kind === "practice")
  if (refs.root.hidden === shown) refs.root.hidden = !shown
  const recent = services.host.feedback.meter.recent
  // A new run starts it over.
  if (resources.run.get().time <= 0) recent.length = 0
  const hits = events.hit.all().filter((hit) => hit.faction === "enemy" && hit.amount > 0)
  if (!shown) return
  const dt = services.clock.frameSeconds
  for (const entry of recent) entry.age += dt
  while (recent.length > 0 && recent[0]!.age > rateWindow) recent.shift()
  for (const hit of hits) recent.push({ age: 0, amount: hit.amount })
  const damage = recent.reduce((sum, entry) => sum + entry.amount, 0) / rateWindow
  setText(refs.damage, `${Math.round(damage)} dmg/s`)
  setText(refs.hits, `${(recent.length / rateWindow).toFixed(1)} hits/s`)
})
