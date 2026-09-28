import { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import { Application, Container, Graphics } from "pixi.js"

import { projection, view } from "../config/view.ts"
import { Fx } from "./fx.ts"
import type { HudRefs, ProjectileNode, RenderAssets, RenderHostValue, RenderNode } from "./host-types.ts"
import { drawFloor } from "./nodes.ts"

const createHud = (): { readonly root: HTMLElement; readonly refs: HudRefs } => {
  const root = document.createElement("div")
  root.className = "hud"
  root.innerHTML = `
    <div class="hud__panel">
      <div class="hud__dash" data-dash></div>
      <div class="hud__combat" data-combat></div>
      <div class="hud__stats" data-stats></div>
    </div>
    <div class="hud__hint">WASD move · Mouse aim · Left click shoot · Space / Right click dash</div>
  `
  return {
    root,
    refs: {
      dash: root.querySelector<HTMLElement>("[data-dash]")!,
      combat: root.querySelector<HTMLElement>("[data-combat]")!,
      stats: root.querySelector<HTMLElement>("[data-stats]")!
    }
  }
}

export interface BrowserHost {
  readonly host: RenderHostValue
  readonly nodes: NodeRegistry.NodeRegistry<RenderNode>
  destroy(): void
}

export const createBrowserHost = async (mount: HTMLElement, arena: { readonly width: number; readonly height: number }): Promise<BrowserHost> => {
  const app = new Application()
  await app.init({ antialias: true, background: view.background, resizeTo: mount, autoDensity: true, resolution: window.devicePixelRatio })
  const hud = createHud()
  mount.replaceChildren(app.canvas, hud.root)

  const discRadius = 16
  const assets: RenderAssets = {
    disc: app.renderer.generateTexture(new Graphics().circle(0, 0, discRadius).fill({ color: 0xffffff })),
    discRadius,
    shadow: app.renderer.generateTexture(new Graphics().ellipse(0, 0, discRadius, discRadius * projection.squash).fill({ color: 0x000000 }))
  }

  const world = new Container()
  // Projection as a transform: rotate 45°, then squash vertically.
  const ground = new Container()
  ground.scale.set(projection.zoom, projection.zoom * projection.squash)
  const groundRotated = new Container()
  groundRotated.rotation = Math.PI / 4
  ground.addChild(groundRotated)
  groundRotated.addChild(drawFloor(arena.width, arena.height))
  const telegraphs = new Graphics()
  const groundMarks = new Graphics()
  groundRotated.addChild(telegraphs, groundMarks)

  const actors = new Container()
  actors.sortableChildren = true
  const overlay = new Graphics()
  const fxLayer = new Container()
  world.addChild(ground, actors, overlay, fxLayer)

  const screen = new Container()
  const reticle = new Graphics()
  screen.addChild(reticle)
  app.stage.addChild(world, screen)

  const cursor = { x: 0, y: 0, over: false }
  const onMove = (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect()
    cursor.x = event.clientX - rect.left
    cursor.y = event.clientY - rect.top
    cursor.over = true
  }
  const onLeave = () => {
    cursor.over = false
  }
  app.canvas.addEventListener("pointermove", onMove)
  app.canvas.addEventListener("pointerleave", onLeave)

  // Projectiles come and go constantly, so their nodes are pooled.
  const projectilePool: Array<ProjectileNode> = []
  const nodes = NodeRegistry.make<RenderNode>({
    attach: (node) => {
      actors.addChild(node.root)
    },
    detach: (node) => {
      actors.removeChild(node.root)
      if (node.kind === "projectile") projectilePool.push(node)
      else node.root.destroy({ children: true })
    }
  })

  return {
    host: {
      app,
      assets,
      world,
      ground: groundRotated,
      groundMarks,
      telegraphs,
      actors,
      overlay,
      fx: new Fx(fxLayer, assets),
      projectilePool,
      screen,
      reticle,
      cursor,
      hud: hud.refs,
      stats: { fps: 60, steps: 0, sinceHud: 0 }
    },
    nodes,
    destroy() {
      app.canvas.removeEventListener("pointermove", onMove)
      app.canvas.removeEventListener("pointerleave", onLeave)
      nodes.clear()
      app.destroy(true)
      mount.replaceChildren()
    }
  }
}
