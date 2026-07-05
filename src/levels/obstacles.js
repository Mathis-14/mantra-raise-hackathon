// MRUSH — obstacles et zones de boost.
// Système de niveau : construit les pièges/boosts, détecte les collisions avec les bleus,
// anime les props. Toute interaction externe passe par ctx.

import * as THREE from 'three';
import {
  LANE_HALF,
  OBSTACLE_MIN_LEVEL,
  OBSTACLE_HIT_RADIUS,
  OBSTACLE_SAW_RADIUS,
  OBSTACLE_SPIKE_RADIUS,
  BOOST_MIN_LEVEL,
  BOOST_ZONE_HALF_W,
  BOOST_ZONE_DEPTH,
  BOOST_SPEED_MULT,
  BOOST_DURATION,
  TRAUMA,
  COLORS,
} from '../core/constants.js';
import { layoutForLevel } from './layouts.js';

const BOOST_Y = 0.06;
const BOOST_H = 0.08;
const BOOST_ROT = -Math.PI / 2;
const BOOST_PULSE_AMP = 0.08;
const BOOST_PULSE_FREQ = 5.5;
const SAW_SPIN = 7.5;
const TRAP_PULSE_FREQ = 4.0;
const TARGET_PROP_SIZE = 1.8;
const TARGET_SAW_SIZE = 1.55;
const TARGET_SPIKE_SIZE = 1.75;
const BOOST_TEXT_Y = 1.7;
const HIT_TEXT_Y = 1.5;

