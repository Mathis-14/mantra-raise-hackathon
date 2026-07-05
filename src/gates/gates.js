// MOB RUSH — portes (module-système, CONTRACT §6.4).
// Factory createGates(ctx). N'importe AUCUN autre système : toute interaction inter-système passe
// par ctx.sys.* dans les méthodes (jamais dans le corps de la factory).
// Parité gameplay : buildGates / makeGate / gateTexture / franchissement du prototype.
import * as THREE from 'three';
import {
  GATE_ROWS_Z,
  GATE_OFFSET_X,
  GATE_WIDTH,
  GATE_X_MIN_LEVEL,
  GATE_X_PROBA,
  GATE_CHAIN_MIN_LEVEL,
  GATE_ADVANCED_MIN_LEVEL,
  GATE_CHAIN_PROBA,
  GATE_CLONE_JITTER_X,
  GATE_CLONE_BACK_Z,
  GATE_FLASH_DUR,
  GATE_PUNCH_DUR,
  COLORS,
} from '../core/constants.js';
import { easeOutBack } from '../juice/springs.js';

// --- Dimensions visuelles des portes (parité proto ; non gameplay → pas dans constants.js) ---
const PANEL_HEIGHT = 2.4;    // PlaneGeometry(GATE_WIDTH, 2.4) (CONTRACT §3)
const PANEL_Y = 1.3;         // centre du panneau
const POST_RADIUS = 0.14;    // CylinderGeometry(0.14, 0.14, 2.8, 10)
const POST_HEIGHT = 2.8;
const POST_SEGMENTS = 10;
const POST_Y = 1.4;
const POST_EMISSIVE_INTENSITY = 0.6;
const FLOAT_TEXT_Y = 1.6;    // hauteur du '+1'/'+2' flottant (CONTRACT §6.4)

// --- Juice 5.3 (spec §5.3 ; non gameplay) ---
const TEXT_PUNCH_PEAK = 1.3;   // punch texte 1 → 1.3 → 1
const PANEL_PULSE_BASE = 0.72; // opacité de repos du panneau (pulse émissif « lent »)
const PANEL_PULSE_AMP = 0.14;
const PANEL_PULSE_FREQ = 2;    // rad/s (respiration lente)

/**
 * Panneau de porte en CanvasTexture (parité `gateTexture` du prototype).
 * @param {string} txt texte à peindre
 * @param {boolean} good porte bénéfique (teinte cyan) vs piège ✕ (teinte rouge)
 * @returns {THREE.CanvasTexture}
 */
function gateTexture(txt, good) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const c2d = canvas.getContext('2d');
  c2d.fillStyle = good ? 'rgba(0,229,255,0.28)' : 'rgba(255,60,90,0.30)';
  c2d.fillRect(0, 0, 256, 128);
  c2d.font = 'bold 84px Arial';
  c2d.textAlign = 'center';
  c2d.textBaseline = 'middle';
  c2d.lineWidth = 10;
  c2d.strokeStyle = 'rgba(0,0,0,0.35)';
  c2d.strokeText(txt, 128, 68);
  c2d.fillStyle = good ? '#aefcff' : '#ffd0d8';
  c2d.fillText(txt, 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dispose géométries + matériaux (+ map) d'un group de porte (évite les fuites GPU au rebuild). */
function disposeGateGroup(group) {
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    const m = obj.material;
    if (m) {
      m.map?.dispose();
      m.dispose();
    }
  });
}

/**
 * @param {object} ctx contexte partagé (CONTRACT §4)
 * @returns portes { build, clear, crossStep, update }
 */
