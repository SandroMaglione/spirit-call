/**
 * The menu's models: each place the UI marks with `data-model` (a
 * character) shows her model playing her idle, lit with a rim in her element's color (the place's `--el`); each
 * `data-portrait` (a character, or `enemy:<kind>`) gets an illustration
 * close-up, or a model rendered once and kept. The UI only marks the
 * places, so it never touches the renderer (see `ui/menu/parts.tsx`).
 * A look shows the same way: a tint as her portrait in it, a trail as a
 * picture of what it sheds (`data-portrait` of `look:<id>`, or `trail:<character>`
 * for her own). Portraits are made without ever waiting on the GPU or an
 * encoder (pixels read back and pictures encoded asynchronously, a few
 * started per frame): a shelf of them opens at once and fills in.
 *
 * It draws on its own transparent canvas over the UI (it lets every touch
 * and click through), only where a model's place is, and draws nothing
 * while there is none (in the arena).
 */
import { Box3, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, RGBAFormat, Scene, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget } from "three"
import type { Object3D } from "three"

import type { CharacterId } from "../content/characters.ts"
import { cosmetics } from "../content/cosmetics.ts"
import type { CosmeticId } from "../content/cosmetics.ts"
import type { EnemyKind } from "../content/enemies.ts"
import { view } from "../config/view.ts"
import { characterLooks, cosmeticLooks, enemyLooks, enemyPortraits, wornLook, wornTint } from "./looks.ts"
import type { BodyLook, Drops } from "./looks.ts"
import type { ModelId, ModelSource } from "./models.ts"
import { Puppet } from "./puppet.ts"

/** How the models are shown: the camera's field of view, how far they turn toward it, and how much of a place they fill. */
const stage = {
  fov: 24,
  /** Radians the model turns from facing the camera, to show its shape. */
  turn: -0.45,
  fill: 0.86,
  /** How much wider and taller than its place a model's view is, for its halo to fade in. */
  spill: 2,
  /** Portraits: their size in pixels, how far a character turns from the camera in hers (nearly none: her face, eyes and all), and how much of the picture she fills (all of her shows: a spirit is small, and her eyes sit low). */
  portraitPixels: 256,
  portraitTurn: -0.12,
  portraitFill: 0.82,
  /** Milliseconds a frame may spend making new portraits (at least one is made each frame). */
  portraitBudget: 6,
  /** The rim lights' strength, and the key light's direction. */
  rim: 4.5,
  key: { x: 1.5, y: 2.5, z: 2.5 }
}

/** A model in the showcase: a posed copy, and its bounds at rest. */
interface Shown {
  readonly key: string
  readonly puppet: Puppet
  readonly bounds: Box3
  readonly rim: Color
}

const puppetOf = (models: ReadonlyMap<ModelId, ModelSource>, look: BodyLook, turn = stage.turn): Puppet | null => {
  if (look.kind !== "model") return null
  const source = models.get(look.model)
  if (source === undefined) return null
  // A height of one: the camera frames it by its bounds.
  const puppet = new Puppet(source, 1, look.moments ?? null, [], look.tint)
  puppet.face({ x: Math.sin(turn), y: Math.cos(turn) })
  // Posed once, so its bounds are its idle's.
  puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, 0, false)
  puppet.object.updateMatrixWorld(true)
  return puppet
}

/** A placeholder's picture: its capsule standing in the middle, `aspect` wide for its height, lit from the upper left. */
const capsulePicture = (picture: HTMLCanvasElement, color: number, aspect: number): void => {
  const size = picture.width
  const context = picture.getContext("2d", { willReadFrequently: true })!
  context.clearRect(0, 0, size, size)
  const height = size * 0.72
  const width = Math.min(size * 0.8, height * aspect * 0.5)
  const x = (size - width) / 2
  const y = (size - height) / 2 + size * 0.04
  const base = `#${color.toString(16).padStart(6, "0")}`
  const light = context.createLinearGradient(x, y, x + width, y + height)
  light.addColorStop(0, "rgba(255, 255, 255, 0.45)")
  light.addColorStop(0.5, "rgba(255, 255, 255, 0)")
  light.addColorStop(1, "rgba(0, 0, 0, 0.35)")
  context.beginPath()
  context.roundRect(x, y, width, height, width / 2)
  context.fillStyle = base
  context.fill()
  context.fillStyle = light
  context.fill()
}

