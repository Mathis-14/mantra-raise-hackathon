// MOB RUSH — champion bleu.
// Gère la jauge, le release et le clone géant qui nettoie une ligne jusqu'à la base.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { retintClone } from '../assets/recolor.js';
import {
  PLAYER_Z,
  BLUE_HIT_Z,
  UNIT_HEIGHT,
  UNIT_FACING_FIX,
  UNIT_RADIUS,
  GIANT_RADIUS,
  CHAMPION_MAX,
  CHAMPION_PASSIVE_RATE,
  CHAMPION_HP,
  CHAMPION_DAMAGE,
  CHAMPION_BASE_DAMAGE,
  CHAMPION_SPEED,
  CHAMPION_SCALE,
  CHAMPION_RADIUS,
  CHAMPION_KILL_CHARGE,
  CHAMPION_GIANT_CHARGE,
  CHAMPION_BOSS_CHARGE,
  BOSS_RADIUS,
  COLORS,
} from '../core/constants.js';
import { clamp01 } from '../juice/springs.js';
import { nextId } from '../core/ids.js';

const SPAWN_Z_OFFSET = 2.2;
const HIT_COOLDOWN = 0.1;
const FLASH_DUR = 0.1;
const BOB_FREQ = 5.2;
const BOB_AMP = 0.1;
const WOBBLE_FREQ = 2.4;
const WOBBLE_AMP = 0.18;
const FACING = UNIT_FACING_FIX;

