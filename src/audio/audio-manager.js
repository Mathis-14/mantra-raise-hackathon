// MOB RUSH — gestionnaire audio (module-librairie).
// Charge/décode les OGG, joue les SFX (pools, alternance, rotation, throttle), pilote mute + synth.
// Aucun effet de bord à l'import (le préfetch se déclenche dans createAudio). Mémoire de session only.
// Réf. CONTRACT §5.13 + table §8.2.

import { createSynth } from './synth.js';

// Table logique → fichiers, mapping EXACT de CONTRACT §8.2 (URLs servies à la racine, déjà encodées).
export const SFX = Object.freeze({
  shoot: Object.freeze([
    '/sounds/interface-sounds/Audio/pluck_001.ogg',
    '/sounds/interface-sounds/Audio/pluck_002.ogg',
  ]),
  gateBad: Object.freeze(['/sounds/interface-sounds/Audio/error_004.ogg']),
  unitHit: Object.freeze(['/sounds/interface-sounds/Audio/drop_002.ogg']),
  baseHit: Object.freeze([
    '/sounds/interface-sounds/Audio/bong_001.ogg',
    '/sounds/interface-sounds/Audio/scratch_001.ogg', // couche légère
  ]),
  crack: Object.freeze([
    '/sounds/interface-sounds/Audio/scratch_002.ogg', // palier 66 %
    '/sounds/interface-sounds/Audio/scratch_003.ogg', // palier 33 %
  ]),
  rubble: Object.freeze(['/sounds/interface-sounds/Audio/scratch_004.ogg']),
  coinTick: Object.freeze([
    '/sounds/interface-sounds/Audio/tick_001.ogg',
    '/sounds/interface-sounds/Audio/tick_002.ogg',
    '/sounds/interface-sounds/Audio/tick_004.ogg',
  ]),
  click: Object.freeze(['/ui/ui-pack/Sounds/click-a.ogg']),
  clickUp: Object.freeze(['/ui/ui-pack/Sounds/click-b.ogg']),
});

const UNIT_HIT_MAX = 10; // ≤ 10 déclenchements /s
const UNIT_HIT_WINDOW = 1; // s (fenêtre glissante)

export function createAudio() {
  let audioCtx = null;
  let masterGain = null;
  let synthInstance = null;
  let muted = false;
  let decodeStarted = false;

  const decoded = new Map(); // url -> AudioBuffer
  const rawFetch = new Map(); // url -> Promise<ArrayBuffer|null>
  const nameGains = new Map(); // name -> GainNode (bus par nom logique)
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

  function ensureNameGain(name) {
    let g = nameGains.get(name);
    if (!g) {
      g = audioCtx.createGain();
      g.gain.value = 1;
      g.connect(masterGain);
      nameGains.set(name, g);
    }
    return g;
  }

  // Joue un buffer décodé (source jetable — pool ≥ 4 assuré par la concurrence illimitée des one-shots).
  function playBuffer(url, busName, volume, rate) {
    const buf = decoded.get(url);
    if (!buf) return; // pas encore décodé → silencieux
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = audioCtx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ensureNameGain(busName));
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch (_) {
        /* noop */
      }
    };
    src.start();
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
        masterGain.connect(audioCtx.destination);
        synthInstance = createSynth(audioCtx, masterGain);

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
      const volume = opts.volume != null ? opts.volume : 1;
      const jitter = () => 1 + (Math.random() * 2 - 1) * rateJitter;

      if (name === 'unitHit') {
        // throttle ≤ 10/s (fenêtre glissante ; purge assurée par update)
        while (unitHitTimes.length && unitHitTimes[0] <= clock - UNIT_HIT_WINDOW) {
          unitHitTimes.shift();
        }
        if (unitHitTimes.length >= UNIT_HIT_MAX) return;
        unitHitTimes.push(clock);
        playBuffer(list[0], name, volume, jitter());
        return;
      }
      if (name === 'shoot' || name === 'crack' || name === 'coinTick') {
        // alternance / rotation cyclique
        const i = rotIdx[name];
        rotIdx[name] = (i + 1) % list.length;
        playBuffer(list[i], name, volume, jitter());
        return;
      }
      if (name === 'baseHit') {
        // bong principal + couche scratch atténuée
        playBuffer(list[0], name, volume, jitter());
        if (list[1]) playBuffer(list[1], name, volume * 0.5, jitter());
        return;
      }
      // par défaut : fichier unique
      playBuffer(list[0], name, volume, jitter());
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
