import { NodeRegistry } from "@typeonce/bevy-ts-pixi"
import { Application, Container, Graphics } from "pixi.js"

import { actionButtons, teamButtons } from "../config/input.ts"
import type { ActionButton } from "../config/input.ts"
import { projection, view } from "../config/view.ts"
import { Fx } from "./fx.ts"
import { SlashTrails } from "./trails.ts"
import type { HudRefs, ProjectileNode, RenderAssets, RenderHostValue, RenderNode } from "./host-types.ts"
import { drawFloor } from "./nodes.ts"

/** Button labels; the skill buttons show the name of the skill in their slot (see `SyncTouchPad`). */
const padLabels: Record<ActionButton, string> = { attack: "ATTACK", special: "", dash: "DASH", ultimate: "" }

const createHud = (): { readonly root: HTMLElement; readonly refs: HudRefs } => {
  const root = document.createElement("div")
  root.className = "hud"
  root.innerHTML = `
    <div class="hud__vignette" data-vignette></div>
    <div class="hud__quest"><div class="hud__quest-name" data-quest></div><div class="hud__quest-progress" data-progress></div></div>
    <div class="hud__vitals">
      <div class="hud__who"><b data-name></b><span class="hud__state" data-state hidden></span></div>
      <div class="hud__health"><div class="hud__health-fill" data-health></div></div>
      <span class="hud__health-text" data-health-text></span>
    </div>
    <div class="team" data-team>
      ${teamButtons.map((_, slot) => `<div class="team__member" data-member="${slot}" hidden><div class="team__face" data-face><kbd>${slot + 1}</kbd><i data-member-state></i></div><div class="team__info"><span data-member-name></span><b class="team__hp"><i data-member-hp></i></b></div></div>`).join("")}
    </div>
    <div class="hud__banner" data-banner></div>
    <div class="hud__skills">
      <div class="hud__skill" data-skill="special"><kbd>Space</kbd><span></span><i data-cooldown></i></div>
      <div class="hud__skill hud__skill--ultimate" data-skill="ultimate"><kbd>Shift</kbd><span></span><i data-cooldown></i></div>
    </div>
    <div class="hud__hint" data-hint>WASD move · double-tap dash · Click attack · Space special · Shift ultimate · 1–3 switch</div>
    <button class="hud__mute" data-mute type="button" title="Sound (M)">🔊</button>
    <div class="pad" data-pad hidden>
      <div class="pad__stick" data-stick><div class="pad__knob" data-knob></div></div>
      ${actionButtons.map((name) => `<div class="pad__button pad__button--${name}" data-button="${name}"><i data-cooldown></i><span>${padLabels[name]}</span></div><b class="pad__aim" data-aim="${name}"></b>`).join("")}
    </div>
  `
  const slot = (id: string) => {
    const element = root.querySelector<HTMLElement>(`[data-skill="${id}"]`)!
    return { root: element, cooldown: element.querySelector<HTMLElement>("[data-cooldown]")! }
  }
  const padButton = (name: ActionButton) => {
    const button = root.querySelector<HTMLElement>(`[data-button="${name}"]`)!
    return { root: button, cooldown: button.querySelector<HTMLElement>("[data-cooldown]")!, aim: root.querySelector<HTMLElement>(`[data-aim="${name}"]`)! }
  }
  return {
    root,
    refs: {
      root,
      skills: { special: slot("special"), ultimate: slot("ultimate") },
      desktopOnly: [root.querySelector<HTMLElement>(".hud__skills")!, root.querySelector<HTMLElement>("[data-hint]")!],
      mute: root.querySelector<HTMLButtonElement>("[data-mute]")!,
      pad: {
        root: root.querySelector<HTMLElement>("[data-pad]")!,
        stick: root.querySelector<HTMLElement>("[data-stick]")!,
        knob: root.querySelector<HTMLElement>("[data-knob]")!,
        buttons: { attack: padButton("attack"), special: padButton("special"), dash: padButton("dash"), ultimate: padButton("ultimate") }
      },
      quest: root.querySelector<HTMLElement>("[data-quest]")!,
      progress: root.querySelector<HTMLElement>("[data-progress]")!,
      name: root.querySelector<HTMLElement>("[data-name]")!,
      health: root.querySelector<HTMLElement>("[data-health]")!,
      healthText: root.querySelector<HTMLElement>("[data-health-text]")!,
      state: root.querySelector<HTMLElement>("[data-state]")!,
      team: {
        root: root.querySelector<HTMLElement>("[data-team]")!,
        members: teamButtons.map((_, slot) => {
          const member = root.querySelector<HTMLElement>(`[data-member="${slot}"]`)!
          return {
            root: member,
            face: member.querySelector<HTMLElement>("[data-face]")!,
            state: member.querySelector<HTMLElement>("[data-member-state]")!,
            name: member.querySelector<HTMLElement>("[data-member-name]")!,
            health: member.querySelector<HTMLElement>("[data-member-hp]")!
          }
        })
      },
      banner: root.querySelector<HTMLElement>("[data-banner]")!,
      vignette: root.querySelector<HTMLElement>("[data-vignette]")!
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
