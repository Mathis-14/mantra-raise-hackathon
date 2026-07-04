// ── Page 2 : Computer Use — 4 parallel sessions ──

const SESSIONS = [
  { id: 0, title: 'Speed Dash',   color: '#2563eb', angle:   0 },
  { id: 1, title: 'Block Blitz',  color: '#0891b2', angle:  72 },
  { id: 2, title: 'Sky Hop',      color: '#7c3aed', angle: 144 },
  { id: 3, title: 'Neon Snake',   color: '#059669', angle: 216 },
  { id: 4, title: 'Astro Dodge',  color: '#d97706', angle: 288 },
]

const CW = 160
const CH = 284
const DURATION = 10000
const START_OFFSETS = [0, 900, 400, 1300, 600]

// ── Game 1: Car dodge ──
function gameCarDodge(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = CW, h = CH
  const LANES = [0.25, 0.50, 0.75]
  let carLane = 1, carX = w * 0.5, roadOff = 0, score = 0
  const obs: { lane: number; y: number }[] = []
  for (let i = 0; i < 3; i++) obs.push({ lane: Math.floor(Math.random() * 3), y: -80 - i * 110 })
  return function tick() {
    roadOff = (roadOff + 2.5) % 50
    carX += (w * LANES[carLane] - carX) * 0.1
    for (const o of obs) {
      o.y += 2.5
      if (o.lane === carLane && o.y > h * 0.72 - 70 && o.y < h * 0.72 + 10)
        o.lane = [0,1,2].filter(l=>l!==carLane)[Math.floor(Math.random()*2)]
      if (o.y > h + 20) { o.y = -80 - Math.random()*120; o.lane = [0,1,2].filter(l=>l!==carLane)[Math.floor(Math.random()*2)] }
    }
    score++
    if (Math.random() < 0.008) carLane = [0,1,2][Math.floor(Math.random()*3)]
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,w,h)
    const rL = w*0.06, rR = w*0.94
    ctx.fillStyle = '#1a1f2e'; ctx.fillRect(rL,0,rR-rL,h)
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(rL,0); ctx.lineTo(rL,h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rR,0); ctx.lineTo(rR,h); ctx.stroke()
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1; ctx.setLineDash([18,18]); ctx.lineDashOffset=-roadOff
    for (const p of [0.375,0.625]) { ctx.beginPath(); ctx.moveTo(w*p,0); ctx.lineTo(w*p,h); ctx.stroke() }
    ctx.setLineDash([])
    for (const o of obs) {
      const ox = w*LANES[o.lane]
      ctx.fillStyle='rgba(239,68,68,0.9)'; ctx.shadowColor='rgba(239,68,68,0.4)'; ctx.shadowBlur=8
      ctx.beginPath(); ctx.roundRect(ox-11,o.y-22,22,17,2); ctx.fill(); ctx.shadowBlur=0
    }
    const cy = h*0.72
    ctx.fillStyle='#e8f0ff'; ctx.shadowColor='rgba(37,99,235,0.5)'; ctx.shadowBlur=8
    ctx.beginPath(); ctx.roundRect(carX-10,cy-22,20,30,2); ctx.fill()
    ctx.fillStyle='rgba(37,99,235,0.8)'; ctx.beginPath(); ctx.roundRect(carX-6,cy-18,12,10,2); ctx.fill(); ctx.shadowBlur=0
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='9px Inter,sans-serif'; ctx.fillText('SCORE '+score,8,14)
  }
}

