/**
 * Style B of the art lab: the same characters as flat, cel-shaded vector
 * shapes drawn with Pixi graphics (fills, one shade step toward the
 * bottom-right, a highlight, and a dark outline). Animated in code: parts
 * move, nothing is drawn per frame.
 *
 * Coordinates are screen pixels at zoom 1, with the feet at (0, 0).
 */
import { Container, Graphics } from "pixi.js"

import { ink } from "../../art/palette.ts"

const line = { width: 1.6, color: ink.k, join: "round" as const, cap: "round" as const }

export interface VectorActor {
  readonly root: Container
  /** Poses the actor at `time` seconds, facing the camera or away, standing or running. */
  pose(time: number, facing: "front" | "back", running: boolean): void
}

/** A disc shaded like a ball lit from the top-left: shade, then the lit part offset up-left, then a highlight. */
const shadedBall = (g: Graphics, x: number, y: number, radius: number, colors: { light: number; mid: number; shade: number }): Graphics => {
  g.circle(x, y, radius).fill({ color: colors.shade })
  g.circle(x - radius * 0.12, y - radius * 0.13, radius * 0.83).fill({ color: colors.mid })
  g.ellipse(x - radius * 0.38, y - radius * 0.45, radius * 0.28, radius * 0.18).fill({ color: colors.light })
  return g.circle(x, y, radius).stroke(line)
}