export function createGates(ctx) {
  const halfW = GATE_WIDTH / 2; // = (LANE_HALF - 0.3) / 2 (CONTRACT §3)

  /**
   * Fabrique une porte : Group (panneau + 2 poteaux) et push dans state.gates.
   * Matériaux CLONÉS par porte (jamais partagés) : panneau MeshBasicMaterial dédié (sa CanvasTexture),
   * poteaux MeshLambertMaterial émissif dédié.
   */
  function makeGate(x, z, op) {
    const good = op !== 'X';

    const panelMat = new THREE.MeshBasicMaterial({
      map: gateTexture(op === 'X' ? '✕' : op, good),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(GATE_WIDTH, PANEL_HEIGHT), panelMat);
    panel.position.set(x, PANEL_Y, z);

    const postColor = good ? COLORS.gateGood : COLORS.gateBad;
    const postMat = new THREE.MeshLambertMaterial({
      color: postColor,
      emissive: postColor,
      emissiveIntensity: POST_EMISSIVE_INTENSITY,
    });

    const group = new THREE.Group();
    group.add(panel);
    const posts = [];
    for (const px of [-halfW, halfW]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, POST_HEIGHT, POST_SEGMENTS),
        postMat,
      );
      post.position.set(x + px, POST_Y, z);
      group.add(post);
      posts.push(post);
    }

    ctx.scene.add(group);
    ctx.state.gates.push({ x, z, halfW, op, group, panel, panelMat, posts, postMat, flashT: 0, punchT: 0 });
  }

  /** Retire les groups de la scène ; state.gates.length = 0 (jamais réassigné). */
  function clear() {
    const gates = ctx.state.gates;
    for (const g of gates) {
      ctx.scene.remove(g.group);
      disposeGateGroup(g.group);
    }
    gates.length = 0;
  }

  /** Parité buildGates : clear(), puis 2 portes par rangée avec ops mélangées + règle ✕. */
  function goodOpsForLevel(level) {
    const ops = ['x2', 'x3'];
    if (level >= GATE_ADVANCED_MIN_LEVEL) ops.push('x4');
    if (level >= GATE_ADVANCED_MIN_LEVEL + 1) ops.push('x5');
    if (level >= GATE_ADVANCED_MIN_LEVEL + 3) ops.push('x7');
    if (level >= GATE_ADVANCED_MIN_LEVEL + 5) ops.push('x10');
    return ops;
  }

  function pickOp(level) {
    const ops = goodOpsForLevel(level);
    return ops[Math.floor(Math.random() * ops.length)];
  }

  function build(level) {
    clear();
    for (const z of GATE_ROWS_Z) {
      const ops = [pickOp(level), pickOp(level)];
      if (level >= GATE_X_MIN_LEVEL && Math.random() < GATE_X_PROBA) {
        ops[Math.floor(Math.random() * 2)] = 'X';
      }
      makeGate(-GATE_OFFSET_X, z, ops[0]);
      makeGate(+GATE_OFFSET_X, z, ops[1]);
    }
    if (level >= GATE_CHAIN_MIN_LEVEL && Math.random() < GATE_CHAIN_PROBA) {
      makeGate(0, 13, '+1');
      if (level >= GATE_ADVANCED_MIN_LEVEL + 1) makeGate(0, -15, '+2');
    }
  }

  function clonesForOp(op) {
    if (op[0] === '+') return Math.max(1, parseInt(op.slice(1), 10) || 1);
    if (op[0] === 'x') return Math.max(1, (parseInt(op.slice(1), 10) || 2) - 1);
    return 0;
  }

  /**
   * APRÈS crowd.moveStep — itération DESCENDANTE des bleus. Un bleu franchit g si
   * u.pz > g.z && u.z <= g.z && |u.x - g.x| < g.halfW.
   * Les paramètres (dt, t) ne servent pas ici (le déplacement est fait par crowd.moveStep).
   */
  function crossStep(/* dt, t */) {
    const { state } = ctx;
    const blues = state.blues;
    const gates = state.gates;
    for (let i = blues.length - 1; i >= 0; i--) {
      const u = blues[i];
      for (const g of gates) {
        if (u.pz > g.z && u.z <= g.z && Math.abs(u.x - g.x) < g.halfW) {
          if (g.op === 'X') {
            ctx.particles.pop(u.x, u.z);
            ctx.sys.crowd.killBlue(i);
            ctx.audio.play('gateBad');
            break; // parité proto : le piège consomme l'unité et stoppe l'examen des autres portes
          }
          const clones = clonesForOp(g.op);
          for (let c = 0; c < clones; c++) {
            ctx.sys.crowd.spawnBlue(
              u.x + (Math.random() - 0.5) * (GATE_CLONE_JITTER_X * 2),
              u.z - Math.random() * GATE_CLONE_BACK_Z,
              true,
            );
          }
          // juice 5.3 (une fois par franchissement de cette porte)
          g.flashT = GATE_FLASH_DUR;
          g.punchT = GATE_PUNCH_DUR;
          ctx.particles.ring(g.x, g.z, COLORS.gateGood);
          ctx.floatingText.spawn('+' + clones, u.x, FLOAT_TEXT_Y, g.z);
          ctx.audio.synth?.ding();
          // pas de break : parité proto (une unité peut théoriquement recouper une 2e porte)
        }
      }
    }
  }

  /** TOUJOURS (même !playing) : decay flashT/punchT, flash ×2, punch texte, pulse émissif lent. */
  function update(dt, t) {
    for (const g of ctx.state.gates) {
      if (g.flashT > 0) g.flashT = Math.max(0, g.flashT - dt);
      if (g.punchT > 0) g.punchT = Math.max(0, g.punchT - dt);

      // Pulse émissif lent : le panneau est un MeshBasicMaterial (pas d'.emissive) → on module son
      // opacité. Phase déterministe par porte (x/z) pour désynchroniser les 4 panneaux.
      const phase = g.x * 1.7 + g.z * 0.6;
      const pulse = PANEL_PULSE_BASE + PANEL_PULSE_AMP * Math.sin(t * PANEL_PULSE_FREQ + phase);
      // Flash ×2 : facteur ∈ [1, 2] décroissant sur flashT.
      const flash = g.flashT > 0 ? 1 + g.flashT / GATE_FLASH_DUR : 1;
      g.panelMat.opacity = Math.min(1, pulse * flash);

      // Punch scale du texte (le panneau) : 1 → 1.3 → 1 via easeOutBack (léger dépassement).
      let s = 1;
      if (g.punchT > 0) {
        const u = 1 - g.punchT / GATE_PUNCH_DUR; // 0 → 1
        s = 1 + (TEXT_PUNCH_PEAK - 1) * (1 - easeOutBack(u));
      }
      g.panel.scale.set(s, s, s);

      // Juice poteaux : squash & stretch au franchissement (les montants « encaissent » le passage)
      // + surbrillance émissive pendant le flash.
      const postStretch = 1 + (s - 1) * 0.6; // suit le punch du panneau, atténué
      const postFat = 1 + (s - 1) * 0.35;
      for (const post of g.posts) post.scale.set(postFat, postStretch, postFat);
      const boost = g.flashT > 0 ? 1 + 2.2 * (g.flashT / GATE_FLASH_DUR) : 1;
      g.postMat.emissiveIntensity = POST_EMISSIVE_INTENSITY * boost;
    }
  }

  return { build, clear, crossStep, update };
}
