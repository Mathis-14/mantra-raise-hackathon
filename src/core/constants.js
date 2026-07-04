// MOB RUSH — constantes gameplay. SEULE source des valeurs numériques (aucun littéral magique ailleurs).
// Valeurs EXACTES du prototype + arbitrages PLAN/CONTRACT. Voir CONTRACT.md §5.1.

// géométrie de jeu
export const LANE_HALF   = 4.5;
export const PLAYER_Z    = 20;
export const BASE_Z      = -24;
export const BLUE_HIT_Z  = -22.4;
export const RED_WIN_Z   = 20.5;
export const TRACK       = Object.freeze({ w: LANE_HALF * 2 + 1, h: 1, len: 52, y: -0.5, z: -2 });
export const RAIL        = Object.freeze({ w: 0.5, h: 1.3, len: 52, x: LANE_HALF + 0.7, y: -0.3, z: -2 });
export const DASH        = Object.freeze({ w: 0.35, h: 0.05, len: 1.6, y: 0.03, zStart: 16, zEnd: -22, step: -4 });

// caps & vitesses
export const MAX_BLUE    = 170;    // arbitrage PLAN C3 (proto: 380)
export const MAX_RED     = 160;
export const BLUE_SPEED  = 9;
export const FIRE_DELAY  = 0.14;
export const PLAYER_HP_START = 10;

// canon / visée (parité)
export const AIM_CLAMP        = LANE_HALF - 0.8;   // clamp targetX
export const SPAWN_CLAMP      = LANE_HALF - 0.3;   // clamp x au spawnBlue
export const CANNON_LERP_K    = 14;                // cannonX += (targetX-cannonX)*min(1, dt*14)
export const CANNON_TILT      = 0.08;              // rotation.z = (targetX - cannonX) * 0.08
export const FIRE_JITTER_X    = 0.25;              // ±0.25  ((Math.random()-0.5)*0.5)
export const FIRE_SPAWN_DZ    = 1.2;               // spawn à PLAYER_Z - 1.2
export const BARREL_PUNCH     = 1.25;              // scale au tir
export const BARREL_RETURN_K  = 10;                // lerp retour min(1, dt*10)
export const BARREL_RECOIL    = 0.3;               // recul spring du fût (spec 5.1), en u

// niveaux (formules — fonctions pures)
export const enemyHpForLevel    = (lv) => 40 + lv * 15;
export const coinsForLevel      = (lv) => 25 + lv * 5;
export const wavePeriodForLevel = (lv) => Math.max(1.1, 2.4 - lv * 0.12);
export const waveSizeForLevel   = (lv) => 2 + Math.floor(lv * 1.3);
export const redSpeedForLevel   = (lv) => 3.6 + lv * 0.12;
export const WAVE_FIRST_DELAY   = 1.2;

// géant rouge
export const GIANT_MIN_LEVEL   = 2;
export const GIANT_PROBA       = 0.35;
export const GIANT_HP          = 5;
export const GIANT_SPEED       = 2.2;
export const GIANT_LINE_DAMAGE = 3;
export const GIANT_SCALE       = 2.1;

// collisions
export const UNIT_RADIUS  = 0.7;
export const GIANT_RADIUS = 1.1;

// portes
export const GATE_ROWS_Z      = Object.freeze([7, -5]);
export const GATE_WIDTH       = LANE_HALF - 0.3;
export const GATE_OFFSET_X    = LANE_HALF / 2 + 0.1;   // portes à -OFFSET et +OFFSET
export const GATE_X_MIN_LEVEL = 3;
export const GATE_X_PROBA     = 0.4;
export const GATE_CLONE_JITTER_X = 0.6;   // ±0.6  ((Math.random()-0.5)*1.2)
export const GATE_CLONE_BACK_Z   = 0.5;   // z - Math.random()*0.5
export const GATE_FLASH_DUR   = 0.1;      // flash panneau ×2, 100 ms
export const GATE_PUNCH_DUR   = 0.25;     // punch texte 1→1.3→1

