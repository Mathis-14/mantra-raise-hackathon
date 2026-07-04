// ── 3D competitor globe — three.js vanilla, styled after Aceternity's 3d-globe ──
// Dotted-Earth (continents drawn from an encoded land mask), glowing blue
// atmosphere, marker pins at competitor HQs, animated arcs. No external images.
import * as THREE from 'three'

export interface GlobePoint {
  lat: number
  lng: number
  label: string
  color: string
  size?: number
}

export interface GlobeArc {
  from: [number, number]
  to: [number, number]
  color: string
}

const R = 1

function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta),
  )
}

function arcCurve(from: [number, number], to: [number, number]): THREE.Vector3[] {
  const start = latLngToVec3(from[0], from[1], R * 1.01)
  const end   = latLngToVec3(to[0], to[1], R * 1.01)
  const mid = start.clone().add(end).multiplyScalar(0.5)
  const dist = start.distanceTo(end)
  mid.normalize().multiplyScalar(R + dist * 0.55)
  return new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(60)
}

// ── Coarse land mask: rectangles [lat0,lat1,lng0,lng1] roughly covering land.
// Dots are only kept when they fall inside one of these boxes → continents.
const LAND: [number, number, number, number][] = [
  // North America
  [15, 72, -168, -52],
  // Central America
  [7, 18, -105, -77],
  // South America
  [-56, 13, -82, -34],
  // Europe
  [36, 71, -10, 40],
  // Africa
  [-35, 37, -18, 52],
  // Middle East
  [12, 42, 34, 60],
  // Russia / North Asia
  [42, 78, 40, 180],
  // South + East Asia
  [5, 53, 60, 145],
  // India
  [6, 30, 68, 90],
  // SE Asia islands
  [-10, 20, 95, 141],
  // Australia
  [-39, -11, 113, 154],
  // New Zealand
  [-47, -34, 166, 179],
  // Japan
  [30, 46, 129, 146],
  // Greenland
  [60, 83, -55, -18],
]

function isLand(lat: number, lng: number): boolean {
  for (const [la0, la1, lo0, lo1] of LAND) {
    if (lat >= la0 && lat <= la1 && lng >= lo0 && lng <= lo1) return true
  }
  return false
}

export function createGlobe(
  container: HTMLElement,
  points: GlobePoint[],
  arcs: GlobeArc[],
): () => void {
  const width = container.clientWidth
  const height = container.clientHeight

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
  camera.position.z = 3.1

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const globe = new THREE.Group()
  globe.rotation.x = 0.28
  scene.add(globe)

  // ── Ocean sphere (deep blue) ──
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.99, 64, 64),
    new THREE.MeshPhongMaterial({ color: 0x0b1e46, shininess: 12, specular: 0x1a3a7a }),
  )
  globe.add(ocean)

  // ── Continents as a dotted point cloud (only on land) ──
  const SAMPLES = 9000
  const landPos: number[] = []
  for (let i = 0; i < SAMPLES; i++) {
    const y = 1 - (i / (SAMPLES - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const theta = i * Math.PI * (3 - Math.sqrt(5))
    const x = Math.cos(theta) * rad
    const z = Math.sin(theta) * rad
    // to lat/lng
    const lat = 90 - Math.acos(y) * (180 / Math.PI)
    let lng = (Math.atan2(z, x) * (180 / Math.PI))
    if (lng > 180) lng -= 360
    if (isLand(lat, lng)) {
      landPos.push(x * R * 1.002, y * R * 1.002, z * R * 1.002)
    }
  }
  const landGeo = new THREE.BufferGeometry()
  landGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(landPos), 3))
  const land = new THREE.Points(
    landGeo,
    new THREE.PointsMaterial({ color: 0x5b9bff, size: 0.02, transparent: true, opacity: 0.9, sizeAttenuation: true }),
  )
  globe.add(land)

  // ── Glowing blue atmosphere (backside-rendered shell) ──
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x4da6ff) } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      uniform vec3 uColor;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
        gl_FragColor = vec4(uColor, 1.0) * intensity;
      }`,
  })
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 48, 48), atmoMat)
  scene.add(atmosphere)

  // ── Markers (pins with glow rings) ──
  for (const p of points) {
    const pos = latLngToVec3(p.lat, p.lng, R * 1.01)
    const col = new THREE.Color(p.color)
    const size = p.size ?? 0.02
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(size, 14, 14),
      new THREE.MeshBasicMaterial({ color: col }),
    )
    marker.position.copy(pos)
    globe.add(marker)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size * 1.7, size * 2.6, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    )
    ring.position.copy(pos)
    ring.lookAt(0, 0, 0)
    globe.add(ring)
  }

  // ── Animated arcs ──
  interface ArcObj { geo: THREE.BufferGeometry; pts: THREE.Vector3[]; total: number }
  const arcObjs: ArcObj[] = []
  for (const a of arcs) {
    const pts = arcCurve(a.from, a.to)
    const geo = new THREE.BufferGeometry()
    globe.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: new THREE.Color(a.color), transparent: true, opacity: 0.9,
    })))
    arcObjs.push({ geo, pts, total: pts.length })
  }

  // Lights
  scene.add(new THREE.AmbientLight(0x88aaff, 0.6))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(-2, 1.5, 2)
  scene.add(dir)

  const AUTO_ROTATE = 0.3   // matches Aceternity autoRotateSpeed
  let raf = 0
  let t = 0
  let last = performance.now()
  function animate(now: number) {
    raf = requestAnimationFrame(animate)
    const dt = (now - last) / 1000
    last = now
    t += 1
    globe.rotation.y += AUTO_ROTATE * dt

    arcObjs.forEach((arc, i) => {
      const cycle = (t + i * 34) % 240
      const grow = Math.min(arc.total, Math.floor((cycle / 150) * arc.total))
      arc.geo.setFromPoints(arc.pts.slice(0, Math.max(2, grow)))
    })

    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(animate)

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
    renderer.dispose()
    if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement)
  }
}