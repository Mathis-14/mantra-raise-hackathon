// MRUSH — src/crowd/cannon.js — canon, visée, tir (CONTRACT §6.1, spec 5.1, PLAN §5).
// Module-SYSTÈME : factory createCannon(ctx). N'importe aucun autre système.
// Interactions inter-systèmes (crowd/particles/audio) UNIQUEMENT dans les méthodes.

import * as THREE from 'three';
import {
  PLAYER_Z,
  FIRE_DELAY,
  AIM_CLAMP,
  CANNON_LERP_K,
  CANNON_TILT,
  FIRE_JITTER_X,
  FIRE_SPAWN_DZ,
  BARREL_PUNCH,
  BARREL_RETURN_K,
  BARREL_RECOIL,
  LOADOUTS,
  LOADOUT_DEFAULT,
  COLORS,
} from '../core/constants.js';
import { protoLerp, spring, clamp } from '../juice/springs.js';
import { retintClone } from '../assets/recolor.js';

// --- Layout visuel (parité prototype / spec §6.1) — dimensions littérales tirées du proto. ---
const BASE_W = 2.2;              // socle : BoxGeometry 2.2×1×2 (spec §6.1)
const BASE_H = 1;
const BASE_D = 2;
const BASE_Y = 0.5;              // proto cBase.position.y
const BARREL_TARGET_LEN = 2.4;   // longueur cible du fût (proto CylinderGeometry h=2.4)
const BARREL_Y = 1.05;           // proto barrel.position.y
const BARREL_PIVOT_Z = 0.2;      // pivot reculé vers l'arrière du socle (recul + punch depuis la base)
const CANNON_SCALE = 1.15;       // léger grossissement du blaster (visible sans dominer) — purement visuel

// Orientation du modèle blaster : point de calibration T4 (cf. A7/UNIT_FACING_FIX).
// Seul réglage visuel : oriente la bouche vers -Z, léger piqué vers le bas.
const BARREL_YAW = 0;
const BARREL_PITCH = -0.12;

// --- Juice (spec 5.1 / 5.8) — tuning local (non gameplay). ---
const BREATH_AMP = 0.02;         // respiration ±2 % (spec 5.8)
const BREATH_W = Math.PI;        // pulsation période 2 s → ω = 2π/2 = π
const MICRO_AMP = 0.05;          // amplitude du micro-tremblement du canon au tir
const MICRO_DECAY = 9;           // décroissance du micro-tremblement (/s)
const BARREL_SPRING_STIFF = 120; // recul du fût — raideur du ressort
const BARREL_SPRING_DAMP = 18;   // recul du fût — amortissement
const SIDE_BARREL_X = 0.52;      // écart visuel des canons latéraux (présentation loadout)

