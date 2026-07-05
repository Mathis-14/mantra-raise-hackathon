// MOB RUSH — gestionnaire audio (module-librairie).
// Charge/décode les OGG, joue les SFX (pools, alternance, rotation, throttle), pilote mute + synth.
// Aucun effet de bord à l'import (le préfetch se déclenche dans createAudio). Mémoire de session only.
// Réf. CONTRACT §5.13 + table §8.2.

import { createSynth } from './synth.js';

// Table logique → fichiers FOLEY (sons organiques, aucun bip digital / aucun synthé).
// Kenney Impact Sounds (CC0) + Little Robot coins (CC-BY) — voir game/assets/sounds/foley/CREDITS.md.
// Les noms `gateGood/destroy/lineCross/star/danger/footstep*` sont rejoués par synth.js (échantillons).
export const SFX = Object.freeze({
  // joués via play(...)
  shoot: Object.freeze(['/sounds/foley/shoot.ogg']),
  gateBad: Object.freeze(['/sounds/foley/gate-bad.ogg']),
  unitHit: Object.freeze(['/sounds/foley/unit-hit.ogg']),
  baseHit: Object.freeze(['/sounds/foley/base-hit.ogg']),
  crack: Object.freeze([
    '/sounds/foley/crack-1.ogg', // palier 66 %
    '/sounds/foley/crack-2.ogg', // palier 33 %
  ]),
  rubble: Object.freeze(['/sounds/foley/rubble.ogg']),
  coinTick: Object.freeze(['/sounds/foley/coin.wav']), // vraie pièce
  click: Object.freeze(['/sounds/foley/click.ogg']),
  clickUp: Object.freeze(['/sounds/foley/click.ogg']),
  // rejoués par synth.js (via playUrl + foley)
  gateGood: Object.freeze(['/sounds/foley/gate-good.ogg']), // cloche (ding montant)
  destroy: Object.freeze(['/sounds/foley/destroy.ogg']),
  lineCross: Object.freeze(['/sounds/foley/line-cross.ogg']),
  star: Object.freeze(['/sounds/foley/star.ogg']),
  danger: Object.freeze(['/sounds/foley/danger-beat.ogg']),
  footstep0: Object.freeze(['/sounds/foley/footstep-0.ogg']),
  footstep1: Object.freeze(['/sounds/foley/footstep-1.ogg']),
  footstep2: Object.freeze(['/sounds/foley/footstep-2.ogg']),
  coinsJackpot: Object.freeze(['/sounds/foley/coins-jackpot.wav']),
  gem: Object.freeze(['/sounds/foley/gem.wav']),
});

const UNIT_HIT_MAX = 10; // ≤ 10 déclenchements /s
const UNIT_HIT_WINDOW = 1; // s (fenêtre glissante)
// Noms routés sur le bus UI (récompense / clics) : ils SURVIVENT à la coupure de fin de partie.
// Tout le reste (tir, portes, impacts, ding, explosion, alarme, patter, heartbeat) → bus gameplay.
const UI_NAMES = new Set(['click', 'clickUp', 'coinTick']);

// Rendu agréable : volumes par défaut par nom (< 1 pour laisser de la marge au mix),
// et anti-empilement par échantillon (écart minimal + polyphonie max simultanée).
const SFX_LEVEL = Object.freeze({
  shoot: 0.45, gateBad: 0.6, unitHit: 0.5, baseHit: 0.65, crack: 0.8,
  rubble: 0.8, coinTick: 0.5, click: 0.5, clickUp: 0.5,
});
const DEFAULT_MIN_GAP = 0.045; // s entre 2 lectures du MÊME échantillon
const DEFAULT_MAX_POLY = 4;    // lectures simultanées max du même échantillon
const STACK_RULES = Object.freeze({
  '/sounds/foley/gate-good.ogg': Object.freeze({ gap: 0.2, poly: 2 }), // espacement du ding (throttle principal dans synth.ding)
  '/sounds/foley/coin.wav': Object.freeze({ gap: 0.05, poly: 3 }),
  '/sounds/foley/shoot.ogg': Object.freeze({ gap: 0.08, poly: 3 }),
});