// ── Game 2: Breakout ──
function gameBreakout(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = CW, h = CH
  let bx = w/2, by = h*0.6, vx = 2.2, vy = -2.8, px = w/2
  const pw = 46
  const cols = ['#0891b2','#2563eb','#0e7490','#1d4ed8']
  const bricks: {x:number;y:number;alive:boolean;color:string}[] = []
  for (let r=0;r<5;r++) for (let c=0;c<5;c++)
    bricks.push({x:10+c*38,y:28+r*22,alive:true,color:cols[Math.floor(Math.random()*4)]})
  let score = 0
  return function tick() {
    bx+=vx; by+=vy
    if(bx<5||bx>w-5) vx=-vx
    if(by<5) vy=-vy
    if(by>h-14&&bx>px-pw/2&&bx<px+pw/2){vy=-Math.abs(vy);vx+=(bx-px)*0.05}
    if(by>h+20){by=h*0.6;vx=2.2;vy=-2.8}
    px+=(w/2-px)*0.012
    for(const br of bricks){
      if(!br.alive)continue
      if(bx>br.x&&bx<br.x+32&&by>br.y&&by<br.y+14){br.alive=false;vy=-vy;score++}
    }
    if(bricks.every(b=>!b.alive)) bricks.forEach(b=>b.alive=true)
    ctx.fillStyle='#0d1117'; ctx.fillRect(0,0,w,h)
    ctx.strokeStyle='rgba(8,145,178,0.06)'; ctx.lineWidth=0.5
    for(let x=0;x<w;x+=22){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=22){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    for(const br of bricks){
      if(!br.alive)continue
      ctx.fillStyle=br.color; ctx.globalAlpha=0.82
      ctx.beginPath(); ctx.roundRect(br.x,br.y,32,13,3); ctx.fill(); ctx.globalAlpha=1
    }
    ctx.fillStyle='rgba(100,220,255,0.9)'; ctx.shadowColor='rgba(8,145,178,0.9)'; ctx.shadowBlur=10
    ctx.beginPath(); ctx.arc(bx,by,5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.roundRect(px-pw/2,h-12,pw,7,3); ctx.fill()
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='9px Inter,sans-serif'; ctx.fillText('SCORE '+score,8,14)
  }
}

// ── Game 3: Sky Hop ──
function gameSkyHop(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = CW, h = CH
  let px=w/2, py=h*0.5, pvx=1.2, pvy=0
  const platforms = [
    {x:20,y:h*0.78,w:80},{x:100,y:h*0.60,w:70},{x:25,y:h*0.43,w:65},
    {x:110,y:h*0.27,w:75},{x:35,y:h*0.12,w:60}
  ]
  let score = 0
  return function tick() {
    pvy+=0.28; py+=pvy; px+=pvx
    if(px<8||px>w-8) pvx=-pvx
    for(const pl of platforms){
      if(px>pl.x&&px<pl.x+pl.w&&py+8>pl.y&&py+8<pl.y+12&&pvy>0){pvy=-6.5;score++}
    }
    if(py<h*0.38){const d=h*0.38-py;py+=d*0.06;for(const pl of platforms){pl.y+=d*0.06}}
    for(const pl of platforms){if(pl.y>h+20){pl.y=-20;pl.x=Math.random()*(w-80);pl.w=48+Math.random()*52}}
    if(py>h+40){py=h*0.5;pvy=0;platforms.forEach((pl,i)=>{pl.y=h*(0.78-i*0.165);pl.x=20+Math.random()*(w-100)})}
    ctx.fillStyle='#0a0f1e'; ctx.fillRect(0,0,w,h)
    const g=ctx.createLinearGradient(0,0,0,h)
    g.addColorStop(0,'rgba(124,58,237,0.12)'); g.addColorStop(1,'rgba(37,99,235,0.04)')
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h)
    for(const pl of platforms){
      ctx.fillStyle='rgba(124,58,237,0.85)'; ctx.shadowColor='rgba(124,58,237,0.45)'; ctx.shadowBlur=7
      ctx.beginPath(); ctx.roundRect(pl.x,pl.y,pl.w,9,3); ctx.fill(); ctx.shadowBlur=0
    }
    ctx.fillStyle='#fff'; ctx.shadowColor='rgba(200,180,255,0.7)'; ctx.shadowBlur=8
    ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='9px Inter,sans-serif'; ctx.fillText('JUMPS '+score,8,14)
  }
}

// ── Game 4: Neon Snake ──
function gameNeonSnake(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = CW, h = CH
  const gs = 16
  const cols = Math.floor(w/gs), rows = Math.floor(h/gs)
  let dir={x:1,y:0}, nd={x:1,y:0}
  let snake=[{x:5,y:10},{x:4,y:10},{x:3,y:10}]
  let food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)}
  let timer=0, score=0
  return function tick() {
    timer++
    if(timer%8===0){
      dir={...nd}
      const head={x:(snake[0].x+dir.x+cols)%cols,y:(snake[0].y+dir.y+rows)%rows}
      if(head.x===food.x&&head.y===food.y){food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)};score++}
      else snake.pop()
      if(snake.some(s=>s.x===head.x&&s.y===head.y)) snake=[{x:5,y:10},{x:4,y:10},{x:3,y:10}]
      snake.unshift(head)
      if(Math.random()<0.04){const r=Math.floor(Math.random()*4);nd=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}][r]}
    }
    ctx.fillStyle='#050a0a'; ctx.fillRect(0,0,w,h)
    ctx.strokeStyle='rgba(5,150,105,0.07)'; ctx.lineWidth=0.5
    for(let x=0;x<w;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    snake.forEach((s,i)=>{
      ctx.fillStyle=`rgba(5,200,120,${1-i/snake.length*0.6})`
      ctx.shadowColor='rgba(5,200,120,0.5)'; ctx.shadowBlur=i===0?10:0
      ctx.fillRect(s.x*gs+1,s.y*gs+1,gs-2,gs-2); ctx.shadowBlur=0
    })
    ctx.fillStyle='rgba(255,80,80,0.9)'; ctx.shadowColor='rgba(255,80,80,0.7)'; ctx.shadowBlur=8
    ctx.fillRect(food.x*gs+2,food.y*gs+2,gs-4,gs-4); ctx.shadowBlur=0
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='9px Inter,sans-serif'; ctx.fillText('SCORE '+score,8,14)
  }
}