export const vectorSwordsman = (): VectorActor => {
  const root = new Container()

  const sword = new Graphics()
  sword.roundRect(-1.8, -6, 3.6, 40, 1.5).fill({ color: ink.v }).stroke(line)
  sword.rect(-0.2, -4, 1.8, 36).fill({ color: ink.V })
  sword.roundRect(-5, -8, 10, 3, 1.2).fill({ color: ink.g }).stroke(line)
  sword.roundRect(-1.6, -15, 3.2, 7, 1).fill({ color: ink.b }).stroke(line)
  sword.circle(0, -16, 1.8).fill({ color: ink.g }).stroke(line)

  const leg = (x: number) => {
    const g = new Graphics()
    g.roundRect(x - 3, -15, 6, 10, 2).fill({ color: ink.n }).stroke(line)
    g.roundRect(x - 3.6, -7, 7.2, 7, 2.5).fill({ color: ink.b }).stroke(line)
    g.rect(x - 2.4, -6, 2.5, 2).fill({ color: 0xa8714c })
    return g
  }
  const leftLeg = leg(-4)
  const rightLeg = leg(4)

  const arm = (side: -1 | 1) => {
    const g = new Graphics()
    g.roundRect(side * 12 - 3.5, -30, 7, 15, 3.5).fill({ color: side < 0 ? ink.T : ink.q }).stroke(line)
    g.circle(side * 12, -14, 3.4).fill({ color: ink.s }).stroke(line)
    return g
  }
  const leftArm = arm(-1)
  const rightArm = arm(1)

  const torso = (facing: "front" | "back") => {
    const g = new Graphics()
    g.poly([-10, -32, 10, -32, 13, -11, -13, -11]).fill({ color: ink.T }).stroke(line)
    // Shade on the side away from the light.
    g.poly([4, -32, 10, -32, 13, -11, 6, -11]).fill({ color: ink.q })
    g.moveTo(0, -20).lineTo(0, -11).stroke({ width: 1.2, color: ink.Q })
    g.rect(-12, -21, 24, 3.6).fill({ color: ink.b }).stroke({ ...line, width: 1.2 })
    if (facing === "front") {
      g.poly([-5, -32, 5, -32, 0, -24]).fill({ color: ink.c }).stroke({ ...line, width: 1.2 })
      g.rect(-2, -21.4, 4, 4.4).fill({ color: ink.g }).stroke({ ...line, width: 1 })
      g.circle(0, -30, 1.6).fill({ color: ink.g })
    }
    g.poly([-10, -32, 10, -32, 13, -11, -13, -11]).stroke(line)
    return g
  }
  const torsoFront = torso("front")
  const torsoBack = torso("back")

  const headFront = new Graphics()
  // Face.
  headFront.ellipse(0, -46, 15, 14).fill({ color: ink.s }).stroke(line)
  headFront.ellipse(5, -40, 9, 6).fill({ color: ink.S, alpha: 0.5 })
  // Eyes: dark top, lighter bottom, a white highlight; then blush and a small mouth.
  for (const side of [-1, 1]) {
    headFront.ellipse(side * 5.5, -43, 2.6, 3.6).fill({ color: ink.e })
    headFront.ellipse(side * 5.5, -41.6, 2.2, 1.8).fill({ color: ink.E })
    headFront.circle(side * 5.5 - 0.9, -44.4, 1.1).fill({ color: ink.w })
    headFront.moveTo(side * 5.5 - 2.8, -46.6).lineTo(side * 5.5 + 2.8, -46.8).stroke({ width: 1.4, color: ink.k, cap: "round" })
    headFront.ellipse(side * 9, -38, 2.2, 1.2).fill({ color: ink.p, alpha: 0.8 })
  }
  headFront.moveTo(-1, -36).lineTo(1.2, -36).stroke({ width: 1.2, color: ink.m, cap: "round" })
  // Hair: a cap over the top with pointed bangs, side locks, and an ahoge.
  const hairCap = [-16, -44, -16, -52, -11, -59, -3, -62, 5, -61.5, 12, -58.5, 16.5, -51, 16, -44, 13, -42, 10.5, -48, 7.5, -42.5, 4, -49.5, 1, -43, -2.5, -49.5, -6, -42.5, -9.5, -48.5, -12.5, -41.5]
  headFront.poly(hairCap).fill({ color: ink.h })
  headFront.poly([8, -61, 12, -58.5, 16.5, -51, 16, -44, 13, -42, 12.5, -50]).fill({ color: ink.H })
  headFront.moveTo(-10, -55).quadraticCurveTo(-3, -60, 6, -58).stroke({ width: 2, color: ink.w, cap: "round" })
  headFront.poly(hairCap).stroke(line)
  for (const side of [-1, 1]) {
    headFront.poly([side * 16, -46, side * 13, -42, side * 13.5, -33, side * 16.5, -29, side * 17.5, -38]).fill({ color: side < 0 ? ink.H : ink.j }).stroke(line)
  }
  headFront.moveTo(-1, -61.5).quadraticCurveTo(-1, -68, 4, -68).stroke({ width: 3.6, color: ink.k, cap: "round" })
  headFront.moveTo(-1, -61.5).quadraticCurveTo(-1, -68, 4, -68).stroke({ width: 1.8, color: ink.h, cap: "round" })

  const headBack = new Graphics()
  const hairBack = [-16, -44, -16, -52, -11, -59, -3, -62, 5, -61.5, 12, -58.5, 16.5, -51, 16, -44, 17, -36, 14.5, -32, 11, -35, 7, -31, 3, -34, -1, -31, -5, -34, -9, -31, -12.5, -35, -15, -32, -17, -36]
  headBack.poly(hairBack).fill({ color: ink.H })
  headBack.poly([-12, -55, -3, -60, 6, -59, 2, -50, -8, -48]).fill({ color: ink.h })
  headBack.poly([16.5, -51, 16, -44, 17, -36, 14.5, -32, 11, -35, 7, -31, 3, -34, 6, -42, 12, -50]).fill({ color: ink.j })
  headBack.moveTo(-10, -55).quadraticCurveTo(-3, -60, 6, -58).stroke({ width: 2, color: ink.w, cap: "round" })
  headBack.poly(hairBack).stroke(line)
  headBack.moveTo(-1, -61.5).quadraticCurveTo(-1, -68, 4, -68).stroke({ width: 3.6, color: ink.k, cap: "round" })
  headBack.moveTo(-1, -61.5).quadraticCurveTo(-1, -68, 4, -68).stroke({ width: 1.8, color: ink.h, cap: "round" })

  const upper = new Container()
  root.addChild(leftLeg, rightLeg, upper)

  return {
    root,
    pose(time, facing, running) {
      const front = facing === "front"
      upper.removeChildren()
      // From the front the sword hangs behind the body, hilt over the left shoulder; from behind it lies across the back.
      sword.position.set(front ? -12 : 12, front ? -50 : -52)
      sword.rotation = front ? -0.7 : 0.7
      if (front) upper.addChild(sword)
      upper.addChild(leftArm, rightArm, front ? torsoFront : torsoBack, front ? headFront : headBack)
      if (!front) upper.addChild(sword)
      const phase = time * (running ? 10 : 2.4) * Math.PI
      if (running) {
        leftLeg.y = -Math.max(0, Math.sin(phase)) * 3.5
        rightLeg.y = -Math.max(0, -Math.sin(phase)) * 3.5
        upper.y = Math.abs(Math.cos(phase)) * -2
        leftArm.y = Math.sin(phase) * 1.5
        rightArm.y = -Math.sin(phase) * 1.5
      } else {
        leftLeg.y = 0
        rightLeg.y = 0
        upper.y = (Math.sin(phase) + 1) * 0.6
        leftArm.y = 0
        rightArm.y = 0
      }
    }
  }
}

