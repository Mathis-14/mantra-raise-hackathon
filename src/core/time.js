// MOB RUSH — horloge de jeu. Module-librairie pur (CONTRACT §5.2).
// dt clampé × timescale global (hit-stop / slow-mo). Aucun effet de bord à l'import.
import { DT_MAX } from './constants.js';

/**
 * Horloge de jeu : dt clampé + timescale global (hit-stop / slow-mo).
 *
 * Sémantique normée :
 *   cible = min(1, min des scales des pulses actifs)  (expiration en TEMPS RÉEL)
 *   descente instantanée (snap) quand la cible baisse
 *   remontée par timescale += (1 - timescale) * (1 - exp(-10 * rawDt))
 */
export function createTime() {
  let _rawDt = 0;      // delta clampé, non scalé (dernier frame)
  let _dt = 0;         // delta clampé × timescale (dt gameplay)
  let _t = 0;          // temps de jeu cumulé en dt scalé (phases de bobbing)
  let _realT = 0;      // temps réel cumulé (bruit du shake)
  let _timescale = 1;  // valeur effective courante
  const _pulses = [];  // { scale: number, remaining: number(secondes réelles) }

  return {
    /** Appelé 1×/frame par app AVANT les systèmes : clampe, vieillit les pulses, calcule le timescale, accumule t/realT. */
    update(rawDtSeconds) {
      // 1) clamp du delta (parité proto : Math.min(delta, DT_MAX))
      const clamped = Math.min(rawDtSeconds, DT_MAX);
      _rawDt = clamped;
      _realT += clamped;

      // 2) vieillissement des pulses en temps réel (delta clampé, non scalé)
      for (let i = _pulses.length - 1; i >= 0; i--) {
        _pulses[i].remaining -= clamped;
        if (_pulses[i].remaining <= 0) _pulses.splice(i, 1);
      }

      // 3) cible = min(1, min des scales des pulses actifs)
      let target = 1;
      for (let i = 0; i < _pulses.length; i++) {
        if (_pulses[i].scale < target) target = _pulses[i].scale;
      }

      // 4) timescale : snap instantané en descente, approche exponentielle vers la cible en remontée
      if (target < _timescale) {
        _timescale = target;
      } else {
        const approached = _timescale + (1 - _timescale) * (1 - Math.exp(-10 * clamped));
        _timescale = Math.min(target, approached);
      }

      // 5) dt scalé + accumulation du temps de jeu
      _dt = clamped * _timescale;
      _t += _dt;
    },

    get dt() { return _dt; },
    get rawDt() { return _rawDt; },
    get t() { return _t; },
    get realT() { return _realT; },
    get timescale() { return _timescale; },

    /** Enclenche un ralenti : scale ∈ (0,1], durée en TEMPS RÉEL (secondes). */
    pulse(scale, durationSec) {
      _pulses.push({ scale: Math.min(1, scale), remaining: durationSec });
    },

    /** Purge les pulses, timescale → 1. t et realT sont CONSERVÉS (continuité des phases). */
    reset() {
      _pulses.length = 0;
      _timescale = 1;
      _dt = _rawDt * _timescale;
    },
  };
}
