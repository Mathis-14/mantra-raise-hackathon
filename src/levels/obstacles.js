// MOB RUSH — obstacles et zones de boost.
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
  COLORS,
} from '../core/constants.js';

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

  function clear() {
    for (const o of state.obstacles) scene.remove(o.group);
    for (const b of state.boosts) scene.remove(b.group);
    for (const mesh of ownedMeshes) {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    state.obstacles.length = 0;
    state.boosts.length = 0;
    ownedMeshes.length = 0;
  }

  function build(level) {
    clear();
    if (level >= BOOST_MIN_LEVEL) addBoost(0, 12.5);
    if (level < OBSTACLE_MIN_LEVEL) return;

    addObstacle('saw', 0, 1.4);
    if (level >= 3) {
      addObstacle('spikes', -LANE_HALF * 0.48, -9.5);
      addObstacle('spikes', LANE_HALF * 0.48, -13.6);
    }
    if (level >= 4) {
      addObstacle('saw', -LANE_HALF * 0.5, 4.0);
      addObstacle('saw', LANE_HALF * 0.5, -2.1);
    }
    if (level >= 5) addBoost(LANE_HALF * 0.42, -15.5);
    if (level >= 6) addObstacle('spikesLarge', 0, -18.2);
  }

  function hitStep() {
    if (!state.playing) return;
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
