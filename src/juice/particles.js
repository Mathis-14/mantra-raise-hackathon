// MRUSH — juice/particles.js
// Système de particules instanciées (pools, zéro allocation par émission).
// Module-LIBRAIRIE : ne connaît ni GameState ni ctx. Dépendances : three, core/constants.js.
// Budget : 3 InstancedMesh au total — pops (sphères), génériques (billboards atlas), anneaux (sol).
// CONTRACT §5.8 / §3 (forme Pop). Parité pops = prototype (game/mob-control-clone.html).

import * as THREE from 'three';
import { POP_LIFE, POP_POOL, POP_Y } from '../core/constants.js';

// ----------------------------------------------------------------------------
// Constantes de look-and-feel locales (juice pur, non couvertes par constants.js)
// ----------------------------------------------------------------------------
const RING_POOL      = 16;
const RING_Y         = 0.06;   // anneau posé sur la piste
const RING_START_R   = 0.5;
const RING_MAX_R     = 2.8;
const RING_LIFE      = 0.5;    // s
const RING_ALPHA     = 0.8;
const MUZZLE_LIFE    = 0.05;   // ~2 frames
const MUZZLE_SIZE    = 0.55;
const MUZZLE_GROW    = 6;      // u/s — le flash s'élargit vite
const POP_BASE_ALPHA = 0.85;   // opacité proto du matériau pop

// Atlas de sprites : 3 tuiles côte à côte (cercle flou, étoile 4 branches, spark).
const ATLAS_TILE = 128;
const ATLAS_N    = 3;
const _T   = 1 / ATLAS_N;
const _PAD = 0.006;            // inset UV anti-bleed
const SHAPE_UV = {
  // 'quad' → cercle flou (tuile 0) ; 'star' → étoile (1) ; 'spark' → spark (2)
  quad:  { u0: 0 * _T + _PAD, v0: _PAD, uw: _T - 2 * _PAD, vh: 1 - 2 * _PAD },
  star:  { u0: 1 * _T + _PAD, v0: _PAD, uw: _T - 2 * _PAD, vh: 1 - 2 * _PAD },
  spark: { u0: 2 * _T + _PAD, v0: _PAD, uw: _T - 2 * _PAD, vh: 1 - 2 * _PAD },
};

// ----------------------------------------------------------------------------
// Shaders (GLSL1 — attribute/varying/texture2D ; compatibles WebGL2).
// three déclare position/uv/instanceMatrix/modelViewMatrix/projectionMatrix dans
// le préfixe des ShaderMaterial : ne PAS les redéclarer ici.
// ----------------------------------------------------------------------------
const GENERIC_VERT = `
attribute float aScale;
attribute float aRot;
attribute vec3 aColor;
attribute float aAlpha;
attribute vec4 aUv;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec2 quadUv = position.xy + 0.5;          // PlaneGeometry(-0.5..0.5) -> 0..1
  vUv = aUv.xy + quadUv * aUv.zw;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float cr = cos(aRot);
  float sr = sin(aRot);
  vec2 p = position.xy * aScale;            // billboard : offset dans le plan écran
  mv.x += p.x * cr - p.y * sr;
  mv.y += p.x * sr + p.y * cr;
  gl_Position = projectionMatrix * mv;
}`;

const GENERIC_FRAG = `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
}`;

const RING_VERT = `
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(vColor, vAlpha);
}`;

// ----------------------------------------------------------------------------
// Helpers purs
// ----------------------------------------------------------------------------
// Composantes sRGB (0..1) directes du hex : on écrit du sRGB display dans un
// ShaderMaterial custom (pas de passe colorspace injectée) → la palette reste fidèle.
function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function drawSoftCircle(g, ox) {
  const cx = ox + ATLAS_TILE / 2;
  const cy = ATLAS_TILE / 2;
  const r = (ATLAS_TILE / 2) * 0.92;
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(ox, 0, ATLAS_TILE, ATLAS_TILE);
}