// ── Game 5: Astro Dodge ──
function gameAstroDodge(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const w = CW, h = CH
  let sx = w/2, sy = h*0.75, sangle = 0
  const asteroids: {x:number;y:number;r:number;vx:number;vy:number}[] = []
  const bullets: {x:number;y:number}[] = []
  let bTimer = 0, score = 0
  for (let i=0;i<5;i++) asteroids.push({x:Math.random()*w,y:Math.random()*h*0.5,r:6+Math.random()*8,vx:(Math.random()-0.5)*1.2,vy:0.5+Math.random()*0.8})
  return function tick() {
    sangle += 0.025
    sx = w/2 + Math.cos(sangle)*w*0.25
    sy = h*0.75 + Math.sin(sangle*2)*20
    bTimer++
    if (bTimer%22===0) bullets.push({x:sx,y:sy})
    for (const b of bullets) b.y -= 4
    for (const a of asteroids) {
      a.x += a.vx; a.y += a.vy
      if (a.x<0||a.x>w) a.vx=-a.vx
      if (a.y>h+20) { a.y=-20; a.x=Math.random()*w }
      for (let i=bullets.length-1;i>=0;i--) {
        if (Math.hypot(bullets[i].x-a.x,bullets[i].y-a.y)<a.r+3) { bullets.splice(i,1); score++; a.y=-20; a.x=Math.random()*w; break }
      }
    }
    ctx.fillStyle='#030710'; ctx.fillRect(0,0,w,h)
    // stars
    ctx.fillStyle='rgba(255,255,255,0.5)'
    for (let i=0;i<30;i++) { const sx2=(i*73)%w,sy2=(i*47+score*0.5)%h; ctx.fillRect(sx2,sy2,1,1) }
    for (const a of asteroids) {
      ctx.strokeStyle='rgba(217,119,6,0.85)'; ctx.lineWidth=1.5; ctx.shadowColor='rgba(217,119,6,0.4)'; ctx.shadowBlur=6
      ctx.beginPath(); ctx.arc(a.x,a.y,a.r,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0
    }
    for (const b of bullets) {
      ctx.fillStyle='rgba(255,200,80,0.9)'; ctx.shadowColor='rgba(217,119,6,0.8)'; ctx.shadowBlur=6
      ctx.fillRect(b.x-1.5,b.y-5,3,8); ctx.shadowBlur=0
    }
    // ship triangle
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(Math.PI)
    ctx.fillStyle='rgba(255,220,100,0.9)'; ctx.shadowColor='rgba(217,119,6,0.6)'; ctx.shadowBlur=10
    ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(-7,8); ctx.lineTo(7,8); ctx.closePath(); ctx.fill(); ctx.shadowBlur=0
    ctx.restore()
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='9px Inter,sans-serif'; ctx.fillText('SCORE '+score,8,14)
  }
}

const GAME_FNS = [gameCarDodge, gameBreakout, gameSkyHop, gameNeonSnake, gameAstroDodge]

export function renderPlaytest(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <button class="back-fab" id="back-btn" title="Back">←</button>
      <nav class="shell-nav">
        <a href="#" class="logo">mantra<span class="dot">.</span></a>
        <div class="breadcrumb">
          <span class="bc-done">01 Playtest</span>
          <span class="bc-sep">›</span>
          <span class="bc-next">02 Pipeline</span>
        </div>
        <div class="session-badge" id="session-badge">
          <span class="live-dot"></span>
          <span>4 sessions running</span>
        </div>
      </nav>

      <div class="playtest-body">
        <div class="carousel-scene">
          <div class="carousel-track" id="carousel-track">
            ${SESSIONS.map(s => `
              <div class="phone-slot" id="slot-${s.id}">
                <div class="phone-device">
                  <div class="phone-edge"></div>
                  <div class="iphone-frame">
                    <div class="iphone-notch"></div>
                    <div class="iphone-screen">
                      <canvas id="canvas-${s.id}" width="${CW}" height="${CH}"></canvas>
                    </div>
                    <div class="iphone-home"></div>
                  </div>
                </div>
                <div class="phone-meta" id="meta-${s.id}">
                  <span class="phone-title" style="color:${s.color}">${s.title}</span>
                  <div class="phone-progress-wrap">
                    <div class="phone-progress-bar" id="prog-${s.id}" style="background:${s.color};width:0%"></div>
                  </div>
                  <span class="phone-pct" id="pct-${s.id}">0%</span>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn-generate btn-generate--corner" id="next-btn" style="opacity:0;pointer-events:none;transition:opacity 0.6s">
            <span class="btn-generate-title">Generate creatives</span>
            <span class="btn-generate-arrow">→</span>
          </button>
        </div>

        <aside class="logs-panel">
          <div class="logs-title">Agent activity</div>
          ${SESSIONS.map(s => `
            <div class="log-group">
              <div class="log-group-head">
                <span class="log-dot" style="background:${s.color}"></span>
                <span class="log-group-name">${s.title}</span>
                <span class="log-group-pct" id="logpct-${s.id}" style="color:${s.color}">0%</span>
              </div>
              <div class="log-lines" id="logs-${s.id}"></div>
            </div>
          `).join('')}
        </aside>
      </div>
    </div>
  `

  document.getElementById('back-btn')!.addEventListener('click', () => { location.hash = '' })
  document.getElementById('next-btn')?.addEventListener('click', () => { location.hash = '#pipeline' })

  const cta     = document.getElementById('next-btn') as HTMLElement
  const badge   = document.getElementById('session-badge') as HTMLElement
  const progBars = SESSIONS.map(s => document.getElementById('prog-' + s.id) as HTMLElement)
  const progPcts = SESSIONS.map(s => document.getElementById('pct-' + s.id) as HTMLElement)
  const logPcts  = SESSIONS.map(s => document.getElementById('logpct-' + s.id) as HTMLElement)
  const logBoxes = SESSIONS.map(s => document.getElementById('logs-' + s.id) as HTMLElement)

  const ticks = SESSIONS.map(s => {
    const canvas = document.getElementById('canvas-' + s.id) as HTMLCanvasElement
    return GAME_FNS[s.id](canvas)
  })

  // Per-game log lines that appear over time
  const LOG_POOL: Record<number, string[]> = {
    0: ['Detected lane-based controls', 'Dodged obstacle at 1.2s', 'Recovered center lane', 'Sustained combo x4', 'Fun loop: tight, responsive'],
    1: ['Paddle physics detected', 'Cleared brick row 1', 'Ball speed increasing', 'Combo bounce x3', 'Verdict: satisfying feedback'],
    2: ['Gravity + jump detected', 'Chained 3 platforms', 'Near-miss recovery', 'Vertical progression good', 'Loop: challenging but fair'],
    3: ['Grid movement detected', 'Ate food +1', 'Avoided self-collision', 'Length growing steadily', 'Verdict: classic, addictive'],
    4: ['Ship orbit detected', 'Destroyed asteroid', 'Auto-fire cadence good', 'Dodged debris cluster', 'Loop: high-tension, fun'],
  }
  const logIdx = [0, 0, 0, 0, 0]

  const startTime = performance.now()
  let ctaShown = false

  // Circular carousel seen from above: phones ride a horizontal ring.
  //   angle θ per phone = base offset + time
  //   x = sin θ · radius      → horizontal travel
  //   depth = cos θ (1 front … -1 back) → drives scale + opacity, no wrap/teleport
  const slots = SESSIONS.map(s => document.getElementById('slot-' + s.id)!)
  const N = SESSIONS.length
  const RADIUS = 390           // px — horizontal spread of the ring (1.5×)
  const SCENE_ROT_SPEED = 0.00035  // rad/ms — slow continuous loop

  function layoutCarousel(theta: number) {
    slots.forEach((slot, i) => {
      const a = theta + (i / N) * Math.PI * 2
      const x = Math.sin(a) * RADIUS
      const depth = Math.cos(a)                 // 1 = front, -1 = back
      const t = (depth + 1) / 2                  // 0 back … 1 front
      const scale = 0.9 + t * 0.6                // 0.9 back → 1.5 front (1.5×)
      slot.style.transform = `translateX(${x.toFixed(2)}px) scale(${scale.toFixed(3)})`
      slot.style.zIndex = String(Math.round(t * 100))
      slot.style.transition = 'none'             // JS drives every frame; no CSS lag
    })
  }

  function frame(now: number) {
    requestAnimationFrame(frame)

    const theta = (now - startTime) * SCENE_ROT_SPEED
    layoutCarousel(theta)

    // Games
    ticks.forEach(t => t())

    // Progress
    const elapsed = now - startTime
    let allDone = true
    SESSIONS.forEach((s, i) => {
      const p = Math.min(100, Math.max(0, ((elapsed - START_OFFSETS[i]) / DURATION) * 100))
      if (p < 100) allDone = false
      progBars[i].style.width = p + '%'
      const label = p >= 100 ? '✓' : Math.floor(p) + '%'
      progPcts[i].textContent = label
      logPcts[i].textContent  = label
      if (p >= 100) progPcts[i].style.color = s.color

      // Emit log lines as progress crosses thresholds
      const wantLines = Math.floor((p / 100) * LOG_POOL[i].length)
      while (logIdx[i] < wantLines) {
        const line = document.createElement('div')
        line.className = 'log-line'
        line.textContent = LOG_POOL[i][logIdx[i]]
        logBoxes[i].appendChild(line)
        logIdx[i]++
      }
    })

    if (allDone && !ctaShown) {
      ctaShown = true
      cta.style.opacity = '1'
      cta.style.pointerEvents = 'auto'
      badge.innerHTML = '<span style="color:var(--accent);font-weight:600;font-size:13px">✓ All sessions complete</span>'
    }
  }

  requestAnimationFrame(frame)
}
