// MRUSH — layouts de niveaux (réf. ads Mob Control : couloirs de caisses, slalom, marée rouge).
// Module-librairie pur : données + sélection par niveau. Consommé par levels (clé/horde),
// obstacles (murs bloquants) et waves (multiplicateur de horde).
//
// Un mur = { x, z, halfW, halfD? } : rangée de caisses INFRANCHISSABLE (les unités glissent
// sur son flanc — aucune ne meurt ; seul le champion les fracasse).

import { BOSS_LEVEL_INTERVAL } from '../core/constants.js';

const D = 0.75; // demi-profondeur par défaut d'un mur

export const LAYOUTS = Object.freeze({
  // Piste ouverte du prototype (respiration entre deux niveaux à gimmick).
  classic: Object.freeze({ walls: Object.freeze([]), hordeMult: 1 }),

  // SLALOM : murs alternés gauche/droite → la foule serpente (image « choose wisely » 2).
  slalom: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: -2.3, z: 11, halfW: 2.2, halfD: D }),
      Object.freeze({ x: 2.3, z: 3.5, halfW: 2.2, halfD: D }),
      Object.freeze({ x: -2.3, z: -4, halfW: 2.2, halfD: D }),
      Object.freeze({ x: 2.3, z: -11.5, halfW: 2.2, halfD: D }),
    ]),
    hordeMult: 1,
  }),

  // LABYRINTHE : bloc central + chicanes latérales → deux goulets d'étranglement.
  maze: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: 0, z: 9, halfW: 2.5, halfD: D }),
      Object.freeze({ x: -3.5, z: 1.5, halfW: 1.1, halfD: D }),
      Object.freeze({ x: 3.5, z: 1.5, halfW: 1.1, halfD: D }),
      Object.freeze({ x: 0, z: -7, halfW: 2.5, halfD: D }),
    ]),
    hordeMult: 1.4,
  }),

  // HORDE : couloir presque libre mais MARÉE rouge (tapis, image 1) — la masse est le danger.
  horde: Object.freeze({
    walls: Object.freeze([Object.freeze({ x: 0, z: 5, halfW: 1.5, halfD: D })]),
    hordeMult: 3,
  }),
});

// Rotation des gimmicks sur les niveaux non-boss ; les niveaux de boss restent dégagés
// (le boss a besoin d'espace et EST le gimmick).
const CYCLE = ['classic', 'slalom', 'maze', 'horde'];

export function layoutKeyForLevel(level) {
  if (level % BOSS_LEVEL_INTERVAL === 0) return 'classic';
  return CYCLE[(level - 1) % CYCLE.length];
}

export function layoutForLevel(level) {
  return LAYOUTS[layoutKeyForLevel(level)];
}
