// MOB RUSH — layouts de niveaux (réf. ads Mob Control : couloirs de caisses, slalom, marée rouge).
// Module-librairie pur : données + sélection par niveau. Consommé par levels (clé/horde),
// obstacles (murs bloquants) et waves (multiplicateur de horde).
//
// Un mur = { x, z, halfW, halfD? } : rangée de caisses INFRANCHISSABLE (les unités glissent
// sur son flanc — aucune ne meurt ; seul le champion les fracasse).

import { BOSS_LEVEL_INTERVAL } from '../core/constants.js';

const D = 0.75; // demi-profondeur par défaut d'un mur

// Murs : kind 'crates' (caisses/barils) ou 'mound' (monticule de terre : pierres/rochers).
// Zones lentes (slows) : kind 'sand' (×0.78) ou 'mud' (×0.55) — ralentissent, ne bloquent jamais.
export const LAYOUTS = Object.freeze({
  // Piste ouverte + terrain léger (respiration entre deux niveaux à gimmick).
  classic: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: -2.7, z: 6.5, halfW: 0.9, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 2.5, z: -8.5, halfW: 0.9, halfD: D, kind: 'mound' }),
    ]),
    slows: Object.freeze([
      Object.freeze({ x: 1.6, z: 4, halfW: 1.7, halfD: 1.5, kind: 'sand' }),
    ]),
    hordeMult: 1,
  }),

  // SLALOM : murs alternés gauche/droite → la foule serpente (image « choose wisely » 2).
  slalom: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: -2.3, z: 11, halfW: 2.2, halfD: D, kind: 'crates' }),
      Object.freeze({ x: 2.3, z: 3.5, halfW: 2.2, halfD: D, kind: 'crates' }),
      Object.freeze({ x: -2.3, z: -4, halfW: 2.2, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 2.3, z: -11.5, halfW: 2.2, halfD: D, kind: 'crates' }),
    ]),
    slows: Object.freeze([
      Object.freeze({ x: 2.9, z: -4, halfW: 1.4, halfD: 1.2, kind: 'sand' }), // le contournement du monticule coûte un peu
    ]),
    hordeMult: 1,
  }),

  // LABYRINTHE : bloc central + chicanes latérales → deux goulets, boue dans le passage central.
  maze: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: 0, z: 9, halfW: 2.5, halfD: D, kind: 'crates' }),
      Object.freeze({ x: -3.5, z: 1.5, halfW: 1.1, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 3.5, z: 1.5, halfW: 1.1, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 0, z: -7, halfW: 2.5, halfD: D, kind: 'crates' }),
    ]),
    slows: Object.freeze([
      Object.freeze({ x: 0, z: 1.5, halfW: 1.7, halfD: 1.2, kind: 'mud' }), // goulet central : lent mais sûr
    ]),
    hordeMult: 1.4,
  }),

  // HORDE : couloir presque libre mais MARÉE rouge (tapis, image 1) — la masse est le danger.
  horde: Object.freeze({
    walls: Object.freeze([Object.freeze({ x: 0, z: 5, halfW: 1.5, halfD: D, kind: 'crates' })]),
    slows: Object.freeze([
      Object.freeze({ x: -3.2, z: 5, halfW: 1.2, halfD: 1.3, kind: 'sand' }),
      Object.freeze({ x: 3.2, z: 5, halfW: 1.2, halfD: 1.3, kind: 'sand' }),
    ]),
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
