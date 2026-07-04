// ── 3D competitor globe (three.js vanilla port of the Aceternity globe idea) ──
// A dotted sphere + glowing markers at competitor HQ / top-market locations,
// with animated arcs between them. Seeded from Sensor Tower competitor data.
import * as THREE from 'three'

export interface GlobePoint {
  lat: number
  lng: number
  label: string
  color: string
  size?: number
}

export interface GlobeArc {
  from: [number, number]  // [lat, lng]
  to: [number, number]
  color: string
}

const R = 1                // sphere radius (scene units)

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  )
}

// Build a great-circle arc between two lat/lng points, bulging outward.
function arcCurve(from: [number, number], to: [number, number]): THREE.Vector3[] {
  const start = latLngToVec3(from[0], from[1], R)
  const end   = latLngToVec3(to[0], to[1], R)
  const mid = start.clone().add(end).multiplyScalar(0.5)
  const dist = start.distanceTo(end)
  mid.normalize().multiplyScalar(R + dist * 0.5)  // lift midpoint off the surface
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  return curve.getPoints(50)
}

export function createGlobe(
  container: HTMLElement,
  points: GlobePoint[],
  arcs: GlobeArc[],
): () => void {
  const width = container.clientWidth
  const height = container.clientHeight

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
  camera.position.z = 3.2

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  // Root group we spin
  const globe = new THREE.Group()
  scene.add(globe)

  // Base sphere (subtle solid)
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.995, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x0c1a3a, transparent: true, opacity: 0.55 }),
  )
  globe.add(sphere)

  // Dotted surface (point cloud on a fibonacci sphere)
  const DOTS = 1400
  const dotPos = new Float32Array(DOTS * 3)
  for (let i = 0; i < DOTS; i++) {
    const y = 1 - (i / (DOTS - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const theta = i * Math.PI * (3 - Math.sqrt(5))  // golden angle
    dotPos[i * 3]     = Math.cos(theta) * rad * R
    dotPos[i * 3 + 1] = y * R
    dotPos[i * 3 + 2] = Math.sin(theta) * rad * R
  }
  const dotGeo = new THREE.BufferGeometry()
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3))
  const dots = new THREE.Points(
    dotGeo,
    new THREE.PointsMaterial({ color: 0x3b6fd6, size: 0.012, transparent: true, opacity: 0.55 }),
  )
  globe.add(dots)

  // Wireframe halo
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 1.001, 16, 12)),
    new THREE.LineBasicMaterial({ color: 0x1e4fae, transparent: true, opacity: 0.15 }),
  )
  globe.add(wire)

  // Markers
  const markerMat = (color: string) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
  for (const p of points) {
    const pos = latLngToVec3(p.lat, p.lng, R * 1.01)
    const marker = new THREE.Mesh(new THREE.SphereGeometry((p.size ?? 0.018), 12, 12), markerMat(p.color))
    marker.position.copy(pos)
    globe.add(marker)
    // glow ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry((p.size ?? 0.018) * 1.6, (p.size ?? 0.018) * 2.4, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color), transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
    )
    ring.position.copy(pos)
    ring.lookAt(0, 0, 0)
    globe.add(ring)
  }

  // Arcs — animated draw-in loop
  interface ArcObj { line: THREE.Line; total: number; geo: THREE.BufferGeometry; pts: THREE.Vector3[]; color: THREE.Color }
  const arcObjs: ArcObj[] = []
  for (const a of arcs) {
    const pts = arcCurve(a.from, a.to)
    const geo = new THREE.BufferGeometry()
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(a.color), transparent: true, opacity: 0.85 }))
    globe.add(line)
    arcObjs.push({ line, total: pts.length, geo, pts, color: new THREE.Color(a.color) })
  }

  // Lights not needed (basic materials), but add a soft ambient for rings
  scene.add(new THREE.AmbientLight(0xffffff, 1))

  // Initial tilt
  globe.rotation.x = 0.35

  let raf = 0
  let t = 0
  function animate() {
    raf = requestAnimationFrame(animate)
    t += 1
    globe.rotation.y += 0.0024

    // animate each arc drawing itself, then holding, then resetting
    arcObjs.forEach((arc, i) => {
      const cycle = (t + i * 40) % 260
      const grow = Math.min(arc.total, Math.floor((cycle / 160) * arc.total))
      const shown = arc.pts.slice(0, Math.max(2, grow))
      arc.geo.setFromPoints(shown)
    })

    renderer.render(scene, camera)
  }
  animate()

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  // dispose fn
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
    renderer.dispose()
    if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement)
  }
}