export function createObstacles(ctx) {
  const { scene, state } = ctx;
  const ownedMeshes = [];
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  function makeAssetHolder(gltf, targetSize) {
    const holder = new THREE.Group();
    if (!gltf || !gltf.scene) return holder;
    const root = gltf.scene.clone(true);
    _box.setFromObject(root);
    _box.getSize(_size);
    _box.getCenter(_center);
    root.position.set(root.position.x - _center.x, root.position.y - _box.min.y, root.position.z - _center.z);
    const maxDim = Math.max(_size.x, _size.y, _size.z) || 1;
    root.scale.setScalar(targetSize / maxDim);
    holder.add(root);
    return holder;
  }

  function addBoost(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.green,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(BOOST_ZONE_HALF_W * 2, BOOST_ZONE_DEPTH * 2), mat);
    pad.rotation.x = BOOST_ROT;
    pad.position.y = BOOST_Y;
    pad.userData.owned = true;
    group.add(pad);
    ownedMeshes.push(pad);

    const belt = makeAssetHolder(ctx.assets.gltf.conveyor, TARGET_PROP_SIZE);
    belt.position.y = BOOST_H;
    belt.rotation.y = Math.PI;
    group.add(belt);

    scene.add(group);
    const zone = {
      id: 'boost-' + state.boosts.length,
      type: 'boost',
      x,
      z,
      halfW: BOOST_ZONE_HALF_W,
      halfD: BOOST_ZONE_DEPTH,
      group,
      pad,
    };
    state.boosts.push(zone);
  }

  function addObstacle(type, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    let radius = OBSTACLE_HIT_RADIUS;
    let holder;
    if (type === 'saw') {
      holder = makeAssetHolder(ctx.assets.gltf.saw, TARGET_SAW_SIZE);
      holder.rotation.x = Math.PI * 0.5;
      holder.position.y = 0.7;
      radius = OBSTACLE_SAW_RADIUS;
    } else {
      const src = type === 'spikesLarge' ? ctx.assets.gltf.trapSpikesLarge : ctx.assets.gltf.trapSpikes;
      holder = makeAssetHolder(src, TARGET_SPIKE_SIZE);
      holder.position.y = 0.04;
      radius = OBSTACLE_SPIKE_RADIUS;
    }
    group.add(holder);
    scene.add(group);
    state.obstacles.push({ type, x, z, radius, group, holder, hitCooldown: 0 });
  }

  // --- MURS BLOQUANTS (rangées de caisses, réf. ads Mob Control) ---
  // Ils ne tuent pas : les unités GLISSENT sur leur flanc. Le champion les fracasse.
  const walls = [];
  const CRATE_SIZE = 1.15;

  function addWall(w) {
    const group = new THREE.Group();
    const mound = w.kind === 'mound';
    const alongZ = w.axis === 'z'; // mur longitudinal (séparateur de couloirs)
    const halfLen = alongZ ? (w.halfD || 0.75) : w.halfW;
    const count = Math.max(1, Math.round((halfLen * 2) / CRATE_SIZE));
    const step = (halfLen * 2) / count;
    // PURETÉ THÉMATIQUE : les assets de mur viennent du SKIN courant (blocs de neige en neige,
    // briques améthyste au crépuscule, caisses/barils en canyon) ; mottes = pierres teintées skin.
    const skin = ctx.sys.skins ? ctx.sys.skins.current : null;
    const kinds = mound
      ? [ctx.assets.gltf.stones, ctx.assets.gltf.rocks, ctx.assets.gltf.stones]
      : (skin ? skin.wallKinds : ['crate']).map((k) => ctx.assets.gltf[k]);
    const tint = mound ? ((skin && skin.mound) || 0xB8996B) : (skin ? skin.wallTint : null);
    const tintMat = tint ? new THREE.MeshLambertMaterial({ color: tint }) : null; // matériau à nous, par mur
    for (let i = 0; i < count; i++) {
      const piece = makeAssetHolder(kinds[i % kinds.length] || ctx.assets.gltf.crate, CRATE_SIZE);
      const d = -halfLen + (i + 0.5) * step;
      if (alongZ) piece.position.set(w.x + (i % 2) * 0.06, 0, w.z + d);
      else piece.position.set(w.x + d, 0, w.z + (i % 2) * 0.06);
      piece.rotation.y = mound ? (i * 1.7) % 3.1 : (i % 3 - 1) * 0.08; // terre : rotations franches
      if (tintMat) piece.traverse((o) => { if (o.isMesh) o.material = tintMat; });
      group.add(piece);
    }
    scene.add(group);
    walls.push({ x: w.x, z: w.z, halfW: w.halfW, halfD: w.halfD || 0.75, group, broken: false });
  }

  /** Glissement le long d'un mur : pousse la coordonnée x de l'unité hors de l'emprise. */
  function deflect(u, margin) {
    for (const w of walls) {
      if (w.broken) continue;
      if (Math.abs(u.z - w.z) > w.halfD + margin) continue;
      const dx = u.x - w.x;
      if (Math.abs(dx) > w.halfW + margin) continue;
      let side = dx >= 0 ? 1 : -1;
      let nx = w.x + side * (w.halfW + margin + 0.02);
      if (Math.abs(nx) > LANE_HALF - 0.3) { // bord de piste : sortir par l'autre flanc
        side = -side;
        nx = w.x + side * (w.halfW + margin + 0.02);
      }
      u.x = Math.max(-(LANE_HALF - 0.3), Math.min(LANE_HALF - 0.3, nx));
    }
  }

  // PHYSIQUE DES DÉBRIS : au smash, les pièces du mur sont ÉJECTÉES (vélocité radiale depuis le
  // point d'impact + gravité + rotation) au lieu de disparaître — puis nettoyées à la fin de vie.
  const DEBRIS_GRAVITY = 14;
  const DEBRIS_LIFE = 1.3;
  const debris = []; // { group, pieces: [{ mesh, vx, vy, vz, ax, az, life }] }

  /** Le champion fracasse les murs qu'il touche (récompense de puissance). */
  function smashWallsAt(x, z, radius) {
    for (const w of walls) {
      if (w.broken) continue;
      if (Math.abs(z - w.z) > w.halfD + radius || Math.abs(x - w.x) > w.halfW + radius) continue;
      w.broken = true;
      const pieces = [];
      for (const mesh of w.group.children) {
        const dx = mesh.position.x - x;
        const dz = mesh.position.z - z;
        const len = Math.hypot(dx, dz) || 1;
        const kick = 3 + Math.random() * 3;
        pieces.push({
          mesh,
          vx: (dx / len) * kick,
          vy: 3.5 + Math.random() * 3,
          vz: (dz / len) * kick - 1.5, // légère poussée vers la base (sens de charge du champion)
          ax: (Math.random() * 2 - 1) * 7,
          az: (Math.random() * 2 - 1) * 7,
          life: DEBRIS_LIFE,
        });
      }
      debris.push({ group: w.group, pieces });
      ctx.particles.burst(w.x, 0.8, w.z, { color: COLORS.gold, shape: 'quad', count: 12, speed: 5 });
      ctx.particles.ring(w.x, w.z, COLORS.gold);
      ctx.floatingText.spawn('SMASH!', w.x, 1.6, w.z, { color: '#ffe66d', size: 1.1 });
      ctx.cameraRig.addTrauma(TRAUMA.crack);
      ctx.audio.play('rubble');
    }
  }

  /** Intègre la physique des débris (appelé chaque frame par update, dt scalé → gèle en hit-stop). */
  function debrisStep(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const batch = debris[i];
      let alive = 0;
      for (const p of batch.pieces) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        alive++;
        p.vy -= DEBRIS_GRAVITY * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.ax * dt;
        p.mesh.rotation.z += p.az * dt;
        if (p.mesh.position.y < -1.5) { p.life = 0; p.mesh.visible = false; alive--; }
      }
      if (alive <= 0) {
        scene.remove(batch.group);
        debris.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const o of state.obstacles) scene.remove(o.group);
    for (const b of state.boosts) scene.remove(b.group);
    for (const w of walls) scene.remove(w.group);
    for (const batch of debris) scene.remove(batch.group); // débris en vol d'un niveau précédent
    for (const mesh of ownedMeshes) {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    state.obstacles.length = 0;
    state.boosts.length = 0;
    walls.length = 0;
    debris.length = 0;
    ownedMeshes.length = 0;
  }

  function build(level) {
    clear();
    const layout = layoutForLevel(level);
    // murs bloquants du layout (slalom / labyrinthe / horde / couloirs — voir layouts.js)
    for (const w of layout.walls || []) addWall(w);
    if (level >= BOOST_MIN_LEVEL) addBoost(0, 12.5);
    if (level >= 5) addBoost(LANE_HALF * 0.42, -15.5);
    if (level < OBSTACLE_MIN_LEVEL) return;

    // dangers létaux PILOTÉS PAR LE LAYOUT (jamais de scie au milieu d'un passage : les
    // positions vivent dans layouts.js, sur les flancs, avec leur propre minLevel).
    for (const h of layout.hazards || []) {
      if (level >= (h.minLevel || OBSTACLE_MIN_LEVEL)) addObstacle(h.type, h.x, h.z);
    }
  }

  function hitStep() {
    if (!state.playing) return;
    // murs : déviation des deux foules (les flots contournent, réf. image « choose wisely »)
    if (walls.length) {
      for (const u of state.blues) deflect(u, 0.35);
      for (const r of state.reds) if (!r.boss) deflect(r, r.giant ? 0.6 : 0.35);
      // le champion fracasse ce qu'il touche
      for (const c of state.champions) smashWallsAt(c.x, c.z, 1.1);
    }
    const blues = state.blues;
    for (let i = blues.length - 1; i >= 0; i--) {
      const u = blues[i];
      let removed = false;
      for (const o of state.obstacles) {
        const dx = u.x - o.x;
        const dz = u.z - o.z;
        if (dx * dx + dz * dz <= o.radius * o.radius) {
          ctx.sys.crowd.killBlue(i);
          ctx.particles.pop(u.x, u.z);
          ctx.particles.burst(o.x, 0.55, o.z, { color: COLORS.gateBad, shape: 'spark', count: 5 });
          ctx.floatingText.spawn('KO', u.x, HIT_TEXT_Y, u.z, { color: '#ffd0d8' });
          ctx.audio.play('gateBad');
          removed = true;
          break;
        }
      }
      if (removed) continue;

      for (const b of state.boosts) {
        if (Math.abs(u.x - b.x) <= b.halfW && Math.abs(u.z - b.z) <= b.halfD && u.lastBoostId !== b.id) {
          u.lastBoostId = b.id;
          u.boostT = Math.max(u.boostT || 0, BOOST_DURATION);
          ctx.particles.ring(b.x, b.z, COLORS.green);
          ctx.floatingText.spawn('x' + BOOST_SPEED_MULT.toFixed(2), u.x, BOOST_TEXT_Y, u.z, { color: '#b9ffd7' });
          ctx.audio.synth?.ding();
        }
      }
    }
  }

  function update(dt, t) {
    debrisStep(dt); // physique des morceaux de murs fracassés
    for (const o of state.obstacles) {
      if (o.type === 'saw') {
        o.holder.rotation.z += SAW_SPIN * dt;
        o.holder.position.y = 0.7 + Math.sin(t * TRAP_PULSE_FREQ + o.x) * 0.06;
      } else {
        o.holder.position.y = 0.04 + Math.max(0, Math.sin(t * TRAP_PULSE_FREQ + o.z)) * 0.14;
      }
    }
    for (const b of state.boosts) {
      const s = 1 + Math.sin(t * BOOST_PULSE_FREQ + b.x) * BOOST_PULSE_AMP;
      b.group.scale.set(s, 1, s);
      b.pad.material.opacity = 0.27 + Math.max(0, Math.sin(t * BOOST_PULSE_FREQ + b.z)) * 0.18;
    }
  }

  function reset(level) {
    build(level);
  }

  return { build, clear, hitStep, update, reset };
}
