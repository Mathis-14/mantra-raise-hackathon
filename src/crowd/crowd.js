// MOB RUSH — src/crowd/crowd.js — masse bleue instanciée (CONTRACT §6.2, PLAN §3/§5).
// Module-SYSTÈME : factory createCrowd(ctx). Possède state.blues (spawn/kill).
// N'importe aucun autre système ; interactions inter-systèmes uniquement via ctx dans les méthodes.

import * as THREE from 'three';
import {
  MAX_BLUE,
  SPAWN_CLAMP,
  BLUE_SPEED,
  BLUE_WOBBLE,
  BLUE_BOB,
  SPAWN_SQUASH,
  UNIT_LEAN,
  UNIT_FACING_FIX,
  COLORS,
} from '../core/constants.js';
import { teamMaterial } from '../assets/recolor.js';
import { clamp, clamp01, lerp } from '../juice/springs.js';
import { nextId } from '../core/ids.js';

const TWO_PI = 6.28;             // phase de wobble (parité proto : Math.random()*6.28)
const GATE_HOP_H = 0.6;          // hauteur de l'arc de « saut latéral » (clones de porte, spec 5.3)

export function createCrowd(ctx) {
  const { scene, state } = ctx;

  // InstancedMesh unique : géométrie bakée + matériau flat d'équipe (partagé, lecture seule).
  const mesh = new THREE.InstancedMesh(
    ctx.assets.bakedUnit.geometry,
    teamMaterial(COLORS.blue),
    MAX_BLUE,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const [fx, fy, fz] = SPAWN_SQUASH.from; // (1.3, 0.6, 1.3)

  return {
    spawnBlue(x, z, viaGate = false) {
      if (state.blues.length >= MAX_BLUE) return false; // cap (parité)
      state.blues.push({
        id: nextId(),
        x: clamp(x, -SPAWN_CLAMP, SPAWN_CLAMP),
        z,
        pz: z,
        wob: Math.random() * TWO_PI,
        spawnT: 0,
        viaGate,
      });
      return true;
    },

    killBlue(index) {
      const removed = state.blues.splice(index, 1);
      return removed[0]; // BlueUnit retiré (aucun effet annexe — à l'appelant)
    },

    moveStep(dt, t) {
      const blues = state.blues;
      for (let i = 0; i < blues.length; i++) {
        const u = blues[i];
        u.pz = u.z;                                   // z de début de frame (test de franchissement)
        u.z -= BLUE_SPEED * dt;
        u.x += Math.sin(t * BLUE_WOBBLE.freq + u.wob) * dt * BLUE_WOBBLE.amp;
        u.spawnT += dt;
      }
    },

    render(t) {
      const blues = state.blues;
      const n = Math.min(blues.length, MAX_BLUE);
      for (let i = 0; i < n; i++) {
        const u = blues[i];

        // Bobbing vertical (pieds bakés à y=0) — |sin(t·freq+wob)|·amp.
        let y = Math.abs(Math.sin(t * BLUE_BOB.freq + u.wob)) * BLUE_BOB.amp;
        let sx = 1;
        let sy = 1;
        let sz = 1;

        if (u.viaGate && u.spawnT < SPAWN_SQUASH.dur) {
          // Clone de porte : petit arc de « saut latéral » (spec 5.3), échelle pleine.
          const p = u.spawnT / SPAWN_SQUASH.dur; // 0..1
          y += Math.sin(p * Math.PI) * GATE_HOP_H;
        } else if (u.spawnT < SPAWN_SQUASH.dur) {
          // Squash & stretch au spawn (SPAWN_SQUASH.from → 1,1,1 sur 150 ms).
          const p = clamp01(u.spawnT / SPAWN_SQUASH.dur);
          sx = lerp(fx, 1, p);
          sy = lerp(fy, 1, p);
          sz = lerp(fz, 1, p);
        }

        dummy.position.set(u.x, y, u.z);
        dummy.rotation.set(UNIT_LEAN, UNIT_FACING_FIX, 0); // inclinaison avant + orientation -Z
        dummy.scale.set(sx, sy, sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;

      // Volume du patter de pas proportionnel à la taille de la foule.
      ctx.audio.synth?.setPatterLevel(Math.min(1, blues.length / 100));
    },

    reset() {
      state.blues.length = 0;
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
