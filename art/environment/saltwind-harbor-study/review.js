import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Puppet } from '/src/presentation/puppet.ts'
import { models } from '/src/presentation/models.ts'

const [manifest, kit] = await Promise.all([
  fetch('./manifest.json').then(r => r.json()), fetch('./kit.json').then(r => r.json())
])
const loader = new GLTFLoader()
const sources = new Map(await Promise.all(manifest.assets.map(async a => [a.id, (await loader.loadAsync(a.file)).scene])))
const spiritGltf = await loader.loadAsync(models.waterSpirit.url)
const spiritSource = { id: 'waterSpirit', spec: models.waterSpirit, scene: spiritGltf.scene, clips: new Map(spiritGltf.animations.map(a => [a.name, a])) }
const oldIds = ['harborLanternHook', 'harborBollard', 'harborBarrelStack']
const originals = new Map(await Promise.all(oldIds.map(async id => [id, (await loader.loadAsync(models[id].url)).scene])))
const metadata = new Map(manifest.assets.map(a => [a.id, a]))
const names = {
  'rope-coil': 'Continuous rope coil', 'bucket': 'Bucket with a joined handle',
  'fish-basket': 'Slatted fish basket', 'folded-sail': 'Folded and tied sailcloth',
  'bollard': 'Compact mooring bollard', 'life-ring-stand': 'Supported life ring',
  'cargo-crate': 'Framed cargo crate', 'barrel': 'Staved barrel', 'barrel-stack': 'Compact barrel stack',
  'handcart': 'Cart with axle and parking leg', 'lantern-post': 'Supported hanging lantern',
  'net-rack': 'Braced drying rack', 'mooring-cluster': 'Mooring deck and rope',
  'boat-on-cradle': 'Boat on a timber cradle', 'dock-crane': 'Crane and grounded cargo',
  'net-shed': 'Canvas and net shed', 'quay-loading-bay': 'Quay loading bay'
}
const canvas = document.querySelector('#canvas')
const stage = document.querySelector('#stage')
const labels = document.querySelector('#labels')
const renderer = new T.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
renderer.autoClear = false
let view = new URLSearchParams(location.search).get('view') || 'small'
let turn = 0
let cards = []
let owned = []

function sceneFor(object, width = 4, depth = 4) {
  const scene = new T.Scene()
  scene.background = new T.Color('#263943')
  const hemi = new T.HemisphereLight(0xffffff, 0x8c8c8c, .62 * Math.PI)
  const key = new T.DirectionalLight(0xffffff, .41 * Math.PI)
  key.position.set(.6, 1.6, -.3)
  scene.add(hemi, key, object)
  const floor = new T.Mesh(new T.PlaneGeometry(width, depth), new T.MeshLambertMaterial({ color: '#526168', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0
  scene.add(floor)
  owned.push(floor)
  return scene
}

function player(scene, at) {
  const puppet = new Puppet(spiritSource, kit.player_height_m, null)
  puppet.face({ x: .7, y: .7 })
  puppet.animate({ x: 0, y: 0 }, { x: .7, y: .7 }, 0, false)
  puppet.object.position.set(...at)
  scene.add(puppet.object)
  owned.push(puppet)
}

function card(id, original = false, caption = null) {
  const object = (original ? originals : sources).get(id).clone(true)
  const box = new T.Box3().setFromObject(object)
  const size = box.getSize(new T.Vector3())
  const center = box.getCenter(new T.Vector3())
  const scene = sceneFor(object, 15, 15)
  // Put the reference toward the camera, to avoid hiding it behind a large assembly.
  player(scene, [-size.x / 2 - .34, 0, size.z / 2 + .16])
  const height = original ? models[id].height : metadata.get(id).dimensions_m[1]
  return { scene, target: new T.Vector3(center.x - .15, Math.min(height * .38, .7), center.z),
    title: caption || names[id], details: `${height.toFixed(2)} m tall · ${(height / kit.player_height_m).toFixed(1)}× player height`,
    ppm: view === 'large' ? 95 : view === 'compare' ? 110 : 140 }
}

function outside() {
  const scene = sceneFor(new T.Group(), 50, 50)
  scene.background.set('#1c303c')
  const grid = new T.Mesh(new T.BoxGeometry(8, .16, 7), new T.MeshLambertMaterial({ color: '#697a78' }))
  grid.position.set(0, -.08, .65)
  scene.add(grid)
  owned.push(grid)
  // The combat floor ends at z=-2.85. All bulky dressing is outside it.
  const lines = []
  for (let x = -4; x <= 4; x++) lines.push(x, .004, -2.85, x, .004, 4.15)
  for (let z = -2.85; z <= 4.15; z++) lines.push(-4, .004, z, 4, .004, z)
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.Float32BufferAttribute(lines, 3))
  const gridLines = new T.LineSegments(geo, new T.LineBasicMaterial({ color: '#8c9891', transparent: true, opacity: .38 }))
  scene.add(gridLines)
  owned.push(gridLines)
  const edge = new T.Mesh(new T.BoxGeometry(8.4, .08, .18), new T.MeshLambertMaterial({ color: '#c4b28d' }))
  edge.position.set(0, .027, -2.93)
  scene.add(edge)
  owned.push(edge)
  const placements = [
    ['net-shed', -2.60, -4.05, 0], ['dock-crane', .12, -4.05, 0],
    ['quay-loading-bay', 2.90, -4.00, 0], ['boat-on-cradle', 5.05, -1.85, Math.PI / 2],
    ['mooring-cluster', -5.02, -1.20, Math.PI / 2], ['net-rack', -4.70, 1.30, Math.PI / 2],
    ['lantern-post', 4.60, 1.70, -Math.PI / 2], ['handcart', -4.90, 3.15, Math.PI / 2],
    ['fish-basket', 4.80, 3.25, 0], ['folded-sail', 4.55, 3.60, 0],
    ['bucket', -4.55, 2.45, 0], ['life-ring-stand', 4.70, .35, -Math.PI / 2]
  ]
  const footprints = []
  for (const [id, x, z, yaw] of placements) {
    const obj = sources.get(id).clone(true)
    obj.position.set(x, 0, z)
    obj.rotation.y = yaw
    scene.add(obj)
    const bounds = new T.Box3().setFromObject(obj)
    footprints.push({ id, min: bounds.min.toArray(), max: bounds.max.toArray(),
      overlapsCombatFloor: bounds.min.x < 4 && bounds.max.x > -4 && bounds.min.z < 4.15 && bounds.max.z > -2.85 })
  }
  player(scene, [-.35, 0, .50])
  player(scene, [-1.18, 0, -2.35])
  return { scene, footprints, target: new T.Vector3(.3, .3, -.9), ppm: 85,
    title: 'Harbor dressing outside the grid', details: 'Gold edge marks the combat floor · all large assemblies are beyond it · blue spirits show the current player scale' }
}

function rebuild() {
  for (const item of owned) {
    if (item instanceof Puppet) item.dispose()
    else { item.geometry?.dispose(); item.material?.dispose() }
  }
  owned = []
  labels.replaceChildren()
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)))
  const descriptions = {
    small: 'Small grounded details · blue spirit is 0.58 m tall · shared scale across the sheet',
    working: 'Compact working props · visible supports and attached details · blue spirit is 0.58 m tall',
    large: 'Larger supported assemblies for outside the combat grid · blue spirit is 0.58 m tall',
    compare: 'Original on the left, study on the right · each pair uses identical camera scale and the current player',
    outside: 'A layout study with small details, working props and large assemblies around a clear combat floor'
  }
  document.querySelector('#description').textContent = descriptions[view]
  if (view === 'outside') cards = [outside()]
  else if (view === 'compare') cards = [
    card('harborLanternHook', true, 'Original lantern'), card('lantern-post', false, 'Study lantern'),
    card('harborBollard', true, 'Original bollard'), card('bollard', false, 'Study bollard'),
    card('harborBarrelStack', true, 'Original barrel stack'), card('barrel-stack', false, 'Study barrel stack')
  ]
  else cards = kit.assets.filter(a => a.group === view).map(a => card(a.id))
  const url = new URL(location.href)
  url.searchParams.set('view', view)
  history.replaceState(null, '', url)
  render()
  window.__harborStudy = { view, assets: manifest.assets, playerHeight: kit.player_height_m, footprints: cards[0]?.footprints ?? null }
}

