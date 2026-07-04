// ── Competitor globe — powered by COBE (5KB WebGL dotted-earth globe) ──
// Adds drag-to-rotate and clickable markers (COBE has no picking, so we
// project each marker's lat/lng to screen space and hit-test manually).
import createCobe from 'cobe'

export interface GlobePoint {
  lat: number
  lng: number
  label: string
  color: string
  size?: number
  meta?: Record<string, string>   // extra info shown on click
}

export interface GlobeArc {
  from: [number, number]
  to: [number, number]
  color: string
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

const DEG = Math.PI / 180

// Project a lat/lng to normalized screen coords given the globe's phi/theta.
// Returns { x, y, visible } where x,y ∈ [0,1] over the canvas, visible=facing us.
function project(lat: number, lng: number, phi: number, theta: number) {
  // COBE: phi rotates around Y (longitude), theta tilts around X.
  const latR = lat * DEG
  const lngR = lng * DEG
  // point on unit sphere (lng measured so that phi=0 faces +Z toward camera)
  let x = Math.cos(latR) * Math.sin(lngR + phi)
  let y = Math.sin(latR)
  let z = Math.cos(latR) * Math.cos(lngR + phi)
  // tilt by theta around X axis
  const y2 = y * Math.cos(theta) - z * Math.sin(theta)
  const z2 = y * Math.sin(theta) + z * Math.cos(theta)
  y = y2; z = z2
  return {
    x: 0.5 + x * 0.5,
    y: 0.5 - y * 0.5,
    visible: z > 0.15,
  }
}

export function createGlobe(
  container: HTMLElement,
  points: GlobePoint[],
  arcs: GlobeArc[],
  onSelect?: (p: GlobePoint | null) => void,
): () => void {
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.style.cursor = 'grab'
  container.appendChild(canvas)

  const size = Math.min(container.clientWidth, container.clientHeight) || 520
  const dpr = Math.min(window.devicePixelRatio, 2)
  const THETA = 0.28

  // rotation state (phi) + drag inertia
  let phi = 0
  let autoDir = 1
  let dragging = false
  let lastX = 0
  let velocity = 0.004     // idle auto-rotate speed
  let raf = 0

  const globe = createCobe(canvas, {
    devicePixelRatio: dpr,
    width: size * dpr,
    height: size * dpr,
    phi: 0,
    theta: THETA,
    dark: 1,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: 6,
    baseColor: [0.2, 0.34, 0.62],
    markerColor: [0.45, 0.68, 1],
    glowColor: [0.28, 0.5, 1],
    markers: points.map(p => ({
      location: [p.lat, p.lng] as [number, number],
      size: p.size ?? 0.06,
      color: hexRgb(p.color),
    })),
    arcs: arcs.map(a => ({ from: a.from, to: a.to, color: hexRgb(a.color) })),
  })

  function tick() {
    raf = requestAnimationFrame(tick)
    if (!dragging) {
      phi += velocity * autoDir
      // ease idle velocity back toward the gentle default after a drag fling
      velocity += (0.004 - velocity) * 0.03
    }
    globe.update({ phi })
  }
  raf = requestAnimationFrame(tick)

  // ── Drag to rotate ──
  function onDown(clientX: number) {
    dragging = true
    lastX = clientX
    canvas.style.cursor = 'grabbing'
  }
  function onMove(clientX: number) {
    if (!dragging) return
    const dx = clientX - lastX
    lastX = clientX
    const delta = dx * 0.005
    phi += delta
    velocity = Math.abs(delta) > 0.0005 ? Math.min(0.05, Math.abs(delta)) : velocity
    autoDir = delta >= 0 ? 1 : -1
  }
  function onUp() {
    dragging = false
    canvas.style.cursor = 'grab'
  }

  canvas.addEventListener('pointerdown', e => { onDown(e.clientX); canvas.setPointerCapture(e.pointerId) })
  canvas.addEventListener('pointermove', e => onMove(e.clientX))
  canvas.addEventListener('pointerup',   onUp)
  canvas.addEventListener('pointerleave', onUp)

  // ── Click a marker (hit-test projected positions) ──
  let downX = 0, downY = 0
  canvas.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY })
  canvas.addEventListener('pointerup', e => {
    // ignore if it was a drag (moved more than a few px)
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top) / rect.height
    let best: GlobePoint | null = null
    let bestD = 0.05   // hit radius in normalized units
    for (const p of points) {
      const s = project(p.lat, p.lng, phi, THETA)
      if (!s.visible) continue
      const d = Math.hypot(s.x - mx, s.y - my)
      if (d < bestD) { bestD = d; best = p }
    }
    onSelect?.(best)
  })

  function onResize() {
    const s = Math.min(container.clientWidth, container.clientHeight) || size
    globe.update({ width: s * dpr, height: s * dpr })
  }
  window.addEventListener('resize', onResize)

  canvas.style.opacity = '0'
  canvas.style.transition = 'opacity 0.6s ease'
  requestAnimationFrame(() => { canvas.style.opacity = '1' })

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
    globe.destroy()
    if (canvas.parentElement === container) container.removeChild(canvas)
  }
}