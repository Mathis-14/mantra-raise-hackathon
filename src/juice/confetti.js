// MOB RUSH — confetti (juice) : CONTRACT §5.9.
// Module-librairie pur : n'importe QUE three + core/constants.js (palette).
// Ne connaît ni GameState ni ctx. Aucun effet de bord à l'import.

import * as THREE from 'three';
import { COLORS } from '../core/constants.js';

// Capacité du pool (ring-buffer). Un burst de victoire = 150 quads ;
// 256 laisse de la marge en cas de bursts qui se chevauchent (overwrite du plus ancien).
const CAP = 256;

// Physique / durée de vie — valeurs présentationnelles (hors constants.js gameplay).
const GRAVITY = 10;        // u/s²
const LIFE_MIN = 2.2;      // s  → vie ~2.5 s (CONTRACT §5.9)
const LIFE_RAND = 0.6;     // s
const FADE_OUT = 0.4;      // s  — scale-out sur la fin de vie

// Palette confetti : bleu / rouge / or / blanc (CONTRACT §5.9).
const PALETTE = [COLORS.blue, COLORS.red, COLORS.gold, 0xffffff];

/**
 * @param {THREE.Scene} scene
 * @returns {{ burst(x:number,y:number,z:number,count?:number):void, update(dt:number):void, reset():void }}
 */
export function createConfetti(scene) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAP);
  mesh.frustumCulled = false;            // règle absolue : tout InstancedMesh
  mesh.count = CAP;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // État par particule (pool fixe).
  const P = new Array(CAP);
  for (let i = 0; i < CAP; i++) {
    P[i] = {
      px: 0, py: 0, pz: 0,
      vx: 0, vy: 0, vz: 0,
      rx: 0, ry: 0, rz: 0,      // rotation courante (euler)
      arx: 0, ary: 0, arz: 0,   // vitesse angulaire
      sx: 0.16, sy: 0.24,       // demi-taille du quad
      life: 0, maxLife: 1,
      active: false,
    };
  }

  // Scratch (zéro allocation par frame).
  const dummy = new THREE.Object3D();
  const scratchColor = new THREE.Color();

  // Init couleurs (crée l'attribut instanceColor) + tout hors écran.
  for (let i = 0; i < CAP; i++) {
    mesh.setColorAt(i, scratchColor.setHex(0xffffff));
  }
  hideAll();
  mesh.instanceColor.needsUpdate = true;

  scene.add(mesh);

  let head = 0;              // curseur d'écriture (ring-buffer)
  let colorDirty = false;

  function hideAll() {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function burst(x, y, z, count = 150) {
    const n = Math.min(count, CAP);
    for (let k = 0; k < n; k++) {
      const i = head;
      head = (head + 1) % CAP;
      const p = P[i];

      p.px = x; p.py = y; p.pz = z;

      // Vélocité conique ouverte vers le haut.
      const speed = 4 + Math.random() * 5;
      p.vx = (Math.random() * 2 - 1) * 0.7 * speed;
      p.vz = (Math.random() * 2 - 1) * 0.7 * speed;
      p.vy = speed * (0.9 + Math.random() * 0.5) + 2;

      // Rotations aléatoires (tumble).
      p.rx = Math.random() * Math.PI * 2;
      p.ry = Math.random() * Math.PI * 2;
      p.rz = Math.random() * Math.PI * 2;
      p.arx = (Math.random() * 2 - 1) * 6;
      p.ary = (Math.random() * 2 - 1) * 6;
      p.arz = (Math.random() * 2 - 1) * 6;

      p.sx = 0.14 + Math.random() * 0.08;
      p.sy = 0.20 + Math.random() * 0.12;

      p.maxLife = LIFE_MIN + Math.random() * LIFE_RAND;
      p.life = p.maxLife;
      p.active = true;

      mesh.setColorAt(i, scratchColor.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]));
    }
    colorDirty = true;
  }

  function update(dt) {
    if (dt <= 0) return;
    const drag = 1 - Math.min(1, dt * 1.5);   // freinage horizontal léger
    for (let i = 0; i < CAP; i++) {
      const p = P[i];
      if (!p.active) continue;

      p.vy -= GRAVITY * dt;
      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;
      p.vx *= drag;
      p.vz *= drag;

      p.rx += p.arx * dt;
      p.ry += p.ary * dt;
      p.rz += p.arz * dt;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const fade = p.life < FADE_OUT ? p.life / FADE_OUT : 1;
      dummy.position.set(p.px, p.py, p.pz);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.sx * fade, p.sy * fade, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colorDirty) {
      mesh.instanceColor.needsUpdate = true;
      colorDirty = false;
    }
  }

  function reset() {
    for (let i = 0; i < CAP; i++) P[i].active = false;
    head = 0;
    hideAll();
  }

  return { burst, update, reset };
}