function drawStar(g, ox) {
  const cx = ox + ATLAS_TILE / 2;
  const cy = ATLAS_TILE / 2;
  const outer = ATLAS_TILE * 0.46;
  const inner = ATLAS_TILE * 0.12;
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  for (let p = 0; p < 8; p++) {
    const ang = p * Math.PI / 4 - Math.PI / 2;
    const rad = (p % 2 === 0) ? outer : inner;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (p === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fill();
  const core = g.createRadialGradient(0, 0, 0, 0, 0, inner * 2);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, inner * 2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawSpark(g, ox) {
  const cx = ox + ATLAS_TILE / 2;
  const cy = ATLAS_TILE / 2;
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, ATLAS_TILE * 0.18);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(cx, cy, ATLAS_TILE * 0.18, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(cx, cy);
  const len = ATLAS_TILE * 0.46;
  const w = ATLAS_TILE * 0.05;
  for (let a = 0; a < 2; a++) {
    g.rotate(a * Math.PI / 2);
    const grd = g.createLinearGradient(-len, 0, len, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-len, -w / 2, len * 2, w);
  }
  g.restore();
}

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_TILE * ATLAS_N;
  c.height = ATLAS_TILE;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  drawSoftCircle(g, 0 * ATLAS_TILE);
  drawStar(g, 1 * ATLAS_TILE);
  drawSpark(g, 2 * ATLAS_TILE);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
/** ParticleSystem InstancedMesh (pools, frustumCulled=false partout). */
export function createParticles(scene, { poolSize = 256 } = {}) {
  const _dummy = new THREE.Object3D();
  const _m4 = new THREE.Matrix4();

  // --- Pops : sphères blanches (parité prototype) + décroissance d'opacité ---
  const pops = [];
  const popGeo = new THREE.SphereGeometry(0.3, 8, 8);
  const popAlpha = new THREE.InstancedBufferAttribute(new Float32Array(POP_POOL), 1);
  popAlpha.setUsage(THREE.DynamicDrawUsage);
  popGeo.setAttribute('aAlpha', popAlpha);
  const popMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: POP_BASE_ALPHA });
  // Injecte une opacité par instance (aAlpha) tout en gardant MeshBasicMaterial.
  popMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vAlpha;');
  };
  const popMesh = new THREE.InstancedMesh(popGeo, popMat, POP_POOL);
  popMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  popMesh.frustumCulled = false;
  popMesh.count = 0;
  scene.add(popMesh);

  // --- Générique : billboards texturés (bursts + muzzle) ---
  const atlas = makeAtlas();
  const genGeo = new THREE.PlaneGeometry(1, 1);
  const genScale = new THREE.InstancedBufferAttribute(new Float32Array(poolSize), 1);
  const genRot = new THREE.InstancedBufferAttribute(new Float32Array(poolSize), 1);
  const genColor = new THREE.InstancedBufferAttribute(new Float32Array(poolSize * 3), 3);
  const genAlpha = new THREE.InstancedBufferAttribute(new Float32Array(poolSize), 1);
  const genUv = new THREE.InstancedBufferAttribute(new Float32Array(poolSize * 4), 4);
  for (const a of [genScale, genRot, genColor, genAlpha, genUv]) a.setUsage(THREE.DynamicDrawUsage);
  genGeo.setAttribute('aScale', genScale);
  genGeo.setAttribute('aRot', genRot);
  genGeo.setAttribute('aColor', genColor);
  genGeo.setAttribute('aAlpha', genAlpha);
  genGeo.setAttribute('aUv', genUv);
  const genMat = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas } },
    vertexShader: GENERIC_VERT,
    fragmentShader: GENERIC_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending, // muzzle additif (spec 5.1) ; blending = par matériau, donc partagé
  });
  const genMesh = new THREE.InstancedMesh(genGeo, genMat, poolSize);
  genMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  genMesh.frustumCulled = false;
  genMesh.count = 0;
  scene.add(genMesh);

  // --- Anneaux : au sol, extension + fondu (portes, spec 5.3) ---
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 48);
  const ringColor = new THREE.InstancedBufferAttribute(new Float32Array(RING_POOL * 3), 3);
  const ringAlpha = new THREE.InstancedBufferAttribute(new Float32Array(RING_POOL), 1);
  ringColor.setUsage(THREE.DynamicDrawUsage);
  ringAlpha.setUsage(THREE.DynamicDrawUsage);
  ringGeo.setAttribute('aColor', ringColor);
  ringGeo.setAttribute('aAlpha', ringAlpha);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending, // anneau coloré lisible sur la piste claire
  });
  const ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, RING_POOL);
  ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ringMesh.frustumCulled = false;
  ringMesh.count = 0;
  scene.add(ringMesh);

  // --- Pools objets (réutilisés, curseur circulaire = écrase le plus ancien) ---
  const parts = new Array(poolSize);
  for (let i = 0; i < poolSize; i++) {
    parts[i] = {
      alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grav: 0,
      life: 0, maxLife: 1, size: 0, sizeVel: 0, rot: 0, rotVel: 0,
      cr: 1, cg: 1, cb: 1, u0: 0, v0: 0, uw: 1, vh: 1,
    };
  }
  let cursor = 0;

  const rings = new Array(RING_POOL);
  for (let i = 0; i < RING_POOL; i++) {
    rings[i] = { alive: false, x: 0, z: 0, life: 0, maxLife: 1, cr: 1, cg: 1, cb: 1 };
  }
  let ringCursor = 0;

  function spawnParticle(x, y, z, vx, vy, vz, grav, life, size, sizeVel, rot, rotVel, cr, cg, cb, rect) {
    const p = parts[cursor];
    cursor = (cursor + 1) % poolSize;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.grav = grav;
    p.life = life; p.maxLife = life;
    p.size = size; p.sizeVel = sizeVel;
    p.rot = rot; p.rotVel = rotVel;
    p.cr = cr; p.cg = cg; p.cb = cb;
    p.u0 = rect.u0; p.v0 = rect.v0; p.uw = rect.uw; p.vh = rect.vh;
  }

  // --- API ---
  function pop(x, z) {
    pops.push({ x, z, t: 0 });
    if (pops.length > POP_POOL) pops.shift();
  }

  function burst(x, y, z, opts) {
    const o = opts || {};
    const count = o.count == null ? 6 : o.count;
    const color = o.color == null ? 0xffffff : o.color;
    const speed = o.speed == null ? 3 : o.speed;
    const life = o.life == null ? 0.5 : o.life;
    const gravity = o.gravity == null ? 6 : o.gravity;
    const size = o.size == null ? 0.18 : o.size;
    const rect = SHAPE_UV[o.shape] || SHAPE_UV.spark;
    const [cr, cg, cb] = hexToRgb(color);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const el = 0.25 + Math.random() * 0.7;            // élévation (rad)
      const sp = speed * (0.55 + Math.random() * 0.7);
      const ch = Math.cos(el) * sp;                     // vitesse horizontale
      const vx = Math.cos(a) * ch;
      const vz = Math.sin(a) * ch;
      const vy = Math.sin(el) * sp + speed * 0.35;
      const sz = size * (0.7 + Math.random() * 0.7);
      spawnParticle(
        x, y, z, vx, vy, vz, gravity,
        life * (0.7 + Math.random() * 0.5), sz, 0,
        Math.random() * Math.PI * 2, (Math.random() - 0.5) * 6,
        cr, cg, cb, rect,
      );
    }
  }

  function muzzle(x, y, z) {
    spawnParticle(x, y, z, 0, 0, 0, 0, MUZZLE_LIFE, MUZZLE_SIZE, MUZZLE_GROW, 0, 0, 1, 1, 1, SHAPE_UV.quad);
  }

  function ring(x, z, color) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % RING_POOL;
    const [cr, cg, cb] = hexToRgb(color == null ? 0xffffff : color);
    r.alive = true;
    r.x = x; r.z = z;
    r.life = RING_LIFE; r.maxLife = RING_LIFE;
    r.cr = cr; r.cg = cg; r.cb = cb;
  }

  function update(dt) {
    // Pops (parité prototype : t += dt, retrait à POP_LIFE, scale 0.5 + 4t, y = POP_Y)
    let n = 0;
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      if (p.t > POP_LIFE) { pops.splice(i, 1); continue; }
      const s = 0.5 + p.t * 4;
      _dummy.position.set(p.x, POP_Y, p.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      popMesh.setMatrixAt(n, _dummy.matrix);
      popAlpha.array[n] = 1 - p.t / POP_LIFE;
      n++;
    }
    popMesh.count = n;
    popMesh.instanceMatrix.needsUpdate = true;
    popAlpha.needsUpdate = true;

    // Génériques (billboards)
    let j = 0;
    for (let i = 0; i < poolSize; i++) {
      const p = parts[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.sizeVel * dt;
      p.rot += p.rotVel * dt;
      _m4.makeTranslation(p.x, p.y, p.z);
      genMesh.setMatrixAt(j, _m4);
      genScale.array[j] = p.size;
      genRot.array[j] = p.rot;
      genAlpha.array[j] = p.life / p.maxLife;
      const c3 = j * 3;
      genColor.array[c3] = p.cr;
      genColor.array[c3 + 1] = p.cg;
      genColor.array[c3 + 2] = p.cb;
      const c4 = j * 4;
      genUv.array[c4] = p.u0;
      genUv.array[c4 + 1] = p.v0;
      genUv.array[c4 + 2] = p.uw;
      genUv.array[c4 + 3] = p.vh;
      j++;
    }
    genMesh.count = j;
    genMesh.instanceMatrix.needsUpdate = true;
    genScale.needsUpdate = true;
    genRot.needsUpdate = true;
    genColor.needsUpdate = true;
    genAlpha.needsUpdate = true;
    genUv.needsUpdate = true;

    // Anneaux
    let m = 0;
    for (let i = 0; i < RING_POOL; i++) {
      const r = rings[i];
      if (!r.alive) continue;
      r.life -= dt;
      if (r.life <= 0) { r.alive = false; continue; }
      const u = 1 - r.life / r.maxLife;
      const radius = RING_START_R + (RING_MAX_R - RING_START_R) * u;
      _dummy.position.set(r.x, RING_Y, r.z);
      _dummy.rotation.set(-Math.PI / 2, 0, 0);
      _dummy.scale.set(radius, radius, radius);
      _dummy.updateMatrix();
      ringMesh.setMatrixAt(m, _dummy.matrix);
      ringAlpha.array[m] = RING_ALPHA * (r.life / r.maxLife);
      const c3 = m * 3;
      ringColor.array[c3] = r.cr;
      ringColor.array[c3 + 1] = r.cg;
      ringColor.array[c3 + 2] = r.cb;
      m++;
    }
    ringMesh.count = m;
    ringMesh.instanceMatrix.needsUpdate = true;
    ringAlpha.needsUpdate = true;
    ringColor.needsUpdate = true;
  }

  function reset() {
    pops.length = 0; // jamais réassigner
    for (let i = 0; i < poolSize; i++) parts[i].alive = false;
    for (let i = 0; i < RING_POOL; i++) rings[i].alive = false;
    cursor = 0;
    ringCursor = 0;
    popMesh.count = 0;
    genMesh.count = 0;
    ringMesh.count = 0;
  }

  return { pops, pop, burst, ring, muzzle, update, reset };
}