export function createChampion(ctx) {
  const clones = new Map();
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _white = new THREE.Color(0xffffff);

  function clipByName(gltf, name) {
    const anims = gltf && gltf.animations ? gltf.animations : [];
    return anims.find((c) => c.name === name) || null;
  }

  function makeClone(champ) {
    const source = ctx.assets.gltf.maleD || ctx.assets.gltf.maleA;
    const root = skeletonClone(source.scene);
    retintClone(root, COLORS.blue);

    _box.setFromObject(root);
    _box.getSize(_size);
    const nativeH = _size.y || 1;
    const s = (UNIT_HEIGHT / nativeH) * CHAMPION_SCALE;
    root.scale.setScalar(s);
    const footY = -_box.min.y * s;
    root.position.set(champ.x, footY, champ.z);
    root.rotation.set(0, FACING, 0);

    const mats = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (m && m.emissive) mats.push(m);
    });

    const head = root.getObjectByName('head');
    if (head && ctx.assets.gltf.sunglasses) head.add(skeletonClone(ctx.assets.gltf.sunglasses.scene));

    const mixer = new THREE.AnimationMixer(root);
    let action = null;
    const sprint = clipByName(source, 'sprint');
    if (sprint) {
      action = mixer.clipAction(sprint);
      action.timeScale = 0.82;
      action.play();
    }

    ctx.scene.add(root);
    return { root, mixer, action, mats, footY };
  }

  function recycle(entry) {
    entry.mixer.stopAllAction();
    entry.mixer.uncacheRoot(entry.root);
    ctx.scene.remove(entry.root);
  }

  function addCharge(amount) {
    const state = ctx.state;
    state.championCharge = Math.min(CHAMPION_MAX, state.championCharge + Math.max(0, amount || 0));
  }

  function killRed(reds, index, red) {
    reds.splice(index, 1);
    addCharge(red.boss ? CHAMPION_BOSS_CHARGE : (red.giant ? CHAMPION_GIANT_CHARGE : CHAMPION_KILL_CHARGE));
    if (red.giant) {
      ctx.sys.giants.onGiantDeath(red);
      if (red.boss) {
        ctx.state.bossDefeated = true;
        ctx.state.gems += 1;
        ctx.floatingText.spawn('+1', red.x, 3.4, red.z, { color: '#b9ffd7' });
        ctx.sys.hud.refresh();
      }
    } else {
      ctx.particles.burst(red.x, 0.5, red.z, { color: COLORS.red, shape: 'star', count: 4 });
      ctx.audio.synth?.beep(560, 0.05, 'triangle', 0.06);
    }
  }

  function release() {
    const state = ctx.state;
    if (!state.playing || state.championCharge < CHAMPION_MAX || state.champions.length > 0) return false;
    const z = PLAYER_Z - SPAWN_Z_OFFSET;
    const x = state.cannonX;
    state.champions.push({
      id: nextId(),
      x,
      z,
      pz: z,
      hp: CHAMPION_HP,
      hitCd: 0,
      flashT: 0,
      wob: Math.random() * Math.PI * 2,
    });
    state.championCharge = 0;
    state.championReady = false;
    ctx.particles.ring(x, z, COLORS.blue);
    ctx.particles.burst(x, 1.2, z, { color: COLORS.blue, shape: 'spark', count: 10 });
    ctx.floatingText.spawn('CHAMPION', x, 2.7, z, { color: '#bdefff' });
    ctx.audio.synth?.ding();
    return true;
  }

  function updateLogic(dt, t) {
    const state = ctx.state;
    if (!state.playing) return;

    if (state.championCharge < CHAMPION_MAX) {
      state.championCharge = Math.min(CHAMPION_MAX, state.championCharge + CHAMPION_PASSIVE_RATE * dt);
    }

    const champions = state.champions;
    const reds = state.reds;
    for (let i = champions.length - 1; i >= 0; i--) {
      const champ = champions[i];
      champ.pz = champ.z;
      champ.z -= CHAMPION_SPEED * dt;
      champ.x += Math.sin(t * WOBBLE_FREQ + champ.wob) * WOBBLE_AMP * dt;
      champ.hitCd = Math.max(0, champ.hitCd - dt);
      champ.flashT = Math.max(0, champ.flashT - dt);

      if (champ.hitCd <= 0) {
        for (let j = reds.length - 1; j >= 0; j--) {
          const red = reds[j];
          const redRad = red.radius || (red.boss ? BOSS_RADIUS : (red.giant ? GIANT_RADIUS : UNIT_RADIUS));
          const rad = CHAMPION_RADIUS + redRad * 0.65;
          const dx = champ.x - red.x;
          const dz = champ.z - red.z;
          if (dx * dx + dz * dz > rad * rad) continue;

          const dmg = Math.min(CHAMPION_DAMAGE, red.hp);
          red.hp -= CHAMPION_DAMAGE;
          red.flashT = FLASH_DUR;
          champ.hp -= red.boss ? 2 : 1;
          champ.flashT = FLASH_DUR;
          champ.hitCd = HIT_COOLDOWN;
          ctx.particles.pop(red.x, red.z);
          ctx.audio.play('unitHit');
          if (red.giant) ctx.sys.giants.onGiantHit(red, dmg);

          if (red.hp <= 0) killRed(reds, j, red);
          break;
        }
      }

      if (champ.hp <= 0) {
        ctx.particles.burst(champ.x, 1.2, champ.z, { color: COLORS.blue, shape: 'spark', count: 8 });
        champions.splice(i, 1);
        continue;
      }

      if (champ.z <= BLUE_HIT_Z) {
        ctx.sys.base.damage(CHAMPION_BASE_DAMAGE, champ.x, champ.z, { y: 3.8, color: '#bdefff' });
        ctx.cameraRig.addTrauma(0.25);
        champions.splice(i, 1);
      }
    }

    state.championActive = champions.length > 0;
    state.championReady = state.championCharge >= CHAMPION_MAX && !state.championActive;
  }

  function updateVisuals(dt, t) {
    const live = new Set();
    for (const champ of ctx.state.champions) {
      live.add(champ.id);
      let entry = clones.get(champ.id);
      if (!entry) {
        entry = makeClone(champ);
        clones.set(champ.id, entry);
      }
      const y = entry.footY + Math.abs(Math.sin(t * BOB_FREQ + champ.wob)) * BOB_AMP;
      entry.root.position.set(champ.x, y, champ.z);
      entry.root.rotation.set(0, FACING, 0);
      const f = clamp01(champ.flashT / FLASH_DUR);
      for (const m of entry.mats) m.emissive.copy(_white).multiplyScalar(f);
      entry.mixer.update(dt);
    }

    for (const [id, entry] of clones) {
      if (live.has(id)) continue;
      recycle(entry);
      clones.delete(id);
    }
  }

  function update(dt, t) {
    updateLogic(dt, t);
    updateVisuals(dt, t);
  }

  function reset() {
    ctx.state.champions.length = 0;
    ctx.state.championCharge = 0;
    ctx.state.championReady = false;
    ctx.state.championActive = false;
    for (const entry of clones.values()) recycle(entry);
    clones.clear();
  }

  return { addCharge, release, update, reset };
}
