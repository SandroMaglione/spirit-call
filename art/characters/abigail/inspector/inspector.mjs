/**
 * Abigail's inspector: her model drawn by the game's own code (its loader,
 * cel shading and outlines, held sword, lights, and camera), posed at fixed
 * clip times, so a screenshot shows exactly what the arena draws.
 *
 * Open /art/characters/abigail/inspector/ on the dev server. Parameters:
 * - `focus`: the height (a fraction of hers) at the screen's center; `spacing`: between poses.
 * - `scale`: `game` (the arena's size; `zoom` 1 desktop, 0.8 phone), or
 *   pixels per meter for a close view (default 260).
 * - `poses`: `Clip@seconds` list (default: a review set); `facing`: degrees
 *   from facing the camera; `weapon`: trainingBlade or crescendo;
 *   `compare`: also draw the crow, for size.
 */
import { AnimationMixer, CircleGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, Scene, WebGLRenderer } from "three"

import { projection, view } from "/src/config/view.ts"
import { bodyHeight } from "/src/presentation/bodies.ts"
import { makeCamera, placeCamera } from "/src/presentation/camera.ts"
import { characterLooks } from "/src/presentation/looks.ts"
import { loadModels } from "/src/presentation/models.ts"
import { copyModel } from "/src/presentation/puppet.ts"

const params = new URLSearchParams(location.search)
const look = characterLooks.swordsman
const crowLook = characterLooks.gunner
const combo = look.moments.attack
const review = [
  ["Guard", "Idle", 0], ["Run", "Run", 0.07], ["Run", "Run", 0.33],
  ["Opening cut", "AttackCombo", combo[0].contact], ["Follow-through", "AttackCombo", 0.1],
  ["Backhand", "AttackCombo", combo[1].contact], ["Thrust", "AttackCombo", combo[2].contact],
  ["Spin", "AttackCombo", combo[3].contact], ["Spinning", "AttackCombo", 0.97], ["Power", "Power", 0.033], ["Dash", "Dash", 0.1]
]
const poses = params.has("poses")
  ? params.get("poses").split(",").map((entry) => { const [clip, time, turn] = entry.split("@"); return [`${clip} ${time}${turn ? ` ${turn}°` : ""}`, clip, Number(time), Number(turn ?? "0")] })
  : review
const weapon = params.get("weapon") ?? "trainingBlade"
const facing = (Number(params.get("facing") ?? "0") * Math.PI) / 180
const gameScale = params.get("scale") === "game"
const zoom = Number(params.get("zoom") ?? "1")
const compare = params.has("compare")

const models = await loadModels([look.model, look.held.weapons[weapon], crowLook.model])
const radius = 16
// Her height in world units, as the arena sizes her body.
const height = bodyHeight((radius * look.widthFactor) / 2, radius * look.heightFactor * projection.zoom)
const unitsPerMeter = height / models.get(look.model).spec.height
const pixelsPerUnit = gameScale ? zoom : Number(params.get("scale") ?? "260") / unitsPerMeter

const renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2 })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.setClearColor(0xc9c1ad)
document.body.prepend(renderer.domElement)
const scene = new Scene()
scene.add(new HemisphereLight(view.light.sky, view.light.ground, view.light.skyIntensity * Math.PI))
const sun = new DirectionalLight(0xffffff, view.light.sunIntensity * Math.PI)
sun.position.set(view.light.sun.x, view.light.sun.y, view.light.sun.z)
scene.add(sun)

/** A copy of `id` posed at `time` of `clip`, standing at floor point (x, z). */
const place = (id, clip, time, x, z, held, turn = 0) => {
  const source = models.get(id)
  const copy = copyModel(source, true)
  const object = copy.object
  object.scale.setScalar(height / source.spec.height)
  // Facing the camera (it looks from the south-east), turned by `facing`.
  object.rotation.y = Math.PI / 4 + facing + (turn * Math.PI) / 180
  object.position.set(x, 0, z)
  if (held !== undefined) {
    const grip = object.getObjectByName("weapon_grip")
    grip.add(copyModel(models.get(held), true).object)
  }
  const mixer = new AnimationMixer(object)
  const action = mixer.clipAction(source.clips.get(clip))
  action.play()
  mixer.setTime(time)
  const shadow = new Mesh(new CircleGeometry(radius * 0.8, 24), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(x, 0.1, z)
  scene.add(object, shadow)
}

// Poses stand in a row across the screen: along the camera's right, (1, -1) on the floor.
const spacing = gameScale ? 70 : Number(params.get("spacing") ?? "0.62") * height
const count = poses.length + (compare ? 1 : 0)
const label = []
poses.forEach(([name, clip, time, turn], index) => {
  const offset = (index - (count - 1) / 2) * spacing * Math.SQRT1_2
  place(look.model, clip, time, offset, -offset, look.held.weapons[weapon], turn)
  label.push([name, offset])
})
if (compare) {
  const offset = ((count - 1) / 2) * spacing * Math.SQRT1_2
  place(crowLook.model, "Idle", 0, offset, -offset, undefined)
  label.push(["Crow (size)", offset])
}

const camera = makeCamera()
placeCamera(camera, projection, { width: innerWidth, height: innerHeight, center: { x: 0, y: 0 }, pixelsPerUnit, offset: { x: 0, y: height * Number(params.get("focus") ?? "0.42") * pixelsPerUnit * Math.cos(Math.PI / 6) } })
renderer.render(scene, camera)
const labels = document.getElementById("labels")
for (const [name, offset] of label) {
  const span = document.createElement("span")
  span.textContent = name
  span.style.left = `${innerWidth / 2 + offset * Math.SQRT2 * pixelsPerUnit}px`
  span.style.top = `${innerHeight - 22}px`
  labels.append(span)
}
document.getElementById("title").textContent = `Abigail · ${gameScale ? `game size (zoom ${zoom})` : "close view"} · ${weapon}`
document.body.dataset["ready"] = "true"
