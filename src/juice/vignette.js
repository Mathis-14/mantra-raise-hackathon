// MOB RUSH — vignette de danger (juice) : CONTRACT §5.11 / spec §5.6.
// Pilote UNIQUEMENT le DOM #dangerVignette (opacité). Aucune autre dépendance.
// Temps RÉEL : le DOM ne subit pas le slow-mo. Aucun effet de bord à l'import.

// Coefficients de pulsation issus de la formule normative CONTRACT §5.11 :
//   opacité = level * (0.55 + 0.25 * sin(realT * 6))  (non présents dans constants.js gameplay).
const PULSE_BASE = 0.55;
const PULSE_AMP = 0.25;
const PULSE_FREQ = 6;

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * @param {HTMLElement|null} [el] — par défaut #dangerVignette
 * @returns {{ setDanger(level01:number):void, flash(ms?:number):void, update(rawDt:number, realT:number):void }}
 */
export function createVignette(el = document.getElementById('dangerVignette')) {
  let danger = 0;      // niveau de danger courant [0,1]
  let flashT = 0;      // s restantes du flash
  let flashDur = 0.08; // s — durée du flash courant (défaut 80 ms)

  function setDanger(level01) {
    danger = clamp01(level01);
  }

  function flash(ms = 80) {
    flashDur = ms / 1000;
    flashT = flashDur;
  }

  function update(rawDt, realT) {
    if (!el) return;

    // Pulsation de danger (0 ⇒ invisible), en temps réel.
    const dangerOpacity = danger > 0
      ? danger * (PULSE_BASE + PULSE_AMP * Math.sin(realT * PULSE_FREQ))
      : 0;

    // Flash rouge plein écran : ~1 puis redescend sur la durée.
    let flashOpacity = 0;
    if (flashT > 0) {
      flashT -= rawDt;
      flashOpacity = clamp01(flashT / flashDur);
    }

    el.style.opacity = String(clamp01(Math.max(dangerOpacity, flashOpacity)));
  }

  return { setDanger, flash, update };
}
