// MOB RUSH — overlays start / win / lose (CONTRACT §6.10). Module-SYSTÈME.
// SEUL module (avec hud / vignette / flying-coins) autorisé à toucher le DOM.
// Interactions inter-système via ctx.sys.* UNIQUEMENT dans les méthodes (jamais dans la factory).
// Ids DOM EXACTS (index.html) : startOverlay startBtn winOverlay winCoins nextBtn loseOverlay retryBtn.
// Aucun effet de bord à l'import.

import { STAR_STAGGER, COIN_FLY_COUNT, LOSE_BTN_DELAY, LOADOUTS, LOADOUT_DEFAULT } from '../core/constants.js';
import { easeOutBack, clamp01 } from '../juice/springs.js';

// --- Chemins des sprites UI (CONTRACT §8.3, servis à la racine par Vite). ---
// Les boutons gardent leur style CSS (dégradé d'index.html) ; seules les étoiles de victoire
// utilisent encore des sprites UI Pack.
const STAR_FILL_URL    = '/ui/ui-pack/PNG/Yellow/Default/star.png';
const STAR_OUTLINE_URL = '/ui/ui-pack/PNG/Grey/Default/star_outline_depth.png';
const COIN_ICON_URL    = '/models/platformer-kit/Previews/coin-gold.png';

// --- Constantes de présentation locales (chrome/anim DOM, hors gameplay : ce ne sont
//     PAS des littéraux magiques de jeu ; core/constants.js ne les couvre pas). ---
const PRESS_Y_PX    = 4;     // enfoncement au press (parité CSS .btn:active d'index.html)
const STAR_COUNT    = 3;     // 3 étoiles séquentielles (spec §6.10, A8 : toujours pleines)
const STAR_SIZE_PX  = 56;    // taille d'affichage d'une étoile
const STAR_GAP_PX   = 14;    // espacement entre étoiles
const STAR_POP_DUR  = 0.45;  // durée (s) du spring easeOutBack d'apparition d'une étoile
const PULSE_PERIOD  = 1.2;   // s — période du pulse du bouton « suivant »
const PULSE_MAX     = 0.05;  // amplitude : scale oscille dans [1, 1 + PULSE_MAX] (1 → 1.05)
const STYLE_ID      = 'mobrush-overlay-style';

const $ = (id) => document.getElementById(id);

/**
 * @param {object} ctx — contexte partagé (CONTRACT §4).
 * @param {{ onStart:Function, onNext:Function, onRetry:Function }} handlers
 * @returns {{
 *   bind():void, showStart():void, showWin(gain:number):void, showLose():void,
 *   hideAll():void, update(rawDt:number):void, handleCoinTick(i:number):void
 * }}
 */
