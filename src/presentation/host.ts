import { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import { DirectionalLight, Group, HemisphereLight, OrthographicCamera, Scene, WebGLRenderer } from "three"

import { actionButtons, teamSlots } from "../config/input.ts"
import type { ActionButton, PartyTaps } from "../config/input.ts"
import { projection, view } from "../config/view.ts"
import { toScreen, toScreenAt, worldHeight } from "../math/iso.ts"
import { makeCamera, placeCamera } from "./camera.ts"
import { DropTrail } from "./drop-trail.ts"
import { Stones } from "./stones.ts"
import { Fx } from "./fx.ts"
import { Haze } from "./haze.ts"
import { trackPartyTaps } from "./party-taps.ts"
import { readSafeArea } from "./safe-area.ts"
import { dashIcon } from "./icons.ts"
import { SlashTrails } from "./trails.ts"
import type { HudRefs, ProjectileNode, RenderHostValue, RenderNode } from "./host-types.ts"
import { arenaLooks, modelsInLooks } from "./looks.ts"
import { disposeModel, loadModels } from "./models.ts"
import type { ModelId, ModelSource } from "./models.ts"
import type { ArenaId } from "../content/arena.ts"
import type { Box } from "../physics/shapes.ts"
import { floorLayers, trailOrder } from "./layers.ts"
import { disposeNode, instancesOf } from "./nodes.ts"
import { makeAssets } from "./render-assets.ts"
import { dressArena } from "./scenery.ts"
import type { Dressing } from "./scenery.ts"
import { Shapes } from "./shapes.ts"


const createHud = (): { readonly root: HTMLElement; readonly refs: HudRefs } => {
  const root = document.createElement("div")
  root.className = "hud"
  root.innerHTML = `
    <div class="hud__vignette" data-vignette></div>
    <div class="hud__focus" data-focus></div>
    <div class="hud__moment" data-moment></div>
    <div class="hud__fall" data-fall></div>
    <div class="hud__quest"><div class="hud__quest-name" data-quest></div><div class="hud__waves" data-waves></div><div class="hud__quest-progress" data-progress></div><div class="hud__meter" data-meter hidden><b data-damage></b><span data-hits></span></div></div>
    <div class="hud__vitals">
      <span class="hud__state" data-state hidden></span>
      <div class="hud__health"><div class="hud__health-fill" data-health></div><span class="hud__health-text" data-health-text></span></div>
    </div>
    <div class="team" data-team>
      ${teamSlots.map((slot) => `<div class="team__member" data-member="${slot}" hidden><div class="team__face" data-face><span class="team__portrait" data-member-portrait></span><b class="team__wait"></b><kbd>${slot + 1}</kbd><i data-member-state></i></div><div class="team__info"><span data-member-name></span><b class="team__hp"><i data-member-hp></i></b></div><b class="team__burst" data-member-burst></b></div>`).join("")}
    </div>
    <div class="hud__banner" data-banner></div>
    <div class="hud__skills">
      <div class="hud__skill" data-skill="special"><kbd>Space</kbd><span></span><i data-cooldown></i></div>
      <div class="hud__skill hud__skill--ultimate" data-skill="ultimate"><kbd>Shift</kbd><span></span><i data-cooldown></i></div>
    </div>
    <div class="hud__hint" data-hint>WASD move · double-tap dash · Click attack · Space special · Shift ultimate · 1–3 switch · Esc menu</div>
    <button class="hud__menu" data-menu type="button" title="Menu (Esc)" aria-label="Menu"><i></i><i></i></button>
    <div class="pad" data-pad hidden>
      <div class="pad__stick" data-stick><div class="pad__knob" data-knob></div></div>
      ${actionButtons.map((name) => `<div class="pad__button pad__button--${name}" data-button="${name}"><i data-cooldown></i><span data-icon>${name === "dash" ? dashIcon : ""}</span><em data-seconds></em></div><b class="pad__aim" data-aim="${name}"></b>`).join("")}
    </div>
  `
  const slot = (id: string) => {
    const element = root.querySelector<HTMLElement>(`[data-skill="${id}"]`)!
    return { root: element, cooldown: element.querySelector<HTMLElement>("[data-cooldown]")! }
  }
  const padButton = (name: ActionButton) => {
    const button = root.querySelector<HTMLElement>(`[data-button="${name}"]`)!
    return {
      root: button,
      icon: button.querySelector<HTMLElement>("[data-icon]")!,
      cooldown: button.querySelector<HTMLElement>("[data-cooldown]")!,
      seconds: button.querySelector<HTMLElement>("[data-seconds]")!,
      aim: root.querySelector<HTMLElement>(`[data-aim="${name}"]`)!
    }
  }
  return {
    root,
    refs: {
      root,
      skills: { special: slot("special"), ultimate: slot("ultimate") },
      desktopOnly: [root.querySelector<HTMLElement>(".hud__skills")!, root.querySelector<HTMLElement>("[data-hint]")!],
      menu: root.querySelector<HTMLButtonElement>("[data-menu]")!,
      pad: {
        root: root.querySelector<HTMLElement>("[data-pad]")!,
        stick: root.querySelector<HTMLElement>("[data-stick]")!,
        knob: root.querySelector<HTMLElement>("[data-knob]")!,
        buttons: { attack: padButton("attack"), special: padButton("special"), dash: padButton("dash"), ultimate: padButton("ultimate") }
      },
      quest: root.querySelector<HTMLElement>("[data-quest]")!,
      waves: root.querySelector<HTMLElement>("[data-waves]")!,
      progress: root.querySelector<HTMLElement>("[data-progress]")!,
      meter: { root: root.querySelector<HTMLElement>("[data-meter]")!, damage: root.querySelector<HTMLElement>("[data-damage]")!, hits: root.querySelector<HTMLElement>("[data-hits]")! },
      health: root.querySelector<HTMLElement>("[data-health]")!,
      healthText: root.querySelector<HTMLElement>("[data-health-text]")!,
      state: root.querySelector<HTMLElement>("[data-state]")!,
      team: {
        root: root.querySelector<HTMLElement>("[data-team]")!,
        members: teamSlots.map((slot) => {
          const member = root.querySelector<HTMLElement>(`[data-member="${slot}"]`)!
          return {
            root: member,
            face: member.querySelector<HTMLElement>("[data-face]")!,
            burst: member.querySelector<HTMLElement>("[data-member-burst]")!,
            portrait: member.querySelector<HTMLElement>("[data-member-portrait]")!,
            state: member.querySelector<HTMLElement>("[data-member-state]")!,
            name: member.querySelector<HTMLElement>("[data-member-name]")!,
            health: member.querySelector<HTMLElement>("[data-member-hp]")!
          }
        })
      },
      banner: root.querySelector<HTMLElement>("[data-banner]")!,
      vignette: root.querySelector<HTMLElement>("[data-vignette]")!,
      focus: root.querySelector<HTMLElement>("[data-focus]")!,
      moment: root.querySelector<HTMLElement>("[data-moment]")!,
      fall: root.querySelector<HTMLElement>("[data-fall]")!
    }
  }
}

export interface BrowserHost {
  readonly host: RenderHostValue
  readonly nodes: NodeRegistry.NodeRegistry<RenderNode>
  /** Every model the looks use, loaded (the menu's showcase draws them too). */
  readonly models: ReadonlyMap<ModelId, ModelSource>
  /** Taps on the HUD's party list, an input (see `PartyTap`). */
  readonly party: PartyTaps
  destroy(): void
}

export const createBrowserHost = async (mount: HTMLElement, arena: { readonly width: number; readonly height: number; readonly cells: number }): Promise<BrowserHost> => {
  // Every model the looks use, before the arena opens (nodes are made synchronously).
  const models = await loadModels(modelsInLooks())
  // Phones have very dense screens: past 2 device pixels per CSS pixel the cost grows faster than the sharpness,
  // and at 2 or more edges are fine without multisampling (which would cost 4x the pixels again).
  const renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(view.background)
  renderer.autoClear = false
  // A frame is two renders (the scene, then the overlay): count both.
  renderer.info.autoReset = false
  const canvas = renderer.domElement
  canvas.style.display = "block"
  const hud = createHud()
  mount.replaceChildren(canvas, hud.root)
  const safeArea = readSafeArea(mount)
  const party = trackPartyTaps(hud.refs.team)

  const size = { width: 1, height: 1 }
  const resize = () => {
    size.width = Math.max(1, mount.clientWidth)
    size.height = Math.max(1, mount.clientHeight)
    renderer.setSize(size.width, size.height)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(mount)

  const scene = new Scene()
  // Updated once per frame in `render`, before batches read it.
  scene.matrixWorldAutoUpdate = false
  const batches = new Group()
  scene.add(batches)
  const assets = makeAssets(batches, models)
  const camera = makeCamera()
  const light = view.light
  // Light intensities are physical: π makes a fully lit face show its own color.
  const sky = new HemisphereLight(light.sky, light.ground, light.skyIntensity * Math.PI)
  scene.add(sky)
  const sun = new DirectionalLight(0xffffff, light.sunIntensity * Math.PI)
  sun.position.set(light.sun.x, light.sun.y, light.sun.z)
  scene.add(sun)

  const grid = new Shapes({ order: floorLayers.grid.order }).onFloor(floorLayers.grid.height)
  scene.add(grid.mesh)
  // The arena's floor and scenery: the courtyard's until a run stands in another (see `showArena`).
  let dressing: { readonly id: ArenaId; readonly dressing: Dressing } | null = null
  const showArena = (id: ArenaId, holes: ReadonlyArray<Box>) => {
    if (dressing?.id === id) return
    dressing?.dressing.dispose()
    const look = arenaLooks[id]
    dressing = { id, dressing: dressArena(assets, look, arena, holes, grid) }
    scene.add(dressing.dressing.object)
    // What shows beyond its walls, and the arena's own light.
    renderer.setClearColor(look.background ?? view.background)
    sky.color.set(look.light?.sky ?? light.sky)
    sky.groundColor.set(look.light?.ground ?? light.ground)
    sun.color.set(look.light?.sun ?? 0xffffff)
  }
  showArena("courtyard", [])
  const telegraphs = new Shapes({ order: floorLayers.telegraphs.order }).onFloor(floorLayers.telegraphs.height)
  const groundMarks = new Shapes({ order: floorLayers.marks.order }).onFloor(floorLayers.marks.height)
  // Slash trails: at waist height, over the actors.
  const trails = new Shapes({ depthTest: false, order: trailOrder }).onFloor(worldHeight(projection, view.slashTrail.height))
  const actors = new Group()
  scene.add(telegraphs.mesh, groundMarks.mesh, trails.mesh, actors)

  // The overlay: a flat scene in screen pixels (y down) drawn over the 3D one.
  const overlayScene = new Scene()
  const overlayCamera = new OrthographicCamera(0, 1, 0, -1, -10, 10)
  const flipped = new Group()
  flipped.scale.y = -1
  overlayScene.add(flipped)
  // `projected` follows the camera: its coordinates are `toScreen`'s.
  const projected = new Group()
  const overlay = new Shapes({ depthTest: false })
  const fx = new Fx(projected, projection.squash)
  const haze = new Haze()
  projected.add(overlay.mesh)
  const reticle = new Shapes({ depthTest: false })
  const edges = new Shapes({ depthTest: false })
  flipped.add(projected, reticle.mesh, edges.mesh)

  const cursor = { x: 0, y: 0, over: false }
  const onMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    cursor.x = event.clientX - rect.left
    cursor.y = event.clientY - rect.top
    cursor.over = true
  }
  const onLeave = () => {
    cursor.over = false
  }
  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerleave", onLeave)

  // Projectiles come and go constantly, so their nodes are pooled.
  const projectilePool: Array<ProjectileNode> = []
  const nodes = NodeRegistry.make<RenderNode>({
    attach: (node) => {
      actors.add(node.root)
      for (const instance of instancesOf(node)) instance.batch.add(instance)
    },
    detach: (node) => {
      actors.remove(node.root)
      for (const instance of instancesOf(node)) instance.batch.remove(instance)
      if (node.kind === "projectile") projectilePool.push(node)
      else disposeNode(node)
    }
  })

  const cameraView = { center: { x: 0, y: 0 }, pixelsPerUnit: 1, offset: { x: 0, y: 0 } }
  const layers = [telegraphs, groundMarks, trails, overlay, reticle, edges]
  const host: RenderHostValue = {
    renderer,
    canvas,
    size,
    scene,
    camera,
    view: cameraView,
    assets,
    actors,
    groundMarks,
    telegraphs,
    overlay,
    projected,
    fx,
    haze,
    drops: new DropTrail(scene),
    stones: new Stones(scene),
    trails: new SlashTrails(trails),
    reticle,
    edges,
    projectilePool,
    cursor,
    hud: hud.refs,
    safeArea: safeArea.read,
    showArena,
    stats: { fps: 60, steps: 0, sinceHud: 0, simMs: 0, drawMs: 0 },
    fallen: [],
    feedback: { shake: 0, hurt: 0, bannerWave: 0, slashCue: { alpha: 0, idle: 0 }, kick: { x: 0, y: 0 }, punch: 0, moment: 0, protection: 0, entrance: Infinity, wideEyes: 0, stepIn: null, sway: { x: 0, y: 0, vx: 0, vy: 0, last: null }, recoil: new Map(), stateClock: { id: null, full: 0 }, hover: null, squish: null, meter: { recent: [] } },
    toCanvas: (world, height) => {
      const center = toScreen(projection, cameraView.center)
      const at = toScreenAt(projection, world, height)
      const scale = cameraView.pixelsPerUnit / projection.zoom
      return {
        x: size.width / 2 + (at.x - center.x) * scale + cameraView.offset.x,
        y: size.height / 2 + (at.y - center.y) * scale + cameraView.offset.y
      }
    },
    render: () => {
      placeCamera(camera, projection, { width: size.width, height: size.height, ...cameraView })
      // The overlay follows the same view: projected point p shows at center + (p - center's projection) × scale + offset.
      const center = toScreen(projection, cameraView.center)
      const scale = cameraView.pixelsPerUnit / projection.zoom
      projected.scale.set(scale, scale, 1)
      projected.position.set(size.width / 2 - center.x * scale + cameraView.offset.x, size.height / 2 - center.y * scale + cameraView.offset.y, 0)
      overlayCamera.right = size.width
      overlayCamera.bottom = -size.height
      overlayCamera.updateProjectionMatrix()
      fx.flush()
      for (const layer of layers) layer.flush()
      // Batches copy where their instances are this frame.
      scene.updateMatrixWorld()
      assets.flush()
      renderer.info.reset()
      renderer.clear()
      renderer.render(scene, camera)
      // Heat bends the scene, under the overlay.
      haze.apply(renderer, host.toCanvas)
      renderer.clearDepth()
      renderer.render(overlayScene, overlayCamera)
    }
  }

  return {
    host,
    nodes,
    models,
    party,
    destroy() {
      party.dispose()
      safeArea.dispose()
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
      observer.disconnect()
      nodes.clear()
      for (const layer of [grid, ...layers]) layer.dispose()
      fx.dispose()
      haze.dispose()
      host.drops.dispose()
      host.stones.dispose()
      assets.dispose()
      dressing?.dressing.dispose()
      for (const source of models.values()) disposeModel(source)
      renderer.dispose()
      renderer.forceContextLoss()
      mount.replaceChildren()
    }
  }
}
