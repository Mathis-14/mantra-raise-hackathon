// MRUSH — sons "signature" jouons à partir d'ÉCHANTILLONS FOLEY (aucune synthèse).
// audio-manager injecte des outils { playUrl, foley } ; on rejoue de vrais impacts CC0/CC-BY
// (Kenney Impact + Little Robot coins). Le ding montant, l'arpège de victoire, etc. utilisent
// playbackRate sur un vrai échantillon (variation de hauteur = lecture d'échantillon, pas du synthé).
// Aucun effet de bord à l'import. Réf. CONTRACT §5.12 (implémentation foley, cf. game/assets/sounds/foley/CREDITS.md).

import { DING_WINDOW } from '../core/constants.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param {AudioContext} audioCtx
 * @param {AudioNode} outNode - noeud de sortie (master gain de l'audio-manager)
 * @param {{ playUrl?: (url:string, opts?:{volume?:number,rate?:number,delayMs?:number})=>void,
 *           foley?: (name:string)=>string|undefined }} [tools]
 */
export function createSynth(audioCtx, outNode, tools = {}) {
  const playUrl = tools.playUrl || (() => {});
  const foley = tools.foley || (() => undefined);
  const isGameplayActive = tools.isGameplayActive || (() => true);
  const play = (name, opts) => {
    const url = foley(name);
    if (url) playUrl(url, opts);
  };

  // état du ding montant (par combo) + throttles des boucles
  let dingStep = 0;
  let dingLast = -1e9;
  let hbLast = -1e9;
  let patterLast = -1e9;
  let patterIdx = 0;

  return {
    // Générique (ex-beep du prototype) → petit toc feutré.
    beep(freq, dur, type, vol) {
      play('click', { volume: vol != null ? Math.min(1, vol * 3) : 0.4 });
    },

    // Porte positive — « toc » cristallin GRAVE et rond, espacé : lecture à 0.55× (≈ −10 demi-tons),
    // passe-bas 1.4 kHz (plus aucun aigu perçant), montée plafonnée à +4. Throttle dédié : un ding
    // audible max toutes les DING_GAP secondes — les passages intermédiaires sont muets et ne font
    // pas grimper le combo.
    ding() {
      const DING_GAP = 0.25;
      const now = audioCtx.currentTime;
      if (now - dingLast < DING_GAP) return;
      if (now - dingLast < DING_WINDOW + DING_GAP) dingStep = Math.min(dingStep + 1, 4);
      else dingStep = 0;
      dingLast = now;
      play('gateGood', { rate: 0.55 * Math.pow(2, dingStep / 12), volume: 0.4, lowpassHz: 1400 });
    },

    // Franchissement de ligne — impact grave descendant (plaque lourde, rate < 1).
    alarm() {
      play('lineCross', { rate: 0.92, volume: 0.7 });
    },

    // Destruction de la base — fracas de verre + gravats de pierre en couche.
    explosion() {
      play('destroy', { volume: 0.85, rate: 0.92 });
      play('rubble', { volume: 0.7, rate: 0.95, delayMs: 40 });
    },

    // Victoire — arpège de vraie cloche, montant (fondamentale, +4, +7 demi-tons),
    // adouci (volume + passe-bas : même cloche que l'ancien ding, brillante par nature).
    jingleWin() {
      play('star', { rate: 1.0, volume: 0.6, bus: 'ui', lowpassHz: 4200 });
      play('star', { rate: 1.2599, volume: 0.6, delayMs: 140, bus: 'ui', lowpassHz: 4200 });
      play('star', { rate: 1.4983, volume: 0.65, delayMs: 300, bus: 'ui', lowpassHz: 4200 });
    },

    // Défaite — 2 coups mats descendants.
    jingleLose() {
      play('lineCross', { rate: 1.0, volume: 0.7, bus: 'ui' });
      play('lineCross', { rate: 0.8, volume: 0.7, delayMs: 160, bus: 'ui' });
    },

    // Battement de danger — vrai impact grave throttlé (~2 Hz), plus rapide/fort à l'approche.
    // 0 ⇒ silencieux (aucune boucle persistante à couper).
    setHeartbeat(level01) {
      if (!isGameplayActive()) return; // silencieux hors partie (écran de fin)
      const lvl = clamp01(level01);
      if (lvl <= 0.12) return;
      const now = audioCtx.currentTime;
      const interval = 0.42 - 0.16 * lvl;
      if (now - hbLast < interval) return;
      hbLast = now;
      play('danger', { volume: 0.16 + 0.36 * lvl, rate: 0.9 });
    },

    // Patter de pas de foule — vrais pas throttlés, plus denses avec la foule (level = min(1, n/100)).
    setPatterLevel(level01) {
      if (!isGameplayActive()) return; // les pas de foule s'arrêtent à la fin de partie
      const lvl = clamp01(level01);
      if (lvl <= 0.05) return;
      const now = audioCtx.currentTime;
      const interval = 0.5 - 0.34 * lvl;
      if (now - patterLast < interval) return;
      patterLast = now;
      patterIdx = (patterIdx + 1) % 3;
      play(`footstep${patterIdx}`, { volume: 0.05 + 0.15 * lvl, rate: 0.9 + Math.random() * 0.2 });
    },

    // La boucle de fond (« Winter Dust », bus 'music') est gérée par audio-manager
    // (démarrage à l'unlock, survit aux écrans de fin) → no-ops conservés pour l'API.
    startMusic() {},
    stopMusic() {},
  };
}