export function createCannon(ctx) {
  const { scene } = ctx;

  // --- Construction du groupe (assets seulement — aucune interaction système) ---
  const group = new THREE.Group();
  group.position.set(0, 0, PLAYER_Z);

  // `rig` : sous-groupe mis à l'échelle CANNON_SCALE (agrandit tout le blaster). L'extérieur `group`
  // garde position/respiration/reset ; le rig ne fait que grossir le visuel (positions incluses).
  const rig = new THREE.Group();
  rig.scale.setScalar(CANNON_SCALE);
  group.add(rig);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BASE_W, BASE_H, BASE_D),
    new THREE.MeshLambertMaterial({ color: COLORS.blueDark }),
  );
  base.position.set(0, BASE_Y, 0);
  rig.add(base);

  // Pivot du fût : porte le recul (translation z) et le punch (scale).
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, BARREL_Y, BARREL_PIVOT_Z);
  rig.add(barrelPivot);

  // Fût : clone du blaster recoloré bleu (repli cylindre si l'asset manque).
  let barrelModel;
  const blasterGltf = ctx.assets && ctx.assets.gltf && ctx.assets.gltf.blaster;
  if (blasterGltf && blasterGltf.scene) {
    barrelModel = blasterGltf.scene.clone(true);
    retintClone(barrelModel, COLORS.blue);
    // Normalisation AVANT orientation : plus grande dim native = longueur du fût.
    barrelModel.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(barrelModel);
    const s0 = b0.getSize(new THREE.Vector3());
    const maxDim = Math.max(s0.x, s0.y, s0.z) || 1;
    barrelModel.scale.multiplyScalar(BARREL_TARGET_LEN / maxDim);
    barrelModel.rotation.set(BARREL_PITCH, BARREL_YAW, 0);
  } else {
    // Repli parité proto : CylinderGeometry(0.45, 0.6, 2.4, 16), bouche vers -Z.
    barrelModel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.6, BARREL_TARGET_LEN, 16),
      new THREE.MeshLambertMaterial({ color: COLORS.blue }),
    );
    barrelModel.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
  }

  // Recentrage commun : arrière (max z) du fût posé sur l'origine du pivot,
  // fût centré en x/y ; la bouche se retrouve à z = -(longueur) dans le pivot.
  barrelModel.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(barrelModel);
  const center = bb.getCenter(new THREE.Vector3());
  barrelModel.position.x -= center.x;
  barrelModel.position.y -= center.y;
  barrelModel.position.z -= bb.max.z;
  const muzzleLocalZ = bb.min.z - bb.max.z; // z de la bouche dans le repère du pivot
  barrelPivot.add(barrelModel);

  // Point de bouche (suit recul/punch/tilt car enfant du pivot).
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0, muzzleLocalZ);
  barrelPivot.add(muzzlePoint);

  const leftBarrel = barrelModel.clone(true);
  leftBarrel.position.copy(barrelModel.position);
  leftBarrel.position.x -= SIDE_BARREL_X;
  leftBarrel.visible = false;
  barrelPivot.add(leftBarrel);

  const rightBarrel = barrelModel.clone(true);
  rightBarrel.position.copy(barrelModel.position);
  rightBarrel.position.x += SIDE_BARREL_X;
  rightBarrel.visible = false;
  barrelPivot.add(rightBarrel);

  scene.add(group);

  // --- État interne (jamais dans state) ---
  let barrelScale = 1;            // punch du fût (1 → BARREL_PUNCH → 1)
  const recoil = { x: 0, v: 0 };  // ressort de recul (spec 5.1)
  let microTrauma = 0;            // 0..1, micro-tremblement du canon au tir
  const tmpVec = new THREE.Vector3();

  function applyBarrel() {
    barrelPivot.scale.setScalar(barrelScale);
    barrelPivot.position.set(0, BARREL_Y, BARREL_PIVOT_Z + recoil.x);
  }

  function currentLoadout() {
    return LOADOUTS[ctx.state.loadout] || LOADOUTS[LOADOUT_DEFAULT];
  }

  function applyLoadoutVisual() {
    const mode = LOADOUTS[ctx.state.loadout] ? ctx.state.loadout : LOADOUT_DEFAULT;
    barrelModel.visible = mode !== 'double';
    leftBarrel.visible = mode !== 'single';
    rightBarrel.visible = mode !== 'single';
  }

  return {
    group,

    attachInput(domElement) {
      const raycaster = new THREE.Raycaster();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // sol y = 0
      const ndc = new THREE.Vector2();
      const hit = new THREE.Vector3();
      const state = ctx.state;

      const aimFromEvent = (e) => {
        const rect = domElement.getBoundingClientRect();
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, ctx.camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          state.targetX = clamp(hit.x, -AIM_CLAMP, AIM_CLAMP);
        }
      };

      domElement.addEventListener('pointerdown', (e) => {
        ctx.audio.unlock();      // AudioContext créé au 1er geste
        state.holding = true;
        aimFromEvent(e);
      });
      domElement.addEventListener('pointermove', (e) => {
        if (state.holding) aimFromEvent(e);
      });
      // up/cancel sur window (parité proto) : le relâchement hors du canvas
      // stoppe bien le tir, évite le canon « bloqué » en tir continu.
      window.addEventListener('pointerup', () => { state.holding = false; });
      window.addEventListener('pointercancel', () => { state.holding = false; });
    },

    update(dt, t) {
      const state = ctx.state;
      applyLoadoutVisual();

      // Respiration idle — TOUJOURS (spec 5.8), même hors partie.
      group.scale.set(1, 1 + BREATH_AMP * Math.sin(t * BREATH_W), 1);

      // Retour du punch, ressort de recul, décroissance du micro-tremble — toujours (settle).
      barrelScale = protoLerp(barrelScale, 1, dt, BARREL_RETURN_K);
      spring(recoil, 0, BARREL_SPRING_STIFF, BARREL_SPRING_DAMP, dt);
      microTrauma = Math.max(0, microTrauma - dt * MICRO_DECAY);
      applyBarrel();

      if (!state.playing) return;

      // Visée : lerp du canon vers la cible (parité proto min(1, dt*14)).
      state.cannonX = protoLerp(state.cannonX, state.targetX, dt, CANNON_LERP_K);

      // Position (avec micro-tremble) + tilt — posés AVANT le tir pour une bouche à jour.
      const mx = (Math.random() - 0.5) * MICRO_AMP * microTrauma;
      const mz = (Math.random() - 0.5) * MICRO_AMP * microTrauma;
      group.position.set(state.cannonX + mx, 0, PLAYER_Z + mz);
      group.rotation.z = (state.targetX - state.cannonX) * CANNON_TILT;

      // Tir maintenu à cadence FIRE_DELAY.
      state.fireTimer -= dt;
      if (state.holding && state.fireTimer <= 0) {
        const loadout = currentLoadout();
        state.fireTimer = loadout.fireDelay || FIRE_DELAY;
        for (const off of loadout.offsets) {
          // jitter x ±FIRE_JITTER_X (équivaut au proto (rand-0.5)*0.5, distribution ±0.25).
          const jx = (Math.random() * 2 - 1) * FIRE_JITTER_X;
          ctx.sys.crowd.spawnBlue(state.cannonX + off + jx, PLAYER_Z - FIRE_SPAWN_DZ);
        }

        // Juice 5.1 : punch du fût, recul spring, micro-tremble, muzzle flash, son.
        barrelScale = BARREL_PUNCH;
        recoil.x = BARREL_RECOIL;
        microTrauma = 1;
        applyBarrel();

        for (const off of loadout.offsets) {
          tmpVec.set(off, 0, muzzleLocalZ);
          barrelPivot.localToWorld(tmpVec);
          ctx.particles.muzzle(tmpVec.x, tmpVec.y, tmpVec.z);
        }

        ctx.audio.play('shoot', { rateJitter: 0.1 });
      }
    },

    reset() {
      const state = ctx.state;
      state.cannonX = 0;
      state.targetX = 0;
      barrelScale = 1;
      recoil.x = 0;
      recoil.v = 0;
      microTrauma = 0;
      group.position.set(0, 0, PLAYER_Z);
      group.rotation.z = 0;
      group.scale.set(1, 1, 1);
      applyBarrel();
    },
  };
}
