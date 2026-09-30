import { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import { Application, Container, Graphics } from "pixi.js"

import { touchButtons } from "../config/input.ts"
import type { TouchButton } from "../config/input.ts"
import { projection, view } from "../config/view.ts"
import { Fx } from "./fx.ts"
import { SlashTrails } from "./trails.ts"
import type { HudRefs, ProjectileNode, RenderAssets, RenderHostValue, RenderNode } from "./host-types.ts"
import { drawFloor } from "./nodes.ts"

/** Button labels; the skill buttons show the name of the skill in their slot (see `SyncTouchPad`). */
const padLabels: Record<TouchButton, string> = { attack: "ATTACK", special: "", dash: "DASH", ultimate: "" }

const createHud = (): { readonly root: HTMLElement; readonly refs: HudRefs } => {
  const root = document.createElement("div")
  root.className = "hud"
  root.innerHTML = `
    <div class="hud__vignette" data-vignette></div>
    <div class="hud__panel">
      <div class="hud__health"><div class="hud__health-fill" data-health></div><span data-health-text></span></div>
      <div class="hud__dash" data-dash></div>
      <div class="hud__wave" data-wave></div>
      <div class="hud__combat" data-combat></div>
      <div class="hud__stats" data-stats></div>
    </div>
    <div class="hud__banner" data-banner></div>
    <div class="hud__skills">
      <div class="hud__skill" data-skill="special"><kbd>Space</kbd><span></span><i data-cooldown></i></div>
      <div class="hud__skill hud__skill--ultimate" data-skill="ultimate"><kbd>Shift</kbd><span></span><i data-cooldown></i></div>
    </div>
    <div class="hud__gameover" data-gameover hidden>
      <div class="hud__gameover-title">YOU DIED</div>
      <div class="hud__gameover-stats" data-gameover-stats></div>
      <div class="hud__gameover-hint" data-gameover-hint>Press R or click to restart</div>
    </div>
    <div class="hud__hint" data-hint>WASD move · double-tap to dash · Left click attack · Space special · Shift ultimate</div>
    <button class="hud__mute" data-mute type="button" title="Sound (M)">🔊</button>
    <div class="pad" data-pad hidden>
      <div class="pad__stick" data-stick><div class="pad__knob" data-knob></div></div>
      ${touchButtons.map((name) => `<div class="pad__button pad__button--${name}" data-button="${name}"><i data-cooldown></i><span>${padLabels[name]}</span></div><b class="pad__aim" data-aim="${name}"></b>`).join("")}
    </div>
  `
  const slot = (id: string) => {
    const element = root.querySelector<HTMLElement>(`[data-skill="${id}"]`)!
    return { root: element, cooldown: element.querySelector<HTMLElement>("[data-cooldown]")! }
  }
  const padButton = (name: TouchButton) => {
    const button = root.querySelector<HTMLElement>(`[data-button="${name}"]`)!
    return { root: button, cooldown: button.querySelector<HTMLElement>("[data-cooldown]")!, aim: root.querySelector<HTMLElement>(`[data-aim="${name}"]`)! }
  }
  return {
    root,
    refs: {
      skills: { special: slot("special"), ultimate: slot("ultimate") },
      desktopOnly: [root.querySelector<HTMLElement>(".hud__skills")!, root.querySelector<HTMLElement>("[data-hint]")!],
      gameOverHint: root.querySelector<HTMLElement>("[data-gameover-hint]")!,
      mute: root.querySelector<HTMLButtonElement>("[data-mute]")!,
      pad: {
        root: root.querySelector<HTMLElement>("[data-pad]")!,
        stick: root.querySelector<HTMLElement>("[data-stick]")!,
        knob: root.querySelector<HTMLElement>("[data-knob]")!,
        buttons: { attack: padButton("attack"), special: padButton("special"), dash: padButton("dash"), ultimate: padButton("ultimate") }
      },
      health: root.querySelector<HTMLElement>("[data-health]")!,
      healthText: root.querySelector<HTMLElement>("[data-health-text]")!,
      dash: root.querySelector<HTMLElement>("[data-dash]")!,
      wave: root.querySelector<HTMLElement>("[data-wave]")!,
      combat: root.querySelector<HTMLElement>("[data-combat]")!,
      stats: root.querySelector<HTMLElement>("[data-stats]")!,
      banner: root.querySelector<HTMLElement>("[data-banner]")!,
      vignette: root.querySelector<HTMLElement>("[data-vignette]")!,
      gameOver: root.querySelector<HTMLElement>("[data-gameover]")!,
      gameOverStats: root.querySelector<HTMLElement>("[data-gameover-stats]")!
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
  // Slash trails: the floor's projection, lifted to waist height, over the actors.
  const air = new Container()
  air.scale.set(projection.zoom, projection.zoom * projection.squash)
  air.position.set(0, -view.slashTrail.height * projection.zoom)
  const airRotated = new Container()
  airRotated.rotation = Math.PI / 4
  air.addChild(airRotated)
  const trails = new Graphics()
  airRotated.addChild(trails)
  const overlay = new Graphics()
  const fxLayer = new Container()
  world.addChild(ground, actors, air, overlay, fxLayer)

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
      fx: new Fx(fxLayer, assets, projection.squash),
      trails: new SlashTrails(trails),
      projectilePool,
      screen,
      reticle,
      cursor,
      hud: hud.refs,
      stats: { fps: 60, steps: 0, sinceHud: 0, simMs: 0, drawMs: 0 },
      feedback: { shake: 0, hurt: 0, bannerWave: 0, slashCue: { alpha: 0, idle: 0 }, kick: { x: 0, y: 0 }, punch: 0, recoil: new Map() }
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
