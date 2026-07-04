// ── Competitor globe — powered by COBE (5KB WebGL dotted-earth globe) ──
// Wrapped to keep the createGlobe(container, points, arcs) signature stable.
import createCobe from 'cobe'

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

// #rrggbb → [r,g,b] in 0..1
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

export function createGlobe(
  container: HTMLElement,
  points: GlobePoint[],
  arcs: GlobeArc[],
): () => void {
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.aspectRatio = '1'
  canvas.style.display = 'block'
  canvas.style.margin = '0 auto'
  container.appendChild(canvas)

  const size = Math.min(container.clientWidth, container.clientHeight) || 480
  const dpr = Math.min(window.devicePixelRatio, 2)

  let phi = 0
  let raf = 0

  const globe = createCobe(canvas, {
    devicePixelRatio: dpr,
    width: size * dpr,
    height: size * dpr,
    phi: 0,
    theta: 0.28,
    dark: 1,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: 6,
    baseColor: [0.2, 0.34, 0.62],        // dotted continents (blue)
    markerColor: [0.45, 0.68, 1],
    glowColor: [0.28, 0.5, 1],           // blue atmosphere glow
    markers: points.map(p => ({
      location: [p.lat, p.lng] as [number, number],
      size: p.size ?? 0.05,
      color: hexRgb(p.color),
    })),
    arcs: arcs.map(a => ({
      from: a.from,
      to: a.to,
      color: hexRgb(a.color),
    })),
  })

  // slow auto-rotate
  function tick() {
    raf = requestAnimationFrame(tick)
    phi += 0.004
    globe.update({ phi })
  }
  raf = requestAnimationFrame(tick)

  function onResize() {
    const s = Math.min(container.clientWidth, container.clientHeight) || size
    globe.update({ width: s * dpr, height: s * dpr })
  }
  window.addEventListener('resize', onResize)

  // fade in once the first frame is drawn
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