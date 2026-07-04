// MOB RUSH — HUD (CONTRACT §6.9). Module-SYSTÈME : factory createHud(ctx).
// SEUL module (avec overlays / vignette / flying-coins) autorisé à toucher le DOM.
// Ne LIT que ctx.state ; n'appelle AUCUN autre système (aucun ctx.sys.*).
// Ids DOM EXACTS (index.html) : levelPill coinPill playerHpVal enemyFill enemyGhost
//                               enemyHp playerHp hint levelFlash levelFlashTxt.
// Aucun effet de bord à l'import.

import { LEVEL_FLASH_DUR, GHOST_DELAY } from '../core/constants.js';
import { damp, clamp01 } from '../juice/springs.js';

// --- Constantes de présentation locales (timings/échelles d'anim DOM, hors gameplay :
//     absentes de core/constants.js, ce ne sont PAS des littéraux magiques de jeu). ---
const COIN_PUNCH_SCALE = 1.25;  // échelle du punch du compteur de pièces (spec §6.9)
const COIN_PUNCH_S     = 0.2;   // durée (s) de la transition CSS retour 1.25 → 1
const GHOST_LAMBDA     = 8;     // λ du damp du ghost fill vers enemyFill (spec §6.9)

const GAME_HUD_IDS = ['enemyHp', 'playerHp', 'hint'];

const $ = (id) => document.getElementById(id);

/**
 * @param {object} ctx — contexte partagé (CONTRACT §4) ; on n'utilise que ctx.state.
 * @returns {{
 *   refresh():void, flashLevel():void, punchCoins():void, setDisplayedCoins(v:number):void,
 *   showGameHud():void, hideGameHud():void, update(rawDt:number):void
 * }}
 */
export function createHud(ctx) {
  const state = ctx.state;

  // Éléments DOM résolus une fois. Chaque usage est gardé (no-op si absent).
  const el = {
    levelPill:    $('levelPill'),
    coinPill:     $('coinPill'),
    playerHpVal:  $('playerHpVal'),
    enemyFill:    $('enemyFill'),
    enemyGhost:   $('enemyGhost'),
    levelFlash:   $('levelFlash'),
    levelFlashTxt: $('levelFlashTxt'),
  };

  // Compteur de pièces AFFICHÉ (peut différer de state.coins pendant les pièces volantes).
  let displayedCoins = (state && state.coins) || 0;

  // Ghost fill (barre jaune retardée derrière la barre rouge) — ratio interne [0,1].
  const initFill = state && state.enemyHpMax ? clamp01(state.enemyHp / state.enemyHpMax) : 1;
  let ghostRatio = initFill;   // largeur courante du ghost, en fraction
  let prevFill = initFill;     // ratio de la frame précédente (détection de baisse)
  let ghostDelay = 0;          // s restantes de maintien avant que le ghost rejoigne le fill

  function refresh() {
    if (el.levelPill) el.levelPill.textContent = 'NIV ' + state.level;
    if (el.coinPill) el.coinPill.textContent = '🪙 ' + Math.round(displayedCoins);
    if (el.playerHpVal) el.playerHpVal.textContent = state.playerHp;
    // Parité refreshUI : largeur du fill = max(0, hp/hpMax*100)%. Ne touche PAS le ghost.
    if (el.enemyFill) {
      el.enemyFill.style.width = Math.max(0, (state.enemyHp / state.enemyHpMax) * 100) + '%';
    }
  }

  function flashLevel() {
    if (el.levelFlashTxt) el.levelFlashTxt.textContent = 'NIVEAU ' + state.level;
    // Parité proto : keyframes d'opacité, durée LEVEL_FLASH_DUR (Web Animations API).
    if (el.levelFlash && typeof el.levelFlash.animate === 'function') {
      el.levelFlash.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
        { duration: LEVEL_FLASH_DUR * 1000 },
      );
    }
  }

  function punchCoins() {
    const c = el.coinPill;
    if (!c) return;
    // Snap à 1.25 sans transition, puis retour animé vers 1 (transition CSS courte).
    c.style.transition = 'none';
    c.style.transform = 'scale(' + COIN_PUNCH_SCALE + ')';
    void c.offsetWidth; // force le reflow pour que le snap soit pris en compte
    c.style.transition = 'transform ' + COIN_PUNCH_S + 's ease-out';
    c.style.transform = 'scale(1)';
  }

  function setDisplayedCoins(v) {
    displayedCoins = v;
    if (el.coinPill) el.coinPill.textContent = '🪙 ' + Math.round(displayedCoins);
  }

  function showGameHud() {
    for (const id of GAME_HUD_IDS) { const e = $(id); if (e) e.classList.remove('hidden'); }
  }

  function hideGameHud() {
    for (const id of GAME_HUD_IDS) { const e = $(id); if (e) e.classList.add('hidden'); }
  }

  // GHOST FILL — temps RÉEL (rawDt) : quand le ratio HP baisse, le ghost garde l'ancienne
  // largeur pendant GHOST_DELAY (0.4 s) puis rejoint enemyFill par damp(λ=8).
  function update(rawDt) {
    const fill = state.enemyHpMax ? clamp01(state.enemyHp / state.enemyHpMax) : 0;

    if (fill > ghostRatio) {
      // La barre remonte (reset de niveau / retry) : le ghost saute directement, pas de retard.
      ghostRatio = fill;
      ghostDelay = 0;
    } else {
      // Nouvelle baisse détectée → (re)démarre le maintien à la largeur courante (plus haute).
      if (fill < prevFill) ghostDelay = GHOST_DELAY;
      if (ghostDelay > 0) {
        ghostDelay -= rawDt;
      } else {
        ghostRatio = damp(ghostRatio, fill, GHOST_LAMBDA, rawDt);
      }
    }
    prevFill = fill;

    if (el.enemyGhost) el.enemyGhost.style.width = (ghostRatio * 100) + '%';
  }

  return { refresh, flashLevel, punchCoins, setDisplayedCoins, showGameHud, hideGameHud, update };
}
