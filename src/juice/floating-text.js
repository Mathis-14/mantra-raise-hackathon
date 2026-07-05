// MOB RUSH — textes flottants IN-SCENE (juice) : CONTRACT §5.10 / §3.6.
// Module-librairie pur : n'importe QUE three. Ne connaît ni GameState ni ctx.
// JAMAIS de DOM : sprites THREE.Sprite (billboard) + CanvasTexture. Aucun effet de bord à l'import.

import * as THREE from 'three';

const POOL = 32;                 // ≥ 24 (CONTRACT §5.10)
const FONT_PX = 96;              // taille de rendu du canvas (indépendante de la taille monde)
const PAD = 24;                  // marge autour du texte (px canvas)
const FONT_STACK = 'bold FONTPXpx "Arial Rounded MT Bold","Helvetica Rounded",ui-rounded,Arial,sans-serif'
  .replace('FONTPX', String(FONT_PX));

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Juice : pop-in avec léger dépassement (easeOutBack), fondu sur la fin de vie seulement,
// et petite inclinaison aléatoire par sprite (les textes « claquent » au lieu d'apparaître secs).
const POP_DUR = 0.16;   // s de pop-in
const FADE_FRAC = 0.45; // fraction finale de la vie passée à fondre
const TILT_MAX = 0.16;  // rad d'inclinaison aléatoire (±)
function easeOutBack(u) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = u - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

/**
 * @param {THREE.Scene} scene
 * @returns {{ spawn(text:string,x:number,y:number,z:number,opts?:object):void, update(dt:number):void, reset():void }}
 */
export function createFloatingText(scene) {
  // Cache de CanvasTexture par (text, color) → { texture, aspect }.
  const cache = new Map();

  function getTexture(text, color) {
    const key = text + '|' + color;
    let entry = cache.get(key);
    if (entry) return entry;

    const canvas = document.createElement('canvas');
    const c = canvas.getContext('2d');
    c.font = FONT_STACK;
    const w = Math.ceil(c.measureText(String(text)).width) + PAD * 2;
    const h = FONT_PX + PAD * 2;
    canvas.width = w;
    canvas.height = h;
    // Redimensionner le canvas réinitialise le contexte : re-régler la police.
    c.font = FONT_STACK;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.strokeText(String(text), w / 2, h / 2);
    c.fillStyle = color;
    c.fillText(String(text), w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;       // règle absolue : CanvasTexture par code
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    entry = { texture, aspect: w / h };
    cache.set(key, entry);
    return entry;
  }

  const group = new THREE.Group();
  const slots = new Array(POOL);
  for (let i = 0; i < POOL; i++) {
    const material = new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      opacity: 1,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 10;
    group.add(sprite);
    slots[i] = { sprite, material, active: false, life: 0, maxLife: 1, vy: 0, size: 0.9 };
  }
  scene.add(group);

  function pick() {
    // Slot libre en priorité, sinon on recycle celui dont la vie restante est la plus courte.
    let worst = 0;
    let worstLife = Infinity;
    for (let i = 0; i < POOL; i++) {
      const s = slots[i];
      if (!s.active) return s;
      if (s.life < worstLife) { worstLife = s.life; worst = i; }
    }
    return slots[worst];
  }

  function spawn(text, x, y, z, opts = {}) {
    const color = opts.color != null ? opts.color : '#ffffff';
    const size = opts.size != null ? opts.size : 0.9;
    const life = opts.life != null ? opts.life : 0.7;
    const vy = opts.vy != null ? opts.vy : 2;

    const { texture, aspect } = getTexture(text, color);
    const s = pick();
    s.material.map = texture;
    s.material.opacity = 1;
    s.material.rotation = (Math.random() * 2 - 1) * TILT_MAX; // inclinaison aléatoire
    s.material.needsUpdate = true;
    s.sprite.scale.set(0.001, 0.001, 1); // le pop-in (update) amène à la taille cible
    s.sprite.position.set(x, y, z);
    s.sprite.visible = true;
    s.active = true;
    s.life = life;
    s.maxLife = life;
    s.vy = vy;
    s.size = size;
    s.aspect = aspect;
  }

  function update(dt) {
    if (dt <= 0) return;
    for (let i = 0; i < POOL; i++) {
      const s = slots[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.sprite.visible = false;
        continue;
      }
      const age = s.maxLife - s.life;
      // pop-in easeOutBack, puis très légère décrue vers 0.94 (le texte « se pose »)
      const pop = age < POP_DUR ? easeOutBack(clamp01(age / POP_DUR)) : 1 - 0.06 * clamp01((age - POP_DUR) / s.maxLife);
      const aspect = s.aspect || 1;
      s.sprite.scale.set(s.size * aspect * pop, s.size * pop, 1);
      s.sprite.position.y += s.vy * dt;       // montée
      // fondu uniquement sur la fin de vie (le texte reste net pendant sa montée)
      s.material.opacity = clamp01(s.life / (s.maxLife * FADE_FRAC));
    }
  }

  function reset() {
    for (let i = 0; i < POOL; i++) {
      slots[i].active = false;
      slots[i].sprite.visible = false;
    }
  }

  return { spawn, update, reset };
}
