/**
 * The tutorial, written on the floor (see `features/tutorial.ts`): the step
 * asked, in painted letters lying on the arena's floor where it is to be done
 * (under the circle to walk into, under the dummy to hit), and under it how
 * to do it with the controls in use (a button on touch or a gamepad, as the
 * player bound it, a key on a keyboard). A step
 * done chimes, and the next one's words take its place.
 */
import { CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three"
import { normalizeOr, type Vec2 } from "@typeonce/ritmo-math/Vec2"

import { buttonHint, keyHint } from "../config/controls.ts"
import type { ControlBindings, PadFamily } from "../config/controls.ts"
import { projection, view } from "../config/view.ts"
import type { TutorialStep, TutorialStepKind } from "../content/tutorial.ts"
import { stepGoal, tutorialSpot, tutorialSpotRadius } from "../features/tutorial.ts"
import { screenDirectionToWorld } from "../math/iso.ts"
import { Challenge, Controls, Enemy, Flow, Game, Player, Position, RenderHost, Sounds, Tuning, Tutorial } from "../schema.ts"
import type { ControlDevice } from "../schema.ts"

/** How to do each step, on each kind of device. */
const how = (kind: TutorialStepKind, device: ControlDevice, bindings: ControlBindings, family: PadFamily): string => {
  if (device === "touch") {
    return { move: "Left stick", dash: "Dash button", attack: "Sword button", special: "Special button", ultimate: "Ultimate button", perfectDodge: "Stand close · Dash button" }[kind]
  }
  if (device === "gamepad") {
    const button = (command: "attack" | "dash" | "special" | "ultimate") => buttonHint(bindings, command, family)
    return { move: "Left stick", dash: button("dash"), attack: button("attack"), special: button("special"), ultimate: button("ultimate"), perfectDodge: `Stand close · ${button("dash")}` }[kind]
  }
  const key = (command: "up" | "left" | "down" | "right" | "special" | "ultimate") => keyHint(bindings, command).split(" / ")[0]!
  return {
    move: [key("up"), key("left"), key("down"), key("right")].join(" "),
    dash: "Double-tap a direction",
    attack: "Click",
    special: key("special"),
    ultimate: key("ultimate"),
    perfectDodge: "Stand close · Double-tap"
  }[kind]
}

/** The words' size on the floor (world units), and the canvas they are drawn on (pixels). */
const size = { width: 250, canvasWidth: 1024, canvasHeight: 400 }
/** Screen right and screen down, as floor directions. */
const right = normalizeOr(screenDirectionToWorld(projection, { x: 1, y: 0 }), { x: 1, y: 0 })
const down = normalizeOr(screenDirectionToWorld(projection, { x: 0, y: 1 }), { x: 0, y: 1 })

/** The floor's words: one mesh, drawn again only when they change. */
const makeWords = () => {
  const canvas = document.createElement("canvas")
  canvas.width = size.canvasWidth
  canvas.height = size.canvasHeight
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  // Paint follows the floor's perspective and is covered by bodies and scenery.
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.9 })
  const geometry = new PlaneGeometry(size.width, size.width * size.canvasHeight / size.canvasWidth).rotateX(-Math.PI / 2)
  const mesh = new Mesh(geometry, material)
  mesh.rotation.y = Math.atan2(-right.y, right.x)
  mesh.renderOrder = 2
  let shown = ""
  const draw = (title: string, hint: string) => {
    const key = `${title}\n${hint}`
    if (key === shown) return
    shown = key
    const context = canvas.getContext("2d")
    if (context === null) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.lineJoin = "round"
    /** A line centered at `y`, its font `px` tall at most, smaller when that would not fit across. */
    const line = (text: string, y: number, px: number, fill: string) => {
      const font = (size: number) => `600 ${size}px 'Barlow Condensed', 'Avenir Next Condensed', sans-serif`
      context.font = font(px)
      const room = canvas.width - 16
      const width = context.measureText(text).width
      if (width > room) context.font = font(Math.floor((px * room) / width))
      context.fillStyle = fill
      context.fillText(text, canvas.width / 2, y)
    }
    line(title, 120, 150, "#f5dfaa")
    if (hint !== "") line(hint, 300, 105, "#e3dcc8")
    texture.needsUpdate = true
  }
  return { mesh, draw, dispose: () => { geometry.dispose(); material.dispose(); texture.dispose() } }
}

/** The step's words, its progress when it asks for more than one. */
const titleOf = (step: TutorialStep, count: number): string => (stepGoal(step) > 1 ? `${step.text} ${count}/${stepGoal(step)}` : step.text)

export const ShowTutorial = Game.System("Shooter/ShowTutorial", {
  queries: {
    player: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Player] }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position) }, with: [Enemy] })
  },
  resources: {
    tuning: Game.System.readResource(Tuning),
    challenge: Game.System.readResource(Challenge),
    tutorial: Game.System.readResource(Tutorial),
    controls: Game.System.readResource(Controls)
  },
  services: { host: Game.System.service(RenderHost), sounds: Game.System.service(Sounds) },
  machines: { flow: Game.System.machine(Flow) }
}, ({ queries, resources, services, machines }) => {
  const host = services.host
  const state = host.feedback.tutorial
  const tuning = resources.tuning.get()
  const objective = tuning.challenges[resources.challenge.get()].objective
  const [player] = queries.player.each()
  if (machines.flow.get() !== "Playing" || objective.kind !== "tutorial" || player === undefined) {
    if (state.words !== null) state.words.mesh.visible = false
    state.step = -1
    return
  }
  if (state.words === null) {
    state.words = makeWords()
    host.scene.add(state.words.mesh)
  }
  const words = state.words
  words.mesh.visible = true
  const { step: index, count } = resources.tutorial.get()
  const at = player.data.position.get()
  // A step done chimes (not the first one showing).
  if (index !== state.step) {
    if (state.step >= 0 && index > state.step) services.sounds.play("uiSuccess")
    state.step = index
    state.anchor = at
  }
  const step = objective.steps[index]
  const device = resources.controls.get().device
  /** Where the words lie: centered `below` (world units) under `over` on screen. */
  const place = (over: Vec2, below: number) => words.mesh.position.set(over.x + down.x * below, view.hazards.level + 1, over.y + down.y * below)
  if (step === undefined) {
    words.draw("Perfect dodge!", "Well done!")
    place(state.anchor, 120)
    return
  }
  words.draw(titleOf(step, count), how(step.kind, device, host.controls.bindings, host.controls.padFamily))
  const marks = host.groundMarks
  const pulse = host.comfort.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 260)
  switch (step.kind) {
    case "move": {
      const spot = tutorialSpot(tuning, step.to)
      marks.strokeCircle(spot.x, spot.y, tutorialSpotRadius, 5, 0xffe08a, 0.55 + 0.4 * pulse)
      marks.strokeCircle(spot.x, spot.y, tutorialSpotRadius * (0.55 + 0.15 * pulse), 3, 0xffe08a, 0.4)
      place(spot, tutorialSpotRadius + 80)
      return
    }
    case "dash":
      // Over where she stood as it was asked (clear of the buttons below): the words stay put while she dashes off.
      place(state.anchor, -170)
      return
    case "attack":
    case "special":
    case "ultimate":
    case "perfectDodge": {
      const [dummy] = queries.enemies.each()
      const spot = dummy?.data.position.get() ?? at
      place(spot, 130)
    }
  }
})
