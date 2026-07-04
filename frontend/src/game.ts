export function startGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  interface Vec { x: number; y: number }
  interface Ball { pos: Vec; vel: Vec; r: number }
  interface Bullet { pos: Vec; vel: Vec; life: number }
  interface Particle { pos: Vec; vel: Vec; life: number; maxLife: number; r: number }

  const SAFE_R  = 220   // center exclusion radius (ship + balls)
  const MAX_SPD = 1.5
  const TURN    = 0.06  // max angle change per frame — keeps turns smooth

  // ── Ship ──
  const ship = {
    pos:          { x: 0, y: 0 } as Vec,
    vel:          { x: 0, y: 0 } as Vec,
    heading:      0,              // current travel angle (smooth)
    aimAngle:     0,              // rendered nose direction
    shootTimer:   0,
    shootInterval:42,
    target:       null as Ball | null,
    wanderTimer:  0,
    wanderInterval: 100,
    dest:         { x: 0, y: 0 } as Vec,
  }

  const balls:     Ball[]     = []
  const bullets:   Bullet[]   = []
  const particles: Particle[] = []

  function randomOutsideCenter(): Vec {
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h / 2
    const margin = 100
    let x: number, y: number
    do {
      x = margin + Math.random() * (w - margin * 2)
      y = margin + Math.random() * (h - margin * 2)
    } while (Math.hypot(x - cx, y - cy) < SAFE_R + 60)
    return { x, y }
  }

  const initPos = randomOutsideCenter()
  ship.pos.x = initPos.x
  ship.pos.y = initPos.y
  ship.dest   = randomOutsideCenter()
  ship.heading = Math.random() * Math.PI * 2

  // Spawn ball on a random edge, but steer it toward screen perimeter — not center
  function spawnBall() {
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h / 2
    const margin = 80

    // Pick a random point well outside center zone
    let tx: number, ty: number
    do {
      tx = margin + Math.random() * (w - margin * 2)
      ty = margin + Math.random() * (h - margin * 2)
    } while (Math.hypot(tx - cx, ty - cy) < SAFE_R + 80)

    // Spawn from a random edge
    const side = Math.floor(Math.random() * 4)
    let x = 0, y = 0
    if (side === 0)      { x = Math.random() * w; y = -30 }
    else if (side === 1) { x = w + 30; y = Math.random() * h }
    else if (side === 2) { x = Math.random() * w; y = h + 30 }
    else                 { x = -30; y = Math.random() * h }

    const dx = tx - x, dy = ty - y
    const len = Math.hypot(dx, dy)
    const speed = 0.35 + Math.random() * 0.45
    balls.push({
      pos: { x, y },
      vel: { x: dx / len * speed, y: dy / len * speed },
      r: 10 + Math.random() * 14,
    })
  }

  for (let i = 0; i < 3; i++) spawnBall()
  let ballSpawnTimer = 0

  function spawnExplosion(pos: Vec) {
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1.2 + Math.random() * 3
      const life  = 35 + Math.random() * 30
      particles.push({
        pos: { x: pos.x, y: pos.y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life, maxLife: life, r: 2 + Math.random() * 3,
      })
    }
  }

  // Shortest signed angle delta (–π … π)
  function angleDelta(from: number, to: number): number {
    let d = (to - from) % (Math.PI * 2)
    if (d >  Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    return d
  }

  function drawShip(x: number, y: number, angle: number) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    const s = 13
    ctx.beginPath()
    ctx.moveTo(s, 0)
    ctx.lineTo(-s * 0.7, -s * 0.55)
    ctx.lineTo(-s * 0.35, 0)
    ctx.lineTo(-s * 0.7,  s * 0.55)
    ctx.closePath()
    ctx.fillStyle   = 'rgba(160,200,255,0.28)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth   = 1.8
    ctx.shadowColor = 'rgba(100,160,255,1)'
    ctx.shadowBlur  = 14
    ctx.stroke()
    ctx.shadowBlur  = 0
    ctx.beginPath()
    ctx.arc(-s * 0.35, 0, 3, 0, Math.PI * 2)
    ctx.fillStyle   = 'rgba(140,200,255,1)'
    ctx.shadowColor = 'rgba(100,180,255,1)'
    ctx.shadowBlur  = 10
    ctx.fill()
    ctx.shadowBlur  = 0
    ctx.restore()
  }

  function nearestBall(): Ball | null {
    if (!balls.length) return null
    let best: Ball | null = null, bestD = Infinity
    for (const b of balls) {
      const d = Math.hypot(b.pos.x - ship.pos.x, b.pos.y - ship.pos.y)
      if (d < bestD) { bestD = d; best = b }
    }
    return best
  }

  function tick() {
    const w = canvas.width, h = canvas.height
    const cx = w / 2, cy = h / 2

    ctx.clearRect(0, 0, w, h)

    // ── Ship steering — chase nearest ball outside safe zone, else wander ──
    ship.target = nearestBall()

    // Use ball as dest if it's outside safe zone, otherwise wander
    if (ship.target && Math.hypot(ship.target.pos.x - cx, ship.target.pos.y - cy) > SAFE_R + ship.target.r) {
      ship.dest.x = ship.target.pos.x
      ship.dest.y = ship.target.pos.y
      ship.wanderTimer = 0
    } else {
      ship.wanderTimer++
      const toDxW = ship.dest.x - ship.pos.x
      const toDyW = ship.dest.y - ship.pos.y
      if (Math.hypot(toDxW, toDyW) < 40 || ship.wanderTimer > ship.wanderInterval) {
        ship.dest = randomOutsideCenter()
        ship.wanderTimer = 0
      }
    }

    const toDx   = ship.dest.x - ship.pos.x
    const toDy   = ship.dest.y - ship.pos.y

    // Desired heading toward dest
    const desiredH = Math.atan2(toDy, toDx)

    // Push away from center — nudge desired heading away if too close
    const distC  = Math.hypot(ship.pos.x - cx, ship.pos.y - cy)
    let targetH  = desiredH
    if (distC < SAFE_R + 60) {
      const awayAngle = Math.atan2(ship.pos.y - cy, ship.pos.x - cx)
      // blend: the closer, the more we override toward "away"
      const t = Math.max(0, 1 - (distC - SAFE_R) / 60)
      const delta = angleDelta(targetH, awayAngle)
      targetH += delta * t
      // also force a new wander dest so it doesn't keep steering back
      if (t > 0.7) ship.dest = randomOutsideCenter()
    }

    // Smoothly rotate heading — never more than TURN per frame
    const hDelta = angleDelta(ship.heading, targetH)
    ship.heading += Math.sign(hDelta) * Math.min(Math.abs(hDelta), TURN)

    // Accelerate in heading direction
    ship.vel.x += Math.cos(ship.heading) * 0.10
    ship.vel.y += Math.sin(ship.heading) * 0.10

    // Friction + speed cap
    ship.vel.x *= 0.96
    ship.vel.y *= 0.96
    const spd = Math.hypot(ship.vel.x, ship.vel.y)
    if (spd > MAX_SPD) { ship.vel.x = ship.vel.x / spd * MAX_SPD; ship.vel.y = ship.vel.y / spd * MAX_SPD }

    ship.pos.x += ship.vel.x
    ship.pos.y += ship.vel.y

    // Aim (nose) at nearest ball, else follow travel direction
    if (ship.target) {
      const dx = ship.target.pos.x - ship.pos.x
      const dy = ship.target.pos.y - ship.pos.y
      const targetAim = Math.atan2(dy, dx)
      const ad = angleDelta(ship.aimAngle, targetAim)
      ship.aimAngle += Math.sign(ad) * Math.min(Math.abs(ad), 0.08)
    } else {
      ship.aimAngle = ship.heading
    }

    // Shoot
    ship.shootTimer++
    if (ship.shootTimer >= ship.shootInterval && ship.target) {
      ship.shootTimer = 0
      bullets.push({
        pos: { x: ship.pos.x, y: ship.pos.y },
        vel: { x: Math.cos(ship.aimAngle) * 7, y: Math.sin(ship.aimAngle) * 7 },
        life: 130,
      })
    }

    // Spawn balls
    ballSpawnTimer++
    if (ballSpawnTimer > 360 && balls.length < 6) {
      ballSpawnTimer = 0
      spawnBall()
    }

    // Update balls — steer away from center if too close
    for (const b of balls) {
      const bd = Math.hypot(b.pos.x - cx, b.pos.y - cy)
      if (bd < SAFE_R + b.r + 10) {
        const awayX = (b.pos.x - cx) / bd
        const awayY = (b.pos.y - cy) / bd
        b.vel.x += awayX * 0.08
        b.vel.y += awayY * 0.08
        const bs = Math.hypot(b.vel.x, b.vel.y)
        if (bs > 1.2) { b.vel.x = b.vel.x / bs * 1.2; b.vel.y = b.vel.y / bs * 1.2 }
      }
      b.pos.x += b.vel.x
      b.pos.y += b.vel.y
    }

    // Update bullets + collision
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bl = bullets[i]
      bl.pos.x += bl.vel.x
      bl.pos.y += bl.vel.y
      bl.life--
      if (bl.life <= 0) { bullets.splice(i, 1); continue }
      let hit = false
      for (let j = balls.length - 1; j >= 0; j--) {
        const b = balls[j]
        if (Math.hypot(bl.pos.x - b.pos.x, bl.pos.y - b.pos.y) < b.r + 4) {
          spawnExplosion(b.pos)
          balls.splice(j, 1)
          bullets.splice(i, 1)
          hit = true
          break
        }
      }
      if (hit) continue
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.pos.x += p.vel.x
      p.pos.y += p.vel.y
      p.vel.x *= 0.93
      p.vel.y *= 0.93
      p.life--
      if (p.life <= 0) particles.splice(i, 1)
    }

    // ── Draw ──

    // balls
    for (const b of balls) {
      ctx.beginPath()
      ctx.arc(b.pos.x, b.pos.y, b.r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(80,140,255,0.75)'
      ctx.lineWidth   = 1.6
      ctx.shadowColor = 'rgba(60,120,255,0.7)'
      ctx.shadowBlur  = 14
      ctx.stroke()
      ctx.shadowBlur  = 0
      ctx.beginPath()
      ctx.arc(b.pos.x, b.pos.y, b.r * 0.45, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(100,160,255,0.18)'
      ctx.fill()
    }

    // bullets
    for (const bl of bullets) {
      ctx.beginPath()
      ctx.arc(bl.pos.x, bl.pos.y, 2.5, 0, Math.PI * 2)
      ctx.fillStyle   = 'rgba(200,225,255,0.95)'
      ctx.shadowColor = 'rgba(140,190,255,1)'
      ctx.shadowBlur  = 8
      ctx.fill()
      ctx.shadowBlur  = 0
    }

    // particles
    for (const p of particles) {
      const a = p.life / p.maxLife
      ctx.beginPath()
      ctx.arc(p.pos.x, p.pos.y, p.r * a, 0, Math.PI * 2)
      ctx.fillStyle   = `rgba(100,170,255,${a * 0.9})`
      ctx.shadowColor = `rgba(80,150,255,${a})`
      ctx.shadowBlur  = 6
      ctx.fill()
      ctx.shadowBlur  = 0
    }

    drawShip(ship.pos.x, ship.pos.y, ship.aimAngle)

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}
