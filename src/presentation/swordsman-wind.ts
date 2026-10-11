/** Wind belongs to the 3D spirit: far ribbons pass behind its body.
 * Gust, the Cyclone and her basic blows share this light, rather than flat swords. */
import { Action, Airborne, Cast, Game, Member, Player, RenderClock, RenderHost, RenderNodes, Vortex } from "../schema.ts"
import { view } from "../config/view.ts"

export const ShowSwordsmanWind = Game.System("Shooter/ShowSwordsmanWind", {
  queries: {
    player: Game.Query({ selection: { member: Game.Query.read(Member), airborne: Game.Query.optional(Airborne) }, with: [Player] }),
    vortices: Game.Query({ selection: { vortex: Game.Query.read(Vortex) } })
  },
  events: { cast: Game.System.readEvent(Cast), action: Game.System.readEvent(Action) },
  services: { host: Game.System.service(RenderHost), nodes: Game.System.service(RenderNodes), clock: Game.System.service(RenderClock) }
}, ({ queries, events, services }) => {
  const host = services.host
  const light = host.combatLight
  const now = performance.now() / 1000
  const [player] = queries.player.each()
  for (const cast of events.cast.all()) {
    if (cast.skill === "bladeWave" && cast.landing === true && cast.effect.kind === "blast") light.gust(cast.from, cast.effect.radius)
  }
  for (const { data } of queries.vortices.each()) {
    const vortex = data.vortex.get()
    if (vortex.blow.source?.label?.kind !== "skill" || vortex.blow.source.label.skill !== "cyclone") continue
    const fade = Math.min(1, vortex.remaining / 0.4)
    // Broken currents rise through a tapering funnel, with air between the wisps.
    for (let arm = 0; arm < 3; arm++) {
      for (let band = 0; band < 3; band++) {
        const points = Array.from({ length: 13 }, (_, index) => {
          const t = (band + index / 18) / 3
          const a = now * 8 + arm * Math.PI * 2 / 3 + t * Math.PI * 3
          const radius = 18 + t * vortex.effect.radius * 0.5
          return { x: vortex.center.x + Math.cos(a) * radius, y: 6 + t * 105, z: vortex.center.y + Math.sin(a) * radius }
        })
        light.ribbon(points, 2.1, view.elements.wind, fade * 0.35)
      }
    }
  }
  if (player === undefined || player.data.member.get().character !== "swordsman") return
  const node = services.nodes.get(player.entity.id)
  if (node?.kind !== "player") return
  const at = node.root.position
  const height = node.pivot.position.y + node.body.height * 0.5
  const air = player.data.airborne.present ? player.data.airborne.get() : null
  if (air !== null) {
    for (let arm = 0; arm < 3; arm++) {
      const points = Array.from({ length: 25 }, (_, index) => {
        const t = index / 24
        const angle = now * (air.kind === "soar" ? 18 : 11) + arm * Math.PI * 2 / 3 - t * 2.4
        const radius = node.body.radius * (1.3 + t * 0.8)
        return { x: at.x + Math.cos(angle) * radius, y: height + (arm - 1) * 12 + Math.sin(angle) * 7 - t * 8, z: at.z + Math.sin(angle) * radius }
      })
      light.ribbon(points, 1.8, arm === 0 ? 0xf0fff5 : view.elements.wind, 0.85)
    }
  }
  // A short glint runs across her actual silhouette when a basic blow leaves.
  for (const action of events.action.all()) {
    if (action.kind !== "attack" || action.move.shape === "shot" || action.move.shape === "disc" || action.move.shape === "lob") continue
    light.launch({ x: at.x + action.direction.x * node.body.radius, y: at.z + action.direction.y * node.body.radius }, height, action.direction, view.elements.wind, "spark")
  }
})
