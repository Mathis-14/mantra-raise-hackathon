// MOB RUSH — synthèse WebAudio pure (module-librairie).
// Reçoit un AudioContext + un noeud de sortie (créés par audio-manager). Aucun effet de bord à l'import.
// Tout se branche sur outNode. La musique passe par un sous-gain interne à -12 dB (lui-même → outNode).
// Réf. CONTRACT §5.12 + parité prototype (beep, jingleWin, jingleLose).

import { DING_WINDOW } from '../core/constants.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Fréquences d'une gamme pentatonique majeure de C (marimba de la boucle musicale).
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const MUSIC_BPM = 110;
const MUSIC_STEP = 60 / MUSIC_BPM / 2; // croches à ~110 BPM
const MUSIC_DB = Math.pow(10, -12 / 20); // gain linéaire pour -12 dB sous les SFX

/**
 * Synthèse WebAudio pure.
 * @param {AudioContext} audioCtx
 * @param {AudioNode} outNode - noeud de sortie (master gain de l'audio-manager)
 */
export function createSynth(audioCtx, outNode) {
  // --- état interne ---
  let dingStep = 0;      // demi-tons courants du ding (0..12)
  let dingLast = -1e9;   // audioCtx.currentTime du dernier ding

  let noiseBuf = null;   // buffer de bruit blanc 1 s (partagé explosion/patter)
  let hb = null;         // noeuds du battement cardiaque (lazy)
  let patter = null;     // noeuds du patter de foule (lazy)

  let musicGain = null;  // sous-gain -12 dB de la musique
  let musicTimer = null; // setTimeout du séquenceur
  let musicPlaying = false;
  let musicNext = 0;     // audio-time de la prochaine note
  let melodyIdx = 3;     // index courant dans PENTA (marche aléatoire)

  function getNoise() {
    if (!noiseBuf) {
      const len = Math.floor(audioCtx.sampleRate * 1);
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Note générique programmée à `when` (base parité du beep du prototype :
  // osc + gain expo-ramp vers 0.001 sur `dur`).
  function tone(freq, dur, type, vol, when) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const v = Math.max(0.0001, vol);
    g.gain.setValueAtTime(v, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(outNode);
    o.start(when);
    o.stop(when + dur);
  }

  // --- musique : note type marimba (sine + octave, decay court) ---
  function marimba(freq, when) {
    const o = audioCtx.createOscillator();
    const o2 = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const g2 = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.5, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.4);
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.linearRampToValueAtTime(0.16, when + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
    o.connect(g).connect(musicGain);
    o2.connect(g2).connect(musicGain);
    o.start(when);
    o.stop(when + 0.45);
    o2.start(when);
    o2.stop(when + 0.25);
  }

  function musicScheduler() {
    const ahead = 0.12;
    while (musicNext < audioCtx.currentTime + ahead) {
      // ~18 % de silences pour aérer le motif
      if (Math.random() > 0.18) {
        melodyIdx += Math.floor(Math.random() * 3) - 1; // -1, 0 ou +1
        if (melodyIdx < 0) melodyIdx = 1;
        if (melodyIdx >= PENTA.length) melodyIdx = PENTA.length - 2;
        marimba(PENTA[melodyIdx], musicNext);
      }
      musicNext += MUSIC_STEP;
    }
    musicTimer = setTimeout(musicScheduler, 25);
  }

  return {
    // Générique parité proto.
    beep(freq, dur, type, vol) {
      tone(freq, dur, type, vol, audioCtx.currentTime);
    },

    // Porte positive — synthétisé (jamais un fichier).
    // Base 660 Hz ; +1 demi-ton si rappelé < DING_WINDOW, sinon reset ; plafond +12 demi-tons.
    // Timbre cristallin : triangle fondamental + sine harmonique 2×, decay court.
    ding() {
      const now = audioCtx.currentTime;
      if (now - dingLast < DING_WINDOW) dingStep = Math.min(dingStep + 1, 12);
      else dingStep = 0;
      dingLast = now;
      const freq = 660 * Math.pow(2, dingStep / 12);

      const o1 = audioCtx.createOscillator();
      const g1 = audioCtx.createGain();
      o1.type = 'triangle';
      o1.frequency.value = freq;
      g1.gain.setValueAtTime(0.0001, now);
      g1.gain.linearRampToValueAtTime(0.22, now + 0.005);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o1.connect(g1).connect(outNode);
      o1.start(now);
      o1.stop(now + 0.2);

      const o2 = audioCtx.createOscillator();
      const g2 = audioCtx.createGain();
      o2.type = 'sine';
      o2.frequency.value = freq * 2;
      g2.gain.setValueAtTime(0.08, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      o2.connect(g2).connect(outNode);
      o2.start(now);
      o2.stop(now + 0.14);
    },

    // Franchissement de ligne — sweep DESCENDANT 400 → 150 Hz sur 0.25 s.
    alarm() {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(400, now);
      o.frequency.exponentialRampToValueAtTime(150, now + 0.25);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      o.connect(g).connect(outNode);
      o.start(now);
      o.stop(now + 0.26);
    },

    // Destruction de la base — burst de bruit filtré passe-bas + sub sinus grave.
    explosion() {
      const now = audioCtx.currentTime;
      const dur = 0.6;

      const src = audioCtx.createBufferSource();
      src.buffer = getNoise();
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, now);
      lp.frequency.exponentialRampToValueAtTime(120, now + dur);
      const ng = audioCtx.createGain();
      ng.gain.setValueAtTime(0.9, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(lp).connect(ng).connect(outNode);
      src.start(now);
      src.stop(now + dur);

      const sub = audioCtx.createOscillator();
      const sg = audioCtx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, now);
      sub.frequency.exponentialRampToValueAtTime(38, now + 0.5);
      sg.gain.setValueAtTime(0.9, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      sub.connect(sg).connect(outNode);
      sub.start(now);
      sub.stop(now + 0.6);
    },

    // Victoire — parité proto : 660/.12, 880/.15 à +130 ms, 1100/.25 à +280 ms (triangle, vol .2).
    jingleWin() {
      const t0 = audioCtx.currentTime;
      tone(660, 0.12, 'triangle', 0.2, t0);
      tone(880, 0.15, 'triangle', 0.2, t0 + 0.13);
      tone(1100, 0.25, 'triangle', 0.2, t0 + 0.28);
    },

    // Défaite — 2 notes descendantes sawtooth (~200 Hz, .4 s).
    jingleLose() {
      const t0 = audioCtx.currentTime;
      tone(220, 0.4, 'sawtooth', 0.15, t0);
      tone(165, 0.4, 'sawtooth', 0.15, t0 + 0.16);
    },

    // Battement grave ~2 Hz, gain ∝ level (0 ⇒ coupé). Créé paresseusement.
    setHeartbeat(level01) {
      const lvl = clamp01(level01);
      if (!hb) {
        if (lvl <= 0) return; // rien à couper
        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 52;
        amp.gain.value = 0;
        lfo.type = 'sine';
        lfo.frequency.value = 2; // ~2 battements/s
        lfoGain.gain.value = 0;
        lfo.connect(lfoGain).connect(amp.gain); // module la porte d'amplitude
        osc.connect(amp).connect(outNode);
        osc.start();
        lfo.start();
        hb = { osc, amp, lfo, lfoGain };
      }
      // pic = 2A = lvl*0.4 ; creux = 0 (baseline A + LFO d'amplitude A autour de A)
      const A = lvl * 0.2;
      hb.amp.gain.setTargetAtTime(A, audioCtx.currentTime, 0.05);
      hb.lfoGain.gain.setTargetAtTime(A, audioCtx.currentTime, 0.05);
    },

    // Patter de pas de foule — boucle de bruit filtré, gain ∝ level (0 ⇒ silencieux). Lazy.
    setPatterLevel(level01) {
      const lvl = clamp01(level01);
      if (!patter) {
        if (lvl <= 0) return;
        const src = audioCtx.createBufferSource();
        src.buffer = getNoise();
        src.loop = true;
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 0.7;
        const g = audioCtx.createGain();
        g.gain.value = 0;
        // léger trémolo pour évoquer le martèlement des pas
        const trem = audioCtx.createOscillator();
        const tremGain = audioCtx.createGain();
        trem.type = 'sine';
        trem.frequency.value = 11;
        tremGain.gain.value = 0;
        trem.connect(tremGain).connect(g.gain);
        src.connect(bp).connect(g).connect(outNode);
        src.start();
        trem.start();
        patter = { src, g, bp, trem, tremGain };
      }
      // gain proportionnel au niveau (mise à l'échelle discrète pour rester en dessous des SFX)
      const base = lvl * 0.12;
      patter.g.gain.setTargetAtTime(base, audioCtx.currentTime, 0.08);
      patter.tremGain.gain.setTargetAtTime(base * 0.6, audioCtx.currentTime, 0.08);
    },

    // Séquenceur pentatonique ~110 BPM (marimba), sur gain séparé -12 dB → outNode.
    startMusic() {
      if (musicPlaying) return;
      if (!musicGain) {
        musicGain = audioCtx.createGain();
        musicGain.gain.value = MUSIC_DB;
        musicGain.connect(outNode);
      }
      musicPlaying = true;
      musicNext = audioCtx.currentTime + 0.06;
      musicScheduler();
    },

    stopMusic() {
      musicPlaying = false;
      if (musicTimer) {
        clearTimeout(musicTimer);
        musicTimer = null;
      }
    },
  };
}
