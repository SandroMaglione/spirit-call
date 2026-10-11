/**
 * The tutorial, written on the floor (see `features/tutorial.ts`): the step
 * asked, in large letters lying on the arena's floor where it is to be done
 * (under the circle to walk into, under the dummy to hit), and under it how
 * to do it on this device (a button on touch, a key on a keyboard). A step
 * done chimes, and the next one's words take its place.
 */
import { CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three"

import { projection, view } from "../config/view.ts"
import type { TutorialStep, TutorialStepKind } from "../content/tutorial.ts"
import { stepGoal, tutorialSpot, tutorialSpotRadius } from "../features/tutorial.ts"
import { screenDirectionToWorld } from "../math/iso.ts"
import { normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Challenge, Controls, Enemy, Flow, Game, Player, Position, RenderHost, Sounds, Tuning, Tutorial } from "../schema.ts"

/** How to do each step, on each kind of device. */
const how: { readonly [Kind in TutorialStepKind]: { readonly touch: string; readonly desktop: string } } = {
  move: { touch: "Drag the stick on the left", desktop: "W A S D" },
  dash: { touch: "Tap the dash button", desktop: "Double-tap a direction" },
  attack: { touch: "Tap the sword button", desktop: "Click" },
  special: { touch: "Tap the special button", desktop: "Space" },
  ultimate: { touch: "Tap the glowing ultimate button", desktop: "Shift" },
  perfectDodge: { touch: "Walk up to it, and dash just as its blow lands", desktop: "Walk up to it, and double-tap a direction just as its blow lands" }
}

/** The words' size on the floor (world units), and the canvas they are drawn on (pixels). */
const size = { width: 300, canvasWidth: 1024, canvasHeight: 296 }
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
  // The letters follow the floor's projection, but scenery must never hide an instruction.
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  // Lying on the floor, read along the screen: stretched along the view a little against the camera's squash, still read as on the floor.
  const geometry = new PlaneGeometry(size.width, (size.width * size.canvasHeight / size.canvasWidth) / Math.pow(projection.squash, 0.75)).rotateX(-Math.PI / 2)
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
    const line = (text: string, y: number, px: number, weight: string, fill: string, outline: number) => {
      const font = (size: number) => `${weight} ${size}px 'Barlow Condensed', 'Avenir Next Condensed', sans-serif`
      context.font = font(px)
      const room = canvas.width - outline * 2 - 16
      const width = context.measureText(text).width
      if (width > room) context.font = font(Math.floor((px * room) / width))
      context.lineWidth = outline
      context.strokeStyle = "rgba(13, 17, 23, 0.85)"
      context.strokeText(text, canvas.width / 2, y)
      context.fillStyle = fill
      context.fillText(text, canvas.width / 2, y)
    }
    line(title.toUpperCase(), 100, 136, "italic 800", "#fff3cf", 20)
    if (hint !== "") line(hint, 230, 64, "700", "#e8eefc", 14)
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
    words.draw("Well done!", "On to your first quest")
    place(at, 120)
    return
  }
  words.draw(titleOf(step, count), how[step.kind][device])
  const marks = host.groundMarks
  const pulse = host.comfort.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 260)
  switch (step.kind) {
    case "move": {
      const spot = tutorialSpot(tuning, step.to)
      marks.strokeCircle(spot.x, spot.y, tutorialSpotRadius, 5, 0xffe08a, 0.55 + 0.4 * pulse)
      marks.strokeCircle(spot.x, spot.y, tutorialSpotRadius * (0.55 + 0.15 * pulse), 3, 0xffe08a, 0.4)
      place(spot, tutorialSpotRadius + 60)
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