export const vectorChaser = (): VectorActor => {
  const root = new Container()
  const foot = (x: number) => new Graphics().ellipse(x, -2.5, 5, 3.5).fill({ color: ink.r }).stroke(line)
  const leftFoot = foot(-8)
  const rightFoot = foot(8)

  const claws = (side: -1 | 1) => {
    const g = new Graphics()
    const x = side * 17
    g.ellipse(x, -18, 4.5, 3.5).fill({ color: side < 0 ? ink.O : ink.r }).stroke(line)
    for (const angle of [-0.55, 0, 0.55]) {
      const tipX = x + side * Math.cos(angle) * 10
      const tipY = -18 + Math.sin(angle) * 9
      g.moveTo(x + side * 3, -18).lineTo(tipX, tipY).stroke({ width: 4.2, color: ink.k, cap: "round" })
      g.moveTo(x + side * 3, -18).lineTo(tipX, tipY).stroke({ width: 2, color: side < 0 ? ink.l : ink.L, cap: "round" })
    }
    return g
  }
  const leftClaws = claws(-1)
  const rightClaws = claws(1)

  const horns = new Graphics()
  for (const side of [-1, 1]) {
    horns.moveTo(side * 6, -33).quadraticCurveTo(side * 10, -42, side * 14, -48).quadraticCurveTo(side * 13, -40, side * 11.5, -31).closePath()
      .fill({ color: side < 0 ? ink.l : ink.L }).stroke(line)
  }

  const bodyFront = shadedBall(new Graphics(), 0, -20, 18, { light: ink.o, mid: ink.O, shade: ink.r })
  for (const side of [-1, 1]) {
    // Angry eyes: a slanted dark socket with a glowing core.
    bodyFront.poly([side * 2.5, -24, side * 11, -28, side * 11, -22, side * 4, -21]).fill({ color: ink.k })
    bodyFront.poly([side * 4, -23, side * 9.5, -25.6, side * 9.5, -23, side * 5, -22]).fill({ color: ink.y })
  }
  bodyFront.moveTo(-8, -14).quadraticCurveTo(0, -6, 8, -14).closePath().fill({ color: ink.k })
  for (const x of [-4.5, 0, 4.5]) bodyFront.poly([x - 1.6, -13.2, x + 1.6, -13.2, x, -10.4]).fill({ color: ink.l })

  const bodyBack = shadedBall(new Graphics(), 0, -20, 18, { light: ink.o, mid: ink.O, shade: ink.r })
  for (const y of [-33, -26, -19, -12]) bodyBack.poly([-2, y + 2, 0, y - 2, 2, y + 2]).fill({ color: ink.R })

  const upper = new Container()
  root.addChild(leftFoot, rightFoot, upper)

  return {
    root,
    pose(time, facing, running) {
      upper.removeChildren()
      upper.addChild(horns, leftClaws, rightClaws, facing === "front" ? bodyFront : bodyBack)
      const phase = time * (running ? 12 : 3) * Math.PI
      upper.y = running ? Math.abs(Math.sin(phase)) * -2.5 : (Math.sin(phase) + 1) * 0.7
      leftFoot.y = running ? -Math.max(0, Math.sin(phase)) * 3 : 0
      rightFoot.y = running ? -Math.max(0, -Math.sin(phase)) * 3 : 0
      leftClaws.y = running ? Math.sin(phase) * 2 : 0
      rightClaws.y = running ? -Math.sin(phase) * 2 : 0
    }
  }
}
