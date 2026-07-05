// MRUSH — layouts de niveaux (réf. ads Mob Control : couloirs de caisses, slalom, marée rouge).
// Module-librairie pur : données + sélection par niveau. Consommé par levels (clé/horde),
// obstacles (murs bloquants) et waves (multiplicateur de horde).
//
// Un mur = { x, z, halfW, halfD? } : rangée de caisses INFRANCHISSABLE (les unités glissent
// sur son flanc — aucune ne meurt ; seul le champion les fracasse).

import { BOSS_LEVEL_INTERVAL } from '../core/constants.js';

const D = 0.75; // demi-profondeur par défaut d'un mur

// kind : 'crates' (assets de mur du skin courant) | 'mound' (motte de terre teintée au skin).
// axis : 'x' (mur en travers, défaut) | 'z' (mur longitudinal — séparateur de couloirs).
// hazards : dangers létaux du layout (saw/spikes) — JAMAIS au milieu d'un passage, toujours
// sur les flancs ; chaque entrée porte son minLevel.
// Les mottes sont ÉVITABLES par construction : petites, jamais en travers complet.
export const LAYOUTS = Object.freeze({
  // Piste ouverte + mottes de terre évitables (obstacles doux, sans piège central).
  classic: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: -2.6, z: 6.5, halfW: 0.9, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 2.4, z: -8.5, halfW: 0.9, halfD: D, kind: 'mound' }),
    ]),
    hazards: Object.freeze([
      Object.freeze({ type: 'saw', x: -3.4, z: 1.4, minLevel: 2 }),   // flanc, pas au centre
      Object.freeze({ type: 'spikes', x: 3.3, z: -9.5, minLevel: 3 }),
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
    hazards: Object.freeze([
      // dans l'angle mort du slalom (côté mur), jamais dans le couloir de passage
      Object.freeze({ type: 'spikes', x: -3.6, z: 7.2, minLevel: 3 }),
    ]),
    hordeMult: 1,
  }),

  // LABYRINTHE : bloc central + chicanes en mottes → deux goulets d'étranglement.
  maze: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: 0, z: 9, halfW: 2.5, halfD: D, kind: 'crates' }),
      Object.freeze({ x: -3.5, z: 1.5, halfW: 1.1, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 3.5, z: 1.5, halfW: 1.1, halfD: D, kind: 'mound' }),
      Object.freeze({ x: 0, z: -7, halfW: 2.5, halfD: D, kind: 'crates' }),
    ]),
    hazards: Object.freeze([
      Object.freeze({ type: 'spikes', x: -3.4, z: -12.5, minLevel: 3 }),
      Object.freeze({ type: 'spikes', x: 3.4, z: -12.5, minLevel: 4 }),
    ]),
    hordeMult: 1.4,
  }),

  // HORDE : couloir presque libre mais MARÉE rouge (tapis, image 1) — la masse EST le danger.
  horde: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: 0, z: 5, halfW: 1.5, halfD: D, kind: 'crates' }),
      Object.freeze({ x: -2.9, z: -6, halfW: 0.8, halfD: D, kind: 'mound' }),
    ]),
    hazards: Object.freeze([]),
    hordeMult: 3,
  }),

  // COULOIRS : deux murs LONGITUDINAUX séparent la zone ennemie en 3 couloirs — les vagues
  // rouges arrivent par couloir (flots séparés par les murs), le joueur choisit ses duels.
  lanes: Object.freeze({
    walls: Object.freeze([
      Object.freeze({ x: -1.55, z: -11.5, halfW: 0.4, halfD: 4.5, kind: 'crates', axis: 'z' }),
      Object.freeze({ x: 1.55, z: -11.5, halfW: 0.4, halfD: 4.5, kind: 'crates', axis: 'z' }),
    ]),
    lanesX: Object.freeze([-3.1, 0, 3.1]), // centres des 3 couloirs (spawn ennemi)
    hazards: Object.freeze([]),            // aucun piège dans les couloirs
    hordeMult: 1.6,
  }),
});

// Rotation des gimmicks sur les niveaux non-boss ; les niveaux de boss restent dégagés
// (le boss a besoin d'espace et EST le gimmick).
const CYCLE = ['classic', 'lanes', 'slalom', 'maze', 'horde']; // lanes en 2e (L3 = boss, sinon il n'apparaîtrait qu'au L8)

export function layoutKeyForLevel(level) {
  if (level % BOSS_LEVEL_INTERVAL === 0) return 'classic';
  return CYCLE[(level - 1) % CYCLE.length];
}

export function layoutForLevel(level) {
  return LAYOUTS[layoutKeyForLevel(level)];
}
