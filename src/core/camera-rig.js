// MOB RUSH — rig caméra. Module-librairie (CONTRACT §5.3).
// Caméra responsive (formule proto EXACTE) + trauma shake (shake = trauma²).
// Dépendances autorisées : three, core/constants.js, juice/springs.js. Aucun import de GameState/ctx.
import * as THREE from 'three';
import { CAM, TRAUMA } from './constants.js';
import { clamp } from '../juice/springs.js';

/**
 * @param {{ renderer: THREE.WebGLRenderer }} deps
 * @returns rig caméra { camera, fit, addTrauma, setBaseYOffset, update }
 */
export function createCameraRig({ renderer }) {
  const camera = new THREE.PerspectiveCamera(
    CAM.fov,
    window.innerWidth / window.innerHeight,
    CAM.near,
    CAM.far,
  );

  // Position « fit » de base (recalculée à chaque resize) — le shake et l'offset de défaite s'y AJOUTENT
  // chaque frame ; on ne mute jamais cette base à partir de la position courante (pas de dérive).
  const fitPos = new THREE.Vector3(0, CAM.baseY, CAM.baseZ);
  let baseYOffset = 0; // défaite : -1 (appliqué à la position fit, PAS au shake)
  let trauma = 0;      // ∈ [0, 1]

  /** Formule proto EXACTE : k = max(0, 1/aspect - kBias) ; pos(0, baseY+k*kY, baseZ+k*kZ) ; lookAt(...). */
  function fit() {
    const a = window.innerWidth / window.innerHeight;
    camera.aspect = a;
    const k = Math.max(0, 1 / a - CAM.kBias);
    fitPos.set(0, CAM.baseY + k * CAM.kY, CAM.baseZ + k * CAM.kZ);
    // Oriente la caméra depuis la base fit (le shake ne modifie que rotation.z ensuite).
    camera.position.copy(fitPos);
    camera.lookAt(CAM.lookAt[0], CAM.lookAt[1], CAM.lookAt[2]);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** trauma = clamp(trauma + amount, 0, 1). */
  function addTrauma(amount) {
    trauma = clamp(trauma + amount, 0, 1);
  }

  /** Décale verticalement la position fit (défaite : -1). */
  function setBaseYOffset(dy) {
    baseYOffset = dy;
  }

  /**
   * @param {number} rawDt delta clampé NON scalé (le shake continue en slow-mo)
   * @param {number} realT temps réel cumulé (bruit déterministe du shake)
   */
  function update(rawDt, realT) {
    // decay linéaire du trauma (TRAUMA.decay par seconde)
    trauma = Math.max(0, trauma - TRAUMA.decay * rawDt);
    const shake = trauma * trauma;

    // bruit déterministe (fréquences fixes) : x, y, roll
    const nx = Math.sin(realT * 47.13);
    const ny = Math.sin(realT * 39.7 + 1.3);
    const nr = Math.sin(realT * 43.3 + 2.1);

    // Position finale = fit + baseYOffset + offset de shake — via .set() (pas de dérive cumulative).
    camera.position.set(
      fitPos.x + TRAUMA.maxOffset * shake * nx,
      fitPos.y + baseYOffset + TRAUMA.maxOffset * shake * ny,
      fitPos.z,
    );
    // roll : rotation.z absolu (x/y proviennent du lookAt de fit()).
    camera.rotation.z = TRAUMA.maxRoll * shake * nr;
  }

  fit();
  window.addEventListener('resize', fit);

  return { camera, fit, addTrauma, setBaseYOffset, update };
}