export function createOverlays(ctx, { onStart, onNext, onRetry } = {}) {
  const startOverlay = $('startOverlay');
  const startBtn = $('startBtn');
  const winOverlay = $('winOverlay');
  const winCoins = $('winCoins');
  const nextBtn = $('nextBtn');
  const loseOverlay = $('loseOverlay');
  const retryBtn = $('retryBtn');
  const loadoutBtns = Array.from(document.querySelectorAll('[data-loadout]'));

  // Séquence de victoire.
  let winElapsed = 0;           // s réelles depuis showWin (pulse + révélation des étoiles)
  let coinFrom = 0;             // valeur affichée de départ du « roll » de pièces
  let coinTarget = 0;           // valeur affichée cible (= state.coins après le gain)
  let coinsArrived = 0;         // nb de pièces volantes arrivées pour CETTE victoire

  // Défaite.
  let loseBtnTimer = 0;         // s restantes avant réactivation du bouton retry

  // Étoiles (créées paresseusement, réutilisées d'une victoire à l'autre).
  let starsRow = null;
  const stars = [];             // { fill, revealAt, triggered, animT, done }

  // Injecte une règle composant pulse (scale) ET press (translateY) via une variable CSS,
  // pour CONSERVER le press translateY (parité) même quand le bouton pulse.
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.btn{transform:scale(var(--btn-pulse,1));}' +
      '.btn:active{transform:translateY(' + PRESS_Y_PX + 'px) scale(var(--btn-pulse,1));}';
    document.head.appendChild(style);
  }

  function wireButton(btn, cb) {
    if (!btn) return;
    btn.onclick = () => {
      if (ctx.audio) {
        ctx.audio.unlock();
        ctx.audio.play('click');
      }
      if (typeof cb === 'function') cb();
    };
  }

  function selectLoadout(mode) {
    const next = LOADOUTS[mode] ? mode : LOADOUT_DEFAULT;
    ctx.state.loadout = next;
    for (const btn of loadoutBtns) {
      btn.classList.toggle('selected', btn.dataset.loadout === next);
    }
    ctx.sys.hud?.refresh();
  }

  function ensureStars() {
    if (starsRow || !winOverlay) return;
    starsRow = document.createElement('div');
    starsRow.style.cssText =
      'display:flex;justify-content:center;align-items:center;gap:' + STAR_GAP_PX + 'px;';
    for (let i = 0; i < STAR_COUNT; i++) {
      const slot = document.createElement('div');
      slot.style.cssText =
        'position:relative;width:' + STAR_SIZE_PX + 'px;height:' + STAR_SIZE_PX + 'px;';
      const outline = document.createElement('img');
      outline.src = STAR_OUTLINE_URL;
      outline.draggable = false;
      outline.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:.5;';
      const fill = document.createElement('img');
      fill.src = STAR_FILL_URL;
      fill.draggable = false;
      fill.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;transform-origin:50% 50%;' +
        'transform:scale(0);opacity:0;';
      slot.appendChild(outline);
      slot.appendChild(fill);
      starsRow.appendChild(slot);
      stars.push({ fill, revealAt: i * STAR_STAGGER, triggered: false, animT: 0, done: false });
    }
    // Sous le titre, au-dessus du compteur de gain, même si le compteur est dans une carte.
    const parent = winCoins && winCoins.parentNode ? winCoins.parentNode : winOverlay;
    if (winCoins && parent) parent.insertBefore(starsRow, winCoins);
    else if (parent) parent.appendChild(starsRow);
  }

  function resetStars() {
    ensureStars();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.revealAt = i * STAR_STAGGER;
      s.triggered = false;
      s.animT = 0;
      s.done = false;
      s.fill.style.transform = 'scale(0)';
      s.fill.style.opacity = '0';
    }
  }

  function bind() {
    injectStyle();
    wireButton(startBtn, onStart);
    wireButton(nextBtn, onNext);
    wireButton(retryBtn, onRetry);
    for (const btn of loadoutBtns) {
      btn.onclick = () => {
        ctx.audio?.unlock();
        ctx.audio?.play('click');
        selectLoadout(btn.dataset.loadout);
      };
    }
    selectLoadout(ctx.state.loadout);
  }

  function showStart() {
    if (startOverlay) startOverlay.classList.remove('hidden');
  }

  function showWin(gain) {
    const total = (ctx.state && ctx.state.coins) || 0; // state.coins inclut déjà le gain (levels.win)
    coinFrom = total - gain;
    coinTarget = total;
    coinsArrived = 0;
    winElapsed = 0;
    resetStars();
    if (nextBtn) nextBtn.style.setProperty('--btn-pulse', '1');
    if (winCoins) winCoins.innerHTML = '+' + gain + ' <img class="rewardIcon" src="' + COIN_ICON_URL + '" alt="">';
    if (winOverlay) winOverlay.classList.remove('hidden');
    // Pièces volantes : onTick a été câblé au createFlyingCoins (voir handleCoinTick).
    if (ctx.flyingCoins && typeof ctx.flyingCoins.fly === 'function') {
      ctx.flyingCoins.fly(COIN_FLY_COUNT);
    }
  }

  function showLose() {
    if (loseOverlay) loseOverlay.classList.remove('hidden');
    loseBtnTimer = LOSE_BTN_DELAY;
    if (retryBtn) retryBtn.style.pointerEvents = 'none'; // inerte pendant LOSE_BTN_DELAY
  }

  function hideAll() {
    if (startOverlay) startOverlay.classList.add('hidden');
    if (winOverlay) winOverlay.classList.add('hidden');
    if (loseOverlay) loseOverlay.classList.add('hidden');
    if (nextBtn) nextBtn.style.setProperty('--btn-pulse', '1');
  }

  // Appelé à CHAQUE arrivée de pièce volante (onTick câblé par app.js sur createFlyingCoins).
  function handleCoinTick(/* i */) {
    if (ctx.audio) ctx.audio.play('coinTick');
    coinsArrived++;
    const frac = Math.min(1, coinsArrived / COIN_FLY_COUNT);
    const val = coinFrom + (coinTarget - coinFrom) * frac; // progressif jusqu'à state.coins
    const hud = ctx.sys && ctx.sys.hud;
    if (hud) {
      hud.setDisplayedCoins(val);
      hud.punchCoins();
    }
  }

  // Timings d'étoiles / pulse / delays — temps RÉEL (le DOM ne subit pas le slow-mo).
  function update(rawDt) {
    const winShown = winOverlay && !winOverlay.classList.contains('hidden');
    const loseShown = loseOverlay && !loseOverlay.classList.contains('hidden');

    if (winShown) {
      winElapsed += rawDt;

      // Bouton « suivant » : pulse scale 1 → 1.05, période PULSE_PERIOD.
      if (nextBtn) {
        const phase = (winElapsed / PULSE_PERIOD) * Math.PI * 2;
        const s = 1 + PULSE_MAX * (1 - Math.cos(phase)) * 0.5; // (1-cos)/2 ∈ [0,1]
        nextBtn.style.setProperty('--btn-pulse', s.toFixed(4));
      }

      // Étoiles séquentielles : révélation échelonnée + spring easeOutBack.
      for (const s of stars) {
        if (!s.triggered) {
          if (winElapsed < s.revealAt) continue;
          s.triggered = true;
          if (ctx.audio) ctx.audio.play('coinTick');
        }
        if (s.done) continue;
        s.animT += rawDt;
        const u = clamp01(s.animT / STAR_POP_DUR);
        const scale = easeOutBack(u);
        const op = clamp01(s.animT / (STAR_POP_DUR * 0.4));
        s.fill.style.transform = 'scale(' + scale.toFixed(4) + ')';
        s.fill.style.opacity = op.toFixed(3);
        if (u >= 1) {
          s.done = true;
          s.fill.style.transform = 'scale(1)';
          s.fill.style.opacity = '1';
        }
      }
    }

    if (loseShown && loseBtnTimer > 0) {
      loseBtnTimer -= rawDt;
      if (loseBtnTimer <= 0 && retryBtn) retryBtn.style.pointerEvents = 'auto';
    }
  }

  return { bind, showStart, showWin, showLose, hideAll, update, handleCoinTick };
}
