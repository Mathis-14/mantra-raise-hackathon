// MOB RUSH — enemy/giants.js : visuels des géants rouges + juice combat 5.4.
// Système (CONTRACT §6.6). Clones animés (skeletonClone) pilotés par les RedUnit géants de state.reds,
// pool indexé par red.id. N'importe aucun autre système ; appelé par waves via ctx.sys.giants.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { retintClone } from '../assets/recolor.js';
import { clamp01 } from '../juice/springs.js';
import {
  GIANT_SCALE, UNIT_HEIGHT, UNIT_FACING_FIX,
  HITSTOP_GIANT, TRAUMA, COLORS,
} from '../core/constants.js';

// Durées non gameplay (juice), fixées par CONTRACT §3/§6.5-6 — sans constante dédiée.
const FLASH_DUR = 0.1;   // s : flash blanc du géant touché (= r.flashT initial posé par waves.collideStep)
const DIE_DUR   = 0.333; // s : durée du clip 'die' avant recyclage du clone

/**
 * Géants rouges (visuel + juice).
 * @param {object} ctx contexte partagé (CONTRACT §4)
 * @returns {{ update(dt:number,t:number):void, onGiantHit(red:object,dmg:number):void,
 *   onGiantDeath(red:object):void, reset():void }}
 */
export function createGiants(ctx) {
  /** @type {Map<number, {root:THREE.Object3D, mixer:THREE.AnimationMixer, action:THREE.AnimationAction|null,
   *   mats:THREE.Material[], footY:number, dying:boolean, dieTimer:number}>} */
  const clones = new Map();

  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _white = new THREE.Color(0xffffff);
  const FACING = UNIT_FACING_FIX + Math.PI; // face +Z (sens de progression du géant)

  function clipByName(gltf, name) {
    const anims = gltf && gltf.animations ? gltf.animations : [];
    return anims.find((c) => c.name === name) || null;
  }

  function forceFlatColor(root, hex) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (m && m.color && !m.map) m.color.setHex(hex);
      }
    });
  }

  function makeClone(red) {
    const sourceGltf = red.boss && ctx.assets.gltf.bossChar ? ctx.assets.gltf.bossChar : ctx.assets.gltf.maleA;
    const tint = red.boss ? COLORS.gold : COLORS.red;
    const root = skeletonClone(sourceGltf.scene);
    retintClone(root, tint);
    forceFlatColor(root, tint);

    // Normalisation hauteur → UNIT_HEIGHT puis échelle géante ; pieds au sol.
    _box.setFromObject(root);
    _box.getSize(_size);
    const nativeH = _size.y || 1;
    const s = (UNIT_HEIGHT / nativeH) * (red.scale || GIANT_SCALE);
    root.scale.setScalar(s);
    const footY = -_box.min.y * s;
    root.position.set(red.x, footY, red.z);
    root.rotation.set(0, FACING, 0);

    // Matériaux du CLONE uniquement (pour le flash émissif) — collectés avant l'accessoire.
    const mats = [];
    root.traverse((o) => {
      if (o.isMesh && o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (m && m.emissive) mats.push(m);
      }
    });

    // Lunettes attachées au bone 'head'.
    const head = root.getObjectByName('head');
    if (head && ctx.assets.gltf.sunglasses && !red.boss) {
      head.add(skeletonClone(ctx.assets.gltf.sunglasses.scene));
    }

    const mixer = new THREE.AnimationMixer(root);
    let action = null;
    const sprint = clipByName(sourceGltf, 'sprint');
    if (sprint) {
      action = mixer.clipAction(sprint);
      action.timeScale = 0.7;
      action.play();
    }

    ctx.scene.add(root);
    return { root, mixer, action, mats, footY, dying: false, dieTimer: 0 };
  }

  function recycle(entry) {
    entry.mixer.stopAllAction();
    entry.mixer.uncacheRoot(entry.root);
    ctx.scene.remove(entry.root);
  }

  function update(dt) {
    const reds = ctx.state.reds;
    const live = new Set();

    for (let i = 0; i < reds.length; i++) {
      const r = reds[i];
      if (!r.giant) continue;
      live.add(r.id);
      let entry = clones.get(r.id);
      if (!entry) {
        entry = makeClone(r);
        clones.set(r.id, entry);
      }
      entry.root.position.set(r.x, entry.footY, r.z);
      entry.root.rotation.set(0, FACING, 0);
      // Flash blanc émissif ∝ r.flashT (sur le matériau du clone uniquement).
      const f = clamp01(r.flashT / FLASH_DUR);
      for (const m of entry.mats) m.emissive.copy(_white).multiplyScalar(f);
      r.flashT = Math.max(0, r.flashT - dt);
      entry.mixer.update(dt); // dt SCALÉ → gel en hit-stop
    }

    // Clones dont le géant a disparu : jouer 'die' jusqu'au bout, puis recycler.
    for (const [id, entry] of clones) {
      if (live.has(id)) continue;
      if (entry.dying) {
        entry.dieTimer += dt;
        entry.mixer.update(dt);
        if (entry.dieTimer >= DIE_DUR) {
          recycle(entry);
          clones.delete(id);
        }
      } else {
        recycle(entry);
        clones.delete(id);
      }
    }
  }

  function onGiantHit(red, dmg) {
    ctx.floatingText.spawn('-' + dmg, red.x, 2.4, red.z, { color: '#ffffff' });
  }

  function onGiantDeath(red) {
    const entry = clones.get(red.id);
    if (entry) {
      entry.dying = true;
      entry.dieTimer = 0;
      if (entry.action) entry.action.stop();
      const sourceGltf = red.boss && ctx.assets.gltf.bossChar ? ctx.assets.gltf.bossChar : ctx.assets.gltf.maleA;
      const dieClip = clipByName(sourceGltf, 'die');
      if (dieClip) {
        const die = entry.mixer.clipAction(dieClip);
        die.reset();
        die.setLoop(THREE.LoopOnce, 1);
        die.clampWhenFinished = true;
        die.timeScale = 1;
        die.play();
      }
    }
    ctx.time.pulse(HITSTOP_GIANT.scale, HITSTOP_GIANT.dur); // SEUL hit-stop du jeu
    ctx.cameraRig.addTrauma(TRAUMA.giantDeath);
    ctx.particles.burst(red.x, 1.2, red.z, { color: red.boss ? COLORS.gold : COLORS.red, shape: 'star', count: red.boss ? 8 : 4 });
  }

  function reset() {
    for (const entry of clones.values()) recycle(entry);
    clones.clear();
  }

  return { update, onGiantHit, onGiantDeath, reset };
}
