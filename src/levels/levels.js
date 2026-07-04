// MOB RUSH — src/levels/levels.js
// Système de configuration par niveau + flow de partie (start/win/lose/next/retry).
// CONTRACT §6.8. Module-SYSTÈME : factory createLevels(ctx) ; toute interaction inter-système
// passe par ctx.sys.* / ctx.* dans les méthodes uniquement (jamais dans le corps de la factory).
// Aucun littéral gameplay ici : tout provient de core/constants.js (parité prototype).

import {
  PLAYER_HP_START,
  WAVE_FIRST_DELAY,
  GIANT_MIN_LEVEL,
  GATE_X_MIN_LEVEL,
  enemyHpForLevel,
  coinsForLevel,
  wavePeriodForLevel,
  waveSizeForLevel,
  redSpeedForLevel,
} from '../core/constants.js';

/**
 * @param {import('../core/app.js').Ctx} ctx
 * @returns {{
 *   configFor(level:number): object,
 *   startLevel(): void,
 *   win(): void,
 *   lose(): void,
 *   next(): void,
 *   retry(): void,
 * }}
 */
export function createLevels(ctx) {
  const { state } = ctx;

  // Applique le filtre CSS de #game (désaturation de défaite). Faithful à la spec
  // (document.getElementById('game').style.filter) ; garde null-safe pour ne pas crasher
  // hors DOM — comportement identique quand l'élément existe.
  function setGameFilter(value) {
    const el = document.getElementById('game');
    if (el) el.style.filter = value;
  }

  /** Formules pures dérivées du niveau (constants.js). */
  function configFor(level) {
    return {
      enemyHpMax: enemyHpForLevel(level),
      coinGain: coinsForLevel(level),
      wavePeriod: wavePeriodForLevel(level),
      waveSize: waveSizeForLevel(level),
      redSpeed: redSpeedForLevel(level),
      giantAllowed: level >= GIANT_MIN_LEVEL,
      xGateAllowed: level >= GATE_X_MIN_LEVEL,
    };
  }

  /** Démarre (ou redémarre) le niveau courant. ORDRE EXACT imposé par le CONTRACT §6.8. */
  function startLevel() {
    ctx.sys.crowd.reset();
    ctx.sys.waves.reset();
    ctx.particles.reset();
    ctx.confetti.reset();
    ctx.floatingText.reset();
    ctx.sys.giants.reset();
    ctx.sys.heroes.reset();
    ctx.sys.cannon.reset();
    ctx.time.reset();
    ctx.cameraRig.setBaseYOffset(0);
    setGameFilter(''); // retire la désaturation de défaite

    state.playerHp = PLAYER_HP_START;
    state.enemyHpMax = state.enemyHp = enemyHpForLevel(state.level);
    state.waveTimer = WAVE_FIRST_DELAY;

    ctx.sys.gates.build(state.level);
    ctx.sys.base.reset(state.level);
    ctx.sys.hud.refresh();
    ctx.sys.hud.flashLevel();

    state.playing = true;
  }

  /** Appelé par base APRÈS la séquence de destruction (base a déjà mis state.playing=false). */
  function win() {
    const gain = coinsForLevel(state.level);
    state.coins += gain;
    ctx.audio.synth?.jingleWin();
    ctx.sys.overlays.showWin(gain);
  }

  /** Défaite : gèle la partie, jingle, désature #game, abaisse la caméra, affiche l'overlay. */
  function lose() {
    state.playing = false;
    ctx.audio.synth?.jingleLose();
    setGameFilter('grayscale(0.6)');
    ctx.cameraRig.setBaseYOffset(-1);
    ctx.sys.overlays.showLose();
  }

  /** Niveau suivant. */
  function next() {
    state.level++;
    ctx.sys.overlays.hideAll();
    startLevel();
  }

  /** Rejoue le niveau courant. */
  function retry() {
    ctx.sys.overlays.hideAll();
    startLevel();
  }

  return { configFor, startLevel, win, lose, next, retry };
}