function render() {
  const width = stage.clientWidth
  const cols = view === 'outside' ? 1 : view === 'compare' ? 2 : width < 650 ? 2 : view === 'large' ? 2 : 3
  const cw = width / cols
  const ch = view === 'outside' ? Math.max(200, innerHeight - document.querySelector('header').offsetHeight - 38) : view === 'large' ? 340 : width < 650 ? 230 : 310
  const height = ch * Math.ceil(cards.length / cols)
  renderer.setSize(width, height)
  labels.replaceChildren()
  renderer.setScissorTest(false)
  renderer.clear()
  renderer.setScissorTest(true)
  cards.forEach((card, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch
    const ppm = view === 'outside' ? Math.min(width / 15.2, ch / 8.4) : Math.min(card.ppm, cw / (view === 'large' ? 4.1 : 2.7))
    const camera = new T.OrthographicCamera(-cw / ppm / 2, cw / ppm / 2, ch / ppm / 2, -ch / ppm / 2, .01, 100)
    const angle = Math.PI / 4 + turn
    camera.position.copy(card.target).add(new T.Vector3(Math.sin(angle) * 17.32, 10, Math.cos(angle) * 17.32))
    camera.lookAt(card.target)
    renderer.setViewport(x, height - y - ch, cw, ch)
    renderer.setScissor(x, height - y - ch, cw, ch)
    renderer.render(card.scene, camera)
    const label = document.createElement('div')
    label.className = 'label'
    label.style.cssText = `left:${x}px;top:${y + ch - 60}px;width:${cw}px;z-index:10`
    label.innerHTML = `<b>${card.title}</b><span>${card.details}</span>`
    labels.append(label)
  })
  renderer.setScissorTest(false)
}

document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; turn = 0; rebuild() }))
let dragging = null
canvas.addEventListener('pointerdown', e => { dragging = e.clientX; canvas.setPointerCapture(e.pointerId) })
canvas.addEventListener('pointermove', e => { if (dragging === null) return; turn += (e.clientX - dragging) * .008; dragging = e.clientX; render() })
canvas.addEventListener('pointerup', () => { dragging = null })
canvas.addEventListener('pointercancel', () => { dragging = null })
window.addEventListener('resize', render)
rebuild()
