import type { EnemyKind } from "../../content/enemies.ts"
import { elements } from "../../content/elements.ts"
import { affinityList, attackElements } from "../describe.ts"
import { Dialog } from "../Dialog.tsx"
import type { UiStore } from "../store.ts"
import { Portrait } from "./parts.tsx"

export const EnemyDetails = ({ store, kind, close }: { readonly store: UiStore; readonly kind: EnemyKind; readonly close: () => void }) => {
  const spec = store.tuning.value.enemies[kind]
  return <Dialog title={spec.name} close={close}>
    <div class="enemy-summary"><Portrait of={{ enemy: kind }} /><p>{spec.description}</p></div>
    <h3>Element matchups</h3>
    {affinityList(spec.elements).map(({ element, affinity }) => <p key={element}><b>{elements[element].name}</b> · {affinity === "weak" ? "Weak — stronger effect" : affinity === "resists" ? "Resistant — weaker effect" : "Immune to the effect; still takes damage"}</p>)}
    {affinityList(spec.elements).length === 0 && <p>No elemental strengths or weaknesses.</p>}
    <h3>Watch for</h3><p>{attackElements(spec.attacks).length === 0 ? "Physical attacks." : `${attackElements(spec.attacks).map((id) => elements[id].name).join(" and ")} attacks.`} Read the arena warnings and leave their marked area before the attack lands.</p>
    <p class="muted">An element helps your strategy. No particular character or element is required.</p>
  </Dialog>
}