export function createAudio() {
  let audioCtx = null;
  let masterGain = null;
  let synthInstance = null;
  let muted = false;
  let decodeStarted = false;

  const decoded = new Map(); // url -> AudioBuffer
  const rawFetch = new Map(); // url -> Promise<ArrayBuffer|null>
  // 3 bus sous masterGain : gameplay (coupé en fin de partie), ui (récompense/jingles/clics), music (background).
  let gameplayGain = null;
  let uiGain = null;
  let musicGain = null;
  let gameplayActive = true;
  const rotIdx = { shoot: 0, crack: 0, coinTick: 0 }; // index d'alternance/rotation

  // throttle 'unitHit' : horodatages (en secondes cumulées via update) dans la fenêtre glissante
  let clock = 0;
  const unitHitTimes = [];

  // Préfetch immédiat de tous les fichiers uniques (fetch ArrayBuffer ; decode différé à unlock).
  const allUrls = new Set();
  for (const key in SFX) {
    for (const url of SFX[key]) allUrls.add(url);
  }
  for (const url of allUrls) {
    rawFetch.set(
      url,
      fetch(url)
        .then((r) => r.arrayBuffer())
        .catch((e) => {
          console.warn('[audio] préfetch échoué', url, e);
          return null;
        }),
    );
  }

  function busNode(bus) {
    if (bus === 'ui') return uiGain;
    if (bus === 'music') return musicGain;
    return gameplayGain;
  }

  // Anti-empilement : dernier départ + nombre de lectures actives, par échantillon.
  const lastStart = new Map(); // url -> audioCtx.currentTime du dernier start
  const activeCount = new Map(); // url -> lectures en cours

  // Joue un buffer décodé (source jetable). `bus` ∈ 'gameplay' | 'ui' | 'music'.
  // `lowpassHz` (optionnel) : passe-bas doux pour arrondir les aigus d'un échantillon brillant.
  function playBuffer(url, bus, volume, rate, lowpassHz) {
    const buf = decoded.get(url);
    if (!buf) return; // pas encore décodé → silencieux
    const rules = STACK_RULES[url];
    const gap = rules ? rules.gap : DEFAULT_MIN_GAP;
    const poly = rules ? rules.poly : DEFAULT_MAX_POLY;
    const now = audioCtx.currentTime;
    if (now - (lastStart.get(url) || -1e9) < gap) return;      // trop rapproché → drop
    if ((activeCount.get(url) || 0) >= poly) return;           // trop de voix → drop
    lastStart.set(url, now);
    activeCount.set(url, (activeCount.get(url) || 0) + 1);
    const node = busNode(bus) || masterGain;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = audioCtx.createGain();
    g.gain.value = volume;
    if (lowpassHz) {
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpassHz;
      lp.Q.value = 0.5; // pente douce, pas de résonance
      src.connect(lp).connect(g).connect(node);
    } else {
      src.connect(g).connect(node);
    }
    src.onended = () => {
      activeCount.set(url, Math.max(0, (activeCount.get(url) || 1) - 1));
      try {
        src.disconnect();
        g.disconnect();
      } catch (_) {
        /* noop */
      }
    };
    src.start();
  }

  // Résout un nom logique → 1re URL (pour synth.js). Joue une URL décodée avec volume/rate/délai.
  function foley(name) {
    const list = SFX[name];
    return list ? list[0] : undefined;
  }
  function playUrl(url, o = {}) {
    const vol = o.volume != null ? o.volume : 1;
    const rate = o.rate != null ? o.rate : 1;
    const delayMs = o.delayMs || 0;
    const bus = o.bus || 'gameplay'; // synth : jingles → 'ui', reste (ding/alarme/explosion/patter/heartbeat) → 'gameplay'
    const lowpassHz = o.lowpassHz;
    if (delayMs > 0) setTimeout(() => playBuffer(url, bus, vol, rate, lowpassHz), delayMs);
    else playBuffer(url, bus, vol, rate, lowpassHz);
  }

  const api = {
    // Crée AudioContext + synth au 1er geste ; idempotent ; lance le décodage des OGG préfetchés.
    unlock() {
      if (!audioCtx) {
        try {
          const Ctor = window.AudioContext || window.webkitAudioContext;
          audioCtx = new Ctor();
        } catch (e) {
          console.warn('[audio] AudioContext indisponible', e);
          return;
        }
        masterGain = audioCtx.createGain();
        masterGain.gain.value = muted ? 0 : 1;
        // Compresseur doux en bout de chaîne : lisse les pics quand plusieurs sons tombent
        // ensemble (rendu agréable, zéro clipping) sans pomper.
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.22;
        masterGain.connect(comp).connect(audioCtx.destination);
        // bus séparés → on peut couper le gameplay en fin de partie tout en gardant ui/music.
        gameplayGain = audioCtx.createGain();
        gameplayGain.gain.value = gameplayActive ? 1 : 0;
        uiGain = audioCtx.createGain();
        musicGain = audioCtx.createGain(); // bus réservé (aucune piste branchée)
        for (const b of [gameplayGain, uiGain, musicGain]) b.connect(masterGain);
        synthInstance = createSynth(audioCtx, masterGain, {
          playUrl,
          foley,
          isGameplayActive: () => gameplayActive,
        });

        if (!decodeStarted) {
          decodeStarted = true;
          for (const [url, p] of rawFetch) {
            p.then((ab) => (ab ? audioCtx.decodeAudioData(ab.slice(0)) : null))
              .then((audioBuf) => {
                if (audioBuf) decoded.set(url, audioBuf);
              })
              .catch((e) => console.warn('[audio] décodage échoué', url, e));
          }
        }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    },

    get synth() {
      return synthInstance;
    },

    // No-op silencieux avant unlock ou si muted.
    play(name, opts = {}) {
      if (!audioCtx || muted) return;
      const list = SFX[name];
      if (!list) return;

      const rateJitter =
        opts.rateJitter != null ? opts.rateJitter : name === 'shoot' ? 0.1 : 0;
      const baseLevel = SFX_LEVEL[name] != null ? SFX_LEVEL[name] : 1;
      const volume = (opts.volume != null ? opts.volume : 1) * baseLevel;
      const jitter = () => 1 + (Math.random() * 2 - 1) * rateJitter;
      const bus = UI_NAMES.has(name) ? 'ui' : 'gameplay';

      if (name === 'unitHit') {
        // throttle ≤ 10/s (fenêtre glissante ; purge assurée par update)
        while (unitHitTimes.length && unitHitTimes[0] <= clock - UNIT_HIT_WINDOW) {
          unitHitTimes.shift();
        }
        if (unitHitTimes.length >= UNIT_HIT_MAX) return;
        unitHitTimes.push(clock);
        playBuffer(list[0], bus, volume, jitter());
        return;
      }
      if (name === 'shoot' || name === 'crack' || name === 'coinTick') {
        // alternance / rotation cyclique
        const i = rotIdx[name];
        rotIdx[name] = (i + 1) % list.length;
        playBuffer(list[i], bus, volume, jitter());
        return;
      }
      if (name === 'baseHit') {
        // bong principal + couche scratch atténuée
        playBuffer(list[0], bus, volume, jitter());
        if (list[1]) playBuffer(list[1], bus, volume * 0.5, jitter());
        return;
      }
      // par défaut : fichier unique
      playBuffer(list[0], bus, volume, jitter());
    },

    // Fin de partie : couper les sons de gameplay, garder ui (récompense/jingles) + music (background).
    // startLevel() rappelle setGameplayActive(true).
    setGameplayActive(active) {
      gameplayActive = !!active;
      if (gameplayGain) {
        gameplayGain.gain.setTargetAtTime(gameplayActive ? 1 : 0, audioCtx.currentTime, 0.02);
      }
    },

    setMuted(b) {
      muted = !!b;
      if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 1, audioCtx.currentTime, 0.01);
    },

    toggleMute() {
      api.setMuted(!muted);
      return muted;
    },

    // Fait avancer l'horloge de session et purge la fenêtre glissante du throttle 'unitHit'.
    update(rawDt) {
      clock += Math.max(0, rawDt || 0);
      while (unitHitTimes.length && unitHitTimes[0] <= clock - UNIT_HIT_WINDOW) {
        unitHitTimes.shift();
      }
    },
  };

  return api;
}