/** A trail's picture: what it sheds, strewn along a rising curve, the nearest largest, in its colors and its way (drops, embers, wisps). */
const trailPicture = (picture: HTMLCanvasElement, drops: Omit<Drops, "rate">): void => {
  const size = picture.width
  const context = picture.getContext("2d", { willReadFrequently: true })!
  context.clearRect(0, 0, size, size)
  const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`
  // A fixed scatter (the same picture every time).
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const count = 26
  for (let index = 0; index < count; index++) {
    const t = index / (count - 1)
    // Along a curve from the bottom left to the top right, spreading as it goes.
    const x = size * (0.12 + 0.76 * t) + (random() - 0.5) * size * 0.1 * (0.4 + t)
    const y = size * (0.84 - 0.68 * t ** 0.8) + (random() - 0.5) * size * 0.16 * (0.4 + t)
    const radius = size * (0.018 + 0.05 * t) * (0.7 + random() * 0.6) * (drops.size / 2.4)
    const color = hex(drops.colors[index % drops.colors.length]!)
    context.save()
    context.globalAlpha = 0.45 + 0.55 * t
    context.shadowColor = color
    context.shadowBlur = radius * 1.6
    context.fillStyle = color
    context.strokeStyle = color
    context.translate(x, y)
    context.beginPath()
    if (drops.kind === "wisp") {
      // A curl.
      context.lineWidth = radius * 0.55
      context.lineCap = "round"
      context.arc(0, 0, radius * 1.2, random() * Math.PI * 2, random() * Math.PI * 2 + Math.PI * 1.2)
      context.stroke()
    } else if (drops.kind === "ember") {
      // A spark: a dot with four points.
      context.moveTo(0, -radius * 1.5)
      context.quadraticCurveTo(0, 0, radius * 1.5, 0)
      context.quadraticCurveTo(0, 0, 0, radius * 1.5)
      context.quadraticCurveTo(0, 0, -radius * 1.5, 0)
      context.quadraticCurveTo(0, 0, 0, -radius * 1.5)
      context.fill()
    } else {
      // A drop, falling.
      context.moveTo(0, -radius * 1.6)
      context.quadraticCurveTo(radius, -radius * 0.2, radius, radius * 0.3)
      context.arc(0, radius * 0.3, radius, 0, Math.PI)
      context.quadraticCurveTo(-radius, -radius * 0.2, 0, -radius * 1.6)
      context.fill()
    }
    context.restore()
  }
}

/** A model's bounds, without its glows (halos are wider than the body, and would shrink it in its place). */
const boundsOf = (object: Object3D): Box3 => {
  // Box3 measures hidden parts too: the glows are detached while it measures.
  const glows: Array<{ glow: Object3D; parent: Object3D }> = []
  object.traverse((part) => {
    if (part.userData["glow"] === true && part.parent !== null) glows.push({ glow: part, parent: part.parent })
  })
  for (const { glow, parent } of glows) parent.remove(glow)
  const bounds = new Box3().setFromObject(object, true)
  for (const { glow, parent } of glows) parent.add(glow)
  return bounds
}

/** The CSS color of `name` on `element` (an element's `--el`), as a three color; white without one. */
const cssColor = (element: HTMLElement, name: string): Color => {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  try {
    return value === "" ? new Color(0xffffff) : new Color(value)
  } catch {
    return new Color(0xffffff)
  }
}

export interface Showcase {
  /** Draws the frame's models, `seconds` after the last one. */
  render(seconds: number): void
  destroy(): void
}

export const createShowcase = (parent: HTMLElement, models: ReadonlyMap<ModelId, ModelSource>): Showcase => {
  const renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2, alpha: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false
  const canvas = renderer.domElement
  canvas.className = "showcase"
  canvas.style.cssText = "position: absolute; inset: 0; pointer-events: none; z-index: 2"
  parent.append(canvas)
  const resize = () => renderer.setSize(window.innerWidth, window.innerHeight)
  resize()
  window.addEventListener("resize", resize)

  const scene = new Scene()
  const light = view.light
  scene.add(new HemisphereLight(light.sky, light.ground, light.skyIntensity * Math.PI))
  const key = new DirectionalLight(0xffffff, light.sunIntensity * Math.PI)
  key.position.set(stage.key.x, stage.key.y, stage.key.z)
  // Rim lights from behind, on both sides, in the element's color.
  const rims = [-1, 1].map((side) => {
    const rim = new DirectionalLight(0xffffff, stage.rim)
    rim.position.set(side * 2, 1.2, -2.5)
    return rim
  })
  scene.add(key, ...rims)
  const camera = new PerspectiveCamera(stage.fov, 1, 0.01, 50)

  const size = new Vector3()
  const center = new Vector3()
  /** Points the camera at `shown`, filling `fill` of a `width` × `height` view (or the top `head` of it). */
  const frame = (shown: Shown, width: number, height: number, fill: number, head: number) => {
    shown.bounds.getSize(size)
    shown.bounds.getCenter(center)
    const tall = size.y * head
    center.y = shown.bounds.max.y - tall / 2
    const aspect = width / height
    const tan = Math.tan((stage.fov * Math.PI) / 360)
    const distance = Math.max(tall / fill / 2 / tan, Math.max(size.x, size.z) / fill / 2 / (tan * aspect))
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    camera.position.set(center.x, center.y + tall * 0.08, center.z + distance)
    camera.lookAt(center)
  }
  const show = (shown: Shown) => {
    for (const child of scene.children) if (child.userData["shown"] === true) child.visible = child === shown.puppet.object
    for (const rim of rims) rim.color.copy(shown.rim)
  }
  const add = (key: string, puppet: Puppet, rim: Color): Shown => {
    puppet.object.userData["shown"] = true
    scene.add(puppet.object)
    return { key, puppet, bounds: boundsOf(puppet.object), rim }
  }
  const remove = (shown: Shown) => {
    scene.remove(shown.puppet.object)
    shown.puppet.dispose()
  }

  // Keep each character's idle running when the UI changes places.
  const live = new Map<string, Shown>()
  const reveals = new WeakMap<HTMLElement, number>()
  // Reduced motion (the player's setting, see `main.ts`) shows a new spirit at once.
  const reducedMotion = { get matches() { return document.documentElement.dataset["motion"] === "reduced" } }
  const liveFor = (place: HTMLElement): Shown | null => {
    const character = place.dataset["model"] as CharacterId | undefined
    if (character === undefined || !(character in characterLooks)) return null
    // As she wears it, or with a tint tried on (`data-tint`; `none`: her own colors).
    const tryOn = place.dataset["tint"] as CosmeticId | "none" | undefined
    const tint = tryOn === undefined ? wornTint(character) : tryOn === "none" ? undefined : tryOn
    const key = `${character}/${tint ?? ""}`
    const known = live.get(key)
    if (known !== undefined) return known
    const puppet = puppetOf(models, wornLook(characterLooks[character], tint === undefined ? {} : { tint }))
    if (puppet === null) return null
    const shown = add(key, puppet, cssColor(place, "--el"))
    live.set(key, shown)
    return shown
  }

  // Portraits, made once each into a picture: none is waited for (see `make`).
  const pictures = new Map<string, string>()
  const making = new Set<string>()
  const failed = new Set<string>()
  const across = stage.portraitPixels
  /** A canvas of its own for a picture (drawn on the CPU, so encoding it never waits on the GPU). */
  const canvasFor = (): HTMLCanvasElement => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = across
    return canvas
  }
  const contextOf = (canvas: HTMLCanvasElement) => canvas.getContext("2d", { willReadFrequently: true })!
  /** Encodes `canvas` as `id`'s picture, off the frame. */
  const keep = (id: string, canvas: HTMLCanvasElement) => canvas.toBlob((blob) => {
    making.delete(id)
    if (blob === null) failed.add(id)
    else pictures.set(id, URL.createObjectURL(blob))
  })
  /** Starts making `id`'s picture: drawn now, read back and encoded later. */
  const make = (id: string, place: HTMLElement): void => {
    making.add(id)
    const canvas = canvasFor()
    // A trail: a picture of what it sheds (her own, or a look's).
    const ownTrail = id.startsWith("trail:") ? characterLooks[id.slice("trail:".length) as CharacterId] : undefined
    const worn = id.startsWith("look:") ? (id.slice("look:".length) as CosmeticId) : null
    const trail = ownTrail?.kind === "model" ? ownTrail.drops : worn === null ? undefined : cosmeticLooks[worn].kind === "trail" ? (cosmeticLooks[worn] as { readonly drops: Omit<Drops, "rate"> }).drops : undefined
    if (trail !== undefined) {
      trailPicture(canvas, trail)
      return keep(id, canvas)
    }
    const enemy = id.startsWith("enemy:") ? (id.slice("enemy:".length) as EnemyKind) : null
    // A tint: her portrait wearing it.
    const tinted = worn === null ? null : cosmetics[worn].character
    const look = tinted !== null && worn !== null ? wornLook(characterLooks[tinted], { tint: worn }) : enemy === null ? characterLooks[id as CharacterId] : enemyLooks[enemy]
    const puppet = look === undefined || look.kind === "capsule" ? null : puppetOf(models, look, enemy === null ? stage.portraitTurn : stage.turn)
    // A placeholder (no model yet) shows its capsule, in its color.
    if (look?.kind === "capsule") {
      capsulePicture(canvas, look.color, look.widthFactor / look.heightFactor)
      return keep(id, canvas)
    }
    if (puppet === null) {
      making.delete(id)
      failed.add(id)
      return
    }
    const shown = add(id, puppet, cssColor(place, "--el"))
    show(shown)
    // Each shows whole: a character facing the camera, an enemy turned to show its shape.
    frame(shown, 1, 1, enemy === null ? stage.portraitFill : 0.8, 1)
    // A target of its own: it is read back after later frames have drawn.
    const target = new WebGLRenderTarget(across, across, { format: RGBAFormat, samples: 4 })
    target.texture.colorSpace = SRGBColorSpace
    renderer.setRenderTarget(target)
    renderer.clear()
    // Prepared first, the render itself costs next to nothing (measured: a frame's worth less per portrait).
    renderer.compile(scene, camera)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    remove(shown)
    const pixels = new Uint8Array(across * across * 4)
    void renderer.readRenderTargetPixelsAsync(target, 0, 0, across, across, pixels).then(() => {
      target.dispose()
      // The render target's rows go bottom to top.
      const image = new ImageData(across, across)
      const row = across * 4
      for (let y = 0; y < across; y++) image.data.set(pixels.subarray((across - 1 - y) * row, (across - y) * row), y * row)
      contextOf(canvas).putImageData(image, 0, 0)
      keep(id, canvas)
    }, () => {
      target.dispose()
      making.delete(id)
      failed.add(id)
    })
  }

  let drawn = false
  return {
    render(seconds) {
      // New portraits started within the frame's budget; the rest wait for the next frames.
      const until = performance.now() + stage.portraitBudget
      let started = 0
      for (const place of document.querySelectorAll<HTMLElement>("[data-portrait]")) {
        const id = place.dataset["portrait"]!
        if (place.dataset["drawn"] === id) continue

        const illustration = id.startsWith("enemy:") ? enemyPortraits[id.slice("enemy:".length) as EnemyKind] : null
        if (illustration != null) {
          const { url, sheet, crop } = illustration
          // Percentage sizing keeps the same close-up in cards and round indicators at any UI scale.
          place.style.backgroundImage = `url(${url})`
          place.style.backgroundSize = `${sheet.width / crop.size * 100}% ${sheet.height / crop.size * 100}%`
          place.style.backgroundPosition = `${crop.x / (sheet.width - crop.size) * 100}% ${crop.y / (sheet.height - crop.size) * 100}%`
          place.dataset["drawn"] = id
          continue
        }
        // A reused place may have shown an illustration before its model portrait.
        place.style.backgroundSize = ""
        place.style.backgroundPosition = ""
        const url = pictures.get(id)
        if (url === undefined) {
          if (!making.has(id) && !failed.has(id) && (started === 0 || performance.now() < until)) {
            started += 1
            make(id, place)
          }
          continue
        }
        place.style.backgroundImage = `url(${url})`
        place.dataset["drawn"] = id
      }
      // Keep the finite set of character previews alive across tabs so their idle never restarts.
      const places = document.querySelectorAll<HTMLElement>("[data-model]")
      if (places.length === 0 && !drawn) return
      renderer.setScissorTest(false)
      renderer.clear()
      drawn = false
      renderer.setScissorTest(true)
      const height = window.innerHeight
      for (const place of places) {
        const rect = place.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > height) continue
        const shown = liveFor(place)
        if (shown === null) continue
        shown.puppet.animate({ x: 0, y: 0 }, { x: 0, y: 1 }, seconds, false)
        // A newly earned spirit turns into the light once; its idle keeps running.
        const revealing = place.dataset["reveal"] === "true" && !reducedMotion.matches
        const elapsed = revealing ? Math.min(1, (reveals.get(place) ?? 0) + seconds) : 1
        if (revealing) reveals.set(place, elapsed)
        const arrival = 1 - (1 - elapsed) ** 3
        const turn = (place.dataset["turn"] === undefined ? stage.turn : Number(place.dataset["turn"])) + 0.6 * (1 - arrival)
        shown.puppet.face({ x: Math.sin(turn), y: Math.cos(turn) })
        show(shown)
        // Drawn into a wider view than its place, so its halo fades out instead of ending at the place's edge.
        const width = rect.width * stage.spill, tall = rect.height * stage.spill
        frame(shown, width, tall, (stage.fill * (0.78 + 0.22 * arrival)) / stage.spill, 1)
        const left = rect.left - (width - rect.width) / 2, bottom = height - rect.bottom - (tall - rect.height) / 2
        renderer.setViewport(left, bottom, width, tall)
        renderer.setScissor(left, bottom, width, tall)
        // Views overlap now: each model is drawn on its own depth.
        renderer.clearDepth()
        renderer.render(scene, camera)
        drawn = true
      }
      renderer.setScissorTest(false)
    },
    destroy() {
      window.removeEventListener("resize", resize)
      for (const shown of live.values()) remove(shown)
      live.clear()
      for (const url of pictures.values()) if (url.startsWith("blob:")) URL.revokeObjectURL(url)
      renderer.dispose()
      canvas.remove()
    }
  }
}