// caméra
export const CAM = Object.freeze({ fov: 55, near: 0.1, far: 200,
  baseY: 17, baseZ: 30, kY: 10, kZ: 12, kBias: 0.55, lookAt: Object.freeze([0, 0, -3]) });
// fit : k = max(0, 1/aspect - CAM.kBias) ; pos(0, baseY + k*kY, baseZ + k*kZ) ; lookAt(...CAM.lookAt)
export const TRAUMA = Object.freeze({ decay: 1.5, maxOffset: 0.5, maxRoll: 0.06,
  giantDeath: 0.15, pop: 0.05, popFrameCap: 0.1, redCross: 0.4, crack: 0.3, baseDestroy: 0.6 });

// rendu / ambiance
export const COLORS = Object.freeze({
  bg: 0x2B1D6B, track: 0xEDE7FF, rail: 0x7C5CFF, dash: 0xCFC2FF,
  blue: 0x38B6FF, blueDark: 0x2D7DFF, red: 0xFF4D6D, redDark: 0xD63354,
  gold: 0xFFD54A, gateGood: 0x00E5FF, gateBad: 0xFF3C5A,
});
export const FOG = Object.freeze({ color: 0x2B1D6B, near: 55, far: 90 });
export const LIGHTS = Object.freeze({
  hemi: Object.freeze({ sky: 0xbfd4ff, ground: 0x3a2a7a, intensity: 0.95 * Math.PI }),
  dir:  Object.freeze({ color: 0xffffff, intensity: 0.85 * Math.PI, pos: Object.freeze([6, 14, 8]) }),
});
export const DT_MAX = 0.05;
export const PIXEL_RATIO_MAX = 2;

// unités : animation procédurale (parité)
export const UNIT_HEIGHT   = 0.9;                       // normalisation bake (bbox)
export const BLUE_BOB      = Object.freeze({ freq: 10, amp: 0.15 });
export const RED_BOB       = Object.freeze({ freq: 8,  amp: 0.12 });
export const BLUE_WOBBLE   = Object.freeze({ freq: 7,  amp: 0.4 });
export const RED_WOBBLE    = Object.freeze({ freq: 5,  amp: 0.5 });
export const SPAWN_SQUASH  = Object.freeze({ from: Object.freeze([1.3, 0.6, 1.3]), dur: 0.15 }); // spec 5.1
export const UNIT_LEAN     = 0.12;                      // rad, inclinaison avant (spec 5.2)
export const UNIT_FACING_FIX = Math.PI;                 // rotY pour que le modèle regarde -Z (à VALIDER en T3)

// base
export const BASE_SQUASH   = Object.freeze([1.08, 0.94, 1.08]);
export const BASE_RETURN_K = 8;
export const BASE_CRACK_RATIOS = Object.freeze([0.66, 0.33]);
export const BASE_DESTROY  = Object.freeze({ slowScale: 0.25, slowDur: 0.6, seqDur: 1.6, chunkMin: 8, chunkMax: 10 });

// pops / juice
export const POP_LIFE = 0.3;
export const POP_POOL = 60;
export const POP_Y = 0.6;
export const HITSTOP_GIANT = Object.freeze({ scale: 0.05, dur: 0.04 });
export const GHOST_DELAY = 0.4;          // ghost fill 400 ms
export const DANGER_DIST = 6;            // vignette si rouge à < 6 u de RED_WIN_Z
export const DING_WINDOW = 0.3;          // fenêtre 300 ms du pitch croissant
export const LEVEL_FLASH_DUR = 1.4;      // s
export const LOSE_BTN_DELAY = 0.3;       // boutons défaite +300 ms
export const STAR_STAGGER = 0.2;         // étoiles séquentielles 200 ms
export const COIN_FLY_COUNT = 12;        // sprites de pièces volantes par victoire
