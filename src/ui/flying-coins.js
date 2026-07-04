// MOB RUSH — pièces volantes DOM (CONTRACT §5.14).
// Module-LIBRAIRIE UI : auto-contenu, aucun effet de bord à l'import.
// N'importe NI GameState, NI ctx, NI un autre système. Ne touche à aucun élément
// du HUD existant : il ne LIT que coinPillEl (getBoundingClientRect) et n'anime
// QUE des sprites <div>🪙 qu'il crée lui-même.

// Constantes de présentation locales à ce module (absentes de core/constants.js,
// car ce sont des timings d'animation DOM propres à la spec §5.14, pas des
// valeurs gameplay). Elles ne sont donc pas des « littéraux magiques » de jeu.
const STAGGER_S      = 0.04;   // ~40 ms entre deux départs
const DURATION_MIN_S = 0.6;    // durée de vol mini par pièce
const DURATION_MAX_S = 1.0;    // durée de vol maxi par pièce
const LATERAL_MIN_PX = 60;     // décalage latéral mini du point de contrôle Bézier
const LATERAL_MAX_PX = 180;    // décalage latéral maxi du point de contrôle Bézier
const SPRITE_PX      = 28;     // taille (font-size) du sprite 🪙
const Z_INDEX        = 9999;   // au-dessus des overlays (z-index 20) et du flash niveau (15)
const POP_IN_FRAC    = 0.15;   // fraction initiale du vol pour le pop-in d'échelle

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeOutCubic(t) { const it = 1 - t; return 1 - it * it * it; }

/** Pièces volantes DOM : n sprites 🪙 en courbe de Bézier quadratique vers le compteur. */
export function createFlyingCoins({ coinPillEl, onTick }) {
  // Chaque pièce en vol :
  // { el, delay, elapsed, dur, started, index, sx, sy, cx, cy, ex, ey, fromXY }
  const coins = [];
  let launchIndex = 0;   // ordinal monotone d'arrivée (toutes les vagues confondues)

  function createSprite() {
    const el = document.createElement('div');
    el.textContent = '🪙'; // 🪙
    el.style.cssText =
      'position:fixed;left:0;top:0;' +
      'pointer-events:none;user-select:none;' +
      'z-index:' + Z_INDEX + ';' +
      'font-size:' + SPRITE_PX + 'px;line-height:1;' +
      'will-change:transform;visibility:hidden;' +
      'transform:translate(-9999px,-9999px);';
    document.body.appendChild(el);
    return el;
  }

  // Fige la géométrie de la trajectoire au moment où la pièce démarre réellement
  // (après son délai échelonné) : lecture du centre du compteur + point de contrôle.
  function startCoin(c, initialElapsed) {
    let ex, ey;
    if (coinPillEl && typeof coinPillEl.getBoundingClientRect === 'function') {
      const r = coinPillEl.getBoundingClientRect();
      ex = r.left + r.width / 2;
      ey = r.top + r.height / 2;
    } else {
      // repli défensif : coin haut de l'écran (le contrat fournit toujours coinPillEl)
      ex = window.innerWidth / 2;
      ey = 24;
    }
    const origin = c.fromXY || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    c.sx = origin.x; c.sy = origin.y;
    c.ex = ex;       c.ey = ey;

    // Point de contrôle : milieu du segment + décalage perpendiculaire aléatoire (signe + amplitude).
    const dx = ex - c.sx, dy = ey - c.sy;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len, perpY = dx / len;
    const lateral = (Math.random() * 2 - 1) *
      (LATERAL_MIN_PX + Math.random() * (LATERAL_MAX_PX - LATERAL_MIN_PX));
    c.cx = (c.sx + ex) / 2 + perpX * lateral;
    c.cy = (c.sy + ey) / 2 + perpY * lateral;

    c.elapsed = initialElapsed;
    c.started = true;
    c.el.style.visibility = 'visible';
    place(c, 0);
  }

  // Positionne le sprite à l'avancement u∈[0,1] (Bézier quadratique + easing d'arrivée).
  function place(c, u) {
    const e = easeOutCubic(clamp01(u));
    const ie = 1 - e;
    const x = ie * ie * c.sx + 2 * ie * e * c.cx + e * e * c.ex;
    const y = ie * ie * c.sy + 2 * ie * e * c.cy + e * e * c.ey;
    const scale = u < POP_IN_FRAC ? 0.6 + (u / POP_IN_FRAC) * 0.4 : 1;
    c.el.style.transform =
      'translate(' + (x - SPRITE_PX / 2) + 'px,' + (y - SPRITE_PX / 2) + 'px) scale(' + scale + ')';
  }

  return {
    fly(count, fromXY = null) {
      const n = Math.max(0, count | 0);
      for (let i = 0; i < n; i++) {
        coins.push({
          el: createSprite(),
          delay: i * STAGGER_S,
          elapsed: 0,
          dur: DURATION_MIN_S + Math.random() * (DURATION_MAX_S - DURATION_MIN_S),
          started: false,
          index: launchIndex++,
          fromXY,
          sx: 0, sy: 0, cx: 0, cy: 0, ex: 0, ey: 0,
        });
      }
    },

    update(rawDt) {
      // Itération descendante : on retire (splice) les pièces arrivées en place.
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (!c.started) {
          c.delay -= rawDt;
          if (c.delay > 0) continue;
          // le dépassement du délai est reversé dans le temps de vol (pas de à-coup)
          startCoin(c, -c.delay);
        } else {
          c.elapsed += rawDt;
        }
        const u = c.elapsed / c.dur;
        if (u >= 1) {
          place(c, 1);
          c.el.remove();
          coins.splice(i, 1);
          if (typeof onTick === 'function') onTick(c.index);
          continue;
        }
        place(c, u);
      }
    },

    get active() { return coins.length > 0; },
  };
}
