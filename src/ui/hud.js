// MOB RUSH — HUD (CONTRACT §6.9). Module-SYSTÈME : factory createHud(ctx).
// SEUL module (avec overlays / vignette / flying-coins) autorisé à toucher le DOM.
// Ne LIT que ctx.state ; n'appelle AUCUN autre système (aucun ctx.sys.*).
// Ids DOM EXACTS (index.html) : levelPill coinPill playerHpVal enemyFill enemyGhost
//                               enemyHp playerHp hint levelFlash levelFlashTxt.
// Aucun effet de bord à l'import.

import { LEVEL_FLASH_DUR, GHOST_DELAY, LOADOUTS, LOADOUT_DEFAULT } from '../core/constants.js';
import { damp, clamp01 } from '../juice/springs.js';

// --- Constantes de présentation locales (timings/échelles d'anim DOM, hors gameplay :
//     absentes de core/constants.js, ce ne sont PAS des littéraux magiques de jeu). ---
const COIN_PUNCH_SCALE = 1.25;  // échelle du punch du compteur de pièces (spec §6.9)
const COIN_PUNCH_S     = 0.2;   // durée (s) de la transition CSS retour 1.25 → 1
const GHOST_LAMBDA     = 8;     // λ du damp du ghost fill vers enemyFill (spec §6.9)

// championHud retiré : la jauge/RELEASE sont des objets 3D collés au canon (crowd/champion.js).
const GAME_HUD_IDS = ['enemyHp', 'playerHp'];
const COIN_ICON = '/models/platformer-kit/Previews/coin-gold.png';
const GEM_ICON = '/models/platformer-kit/Previews/jewel.png';

const $ = (id) => document.getElementById(id);
const iconValue = (src, value) => '<img class="hudIcon" src="' + src + '" alt="">' + Math.round(value);

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
    gemPill:      $('gemPill'),
    loadoutPill:  $('loadoutPill'),
    playerHp:     $('playerHp'),
    playerHpVal:  $('playerHpVal'),
    enemyFill:    $('enemyFill'),
    enemyGhost:   $('enemyGhost'),
    enemyHpText:  $('enemyHpText'),
    enemyName:    $('enemyName'),
    enemyLvl:     $('enemyLvl'),
    championFill: $('championFill'),
    championLabel: $('championLabel'),
    releaseBtn:   $('releaseBtn'),
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

  // Juice générique : snap à `scale` puis retour animé à 1 (compose avec un transform de base
  // éventuel, ex. le translateX(-50%) des éléments centrés).
  function punchEl(elm, scale, baseTransform = '') {
    if (!elm) return;
    elm.style.transition = 'none';
    elm.style.transform = baseTransform + ' scale(' + scale + ')';
    void elm.offsetWidth;
    elm.style.transition = 'transform ' + COIN_PUNCH_S + 's ease-out';
    elm.style.transform = baseTransform + ' scale(1)';
  }

  let prevPlayerHp = (state && state.playerHp) || 0;

  function refresh() {
    // Dégâts joueur : punch + flash rouge du compteur de PV (chaque perte est ressentie).
    if (state.playerHp < prevPlayerHp && el.playerHp) {
      punchEl(el.playerHp, 1.4, 'translateX(-50%)');
      el.playerHp.style.color = '#ff5d75';
      setTimeout(() => { el.playerHp.style.color = ''; }, 220);
    }
    prevPlayerHp = state.playerHp;
    if (el.levelPill) el.levelPill.textContent = 'LVL ' + state.level;
    if (el.coinPill) el.coinPill.innerHTML = iconValue(COIN_ICON, displayedCoins);
    if (el.gemPill) el.gemPill.innerHTML = iconValue(GEM_ICON, state.gems || 0);
    if (el.loadoutPill) {
      const mode = LOADOUTS[state.loadout] ? state.loadout : LOADOUT_DEFAULT;
      el.loadoutPill.textContent = mode === 'triple' ? '3x' : (mode === 'double' ? '2x' : '1x');
    }
    if (el.playerHpVal) el.playerHpVal.textContent = state.playerHp;
    if (el.enemyName) el.enemyName.textContent = state.bossLevel ? 'KILL BOSS' : 'ENEMY BASE';
    if (el.enemyLvl) el.enemyLvl.textContent = 'LVL ' + state.level;
    if (el.enemyHpText) el.enemyHpText.textContent = formatHp(state.enemyHp);
    // Parité refreshUI : largeur du fill = max(0, hp/hpMax*100)%. Ne touche PAS le ghost.
    if (el.enemyFill) {
      el.enemyFill.style.width = Math.max(0, (state.enemyHp / state.enemyHpMax) * 100) + '%';
    }
  }

  function flashLevel() {
    punchEl(el.levelPill, 1.3); // le pill de niveau claque en même temps que le flash
    prevPlayerHp = state.playerHp; // reset de niveau : pas de faux punch de dégâts
    if (el.levelFlashTxt) el.levelFlashTxt.textContent = 'LEVEL ' + state.level;
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
    if (el.coinPill) el.coinPill.innerHTML = iconValue(COIN_ICON, displayedCoins);
  }

  function formatHp(value) {
    const v = Math.max(0, Math.round(value || 0));
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
    return String(v);
  }

  // La jauge de champion + le bouton RELEASE sont désormais des GAME OBJECTS 3D collés au canon
  // (voir crowd/champion.js : buildGauge/updateGauge, clic par raycast). Le HUD DOM #championHud
  // est neutralisé (masqué en permanence) ; on garde bindChampion en no-op pour l'API app.js.
  function bindChampion(_onRelease) {
    const chud = $('championHud');
    if (chud) chud.classList.add('hidden');
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
    // (jauge champion : objet 3D collé au canon — géré par crowd/champion.js)
  }

  return { refresh, flashLevel, punchCoins, setDisplayedCoins, bindChampion, showGameHud, hideGameHud, update };
}
