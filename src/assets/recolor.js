// MRUSH — recoloration d'équipe. CONTRACT §5.6 (arbitrage A9).
// Module-LIBRAIRIE : n'importe QUE three. Ne mute JAMAIS un matériau/texture d'origine partagé.

import * as THREE from 'three';

/** hex -> MeshLambertMaterial (PARTAGÉ volontairement, lecture seule). */
const _teamMats = new Map();
/** `${srcTexture.uuid}|${teamHex}` -> CanvasTexture (partagée entre clones d'une même équipe). */
const _teamMaps = new Map();

/**
 * Matériau flat d'équipe pour les masses instanciées.
 * UN matériau par hex, caché et PARTAGÉ (jamais muté après création).
 * @param {number} hex 0xRRGGBB
 * @returns {THREE.MeshLambertMaterial}
 */
export function teamMaterial(hex) {
  let m = _teamMats.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    _teamMats.set(hex, m);
  }
  return m;
}

// --- Conversions HSL (espace sRGB, hue en degrés [0,360)) ---

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hue2rgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h, s, l, out) {
  const hn = ((h / 360) % 1 + 1) % 1;
  if (s === 0) {
    out.r = l;
    out.g = l;
    out.b = l;
    return out;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out.r = hue2rgb(p, q, hn + 1 / 3);
  out.g = hue2rgb(p, q, hn);
  out.b = hue2rgb(p, q, hn - 1 / 3);
  return out;
}

/**
 * Recolore la palette-texture `colormap` vers la teinte d'équipe.
 * Règle (A9) : pour chaque pixel, si saturation HSL ≥ 0.3 ET teinte hors plage peau [15°,50°],
 * remplacer la teinte par celle de teamHex en conservant saturation/luminosité (préserve les
 * rampes d'ombrage et la peau/visages). Retourne une CanvasTexture NEUVE, colorSpace sRGB.
 * Cache par (texture.uuid, teamHex).
 *
 * Lecture pixels : la source est dessinée dans un canvas puis lue via getImageData. Le GLTFLoader
 * fournit une Image/ImageBitmap déjà décodée et les assets sont same-origin (servis par Vite) : pas
 * de canvas « tainted ». En cas d'échec de lecture (image non décodée, contexte perdu), on
 * dégrade proprement vers une CanvasTexture NON teintée (mapping conservé) + avertissement console.
 *
 * @param {THREE.Texture} srcTexture texture source (ORIGINALE, non mutée)
 * @param {number} teamHex 0xRRGGBB
 * @returns {THREE.CanvasTexture}
 */
export function makeTeamColormap(srcTexture, teamHex) {
  const key = `${srcTexture.uuid}|${teamHex}`;
  const cached = _teamMaps.get(key);
  if (cached) return cached;

  const img = srcTexture.image;
  const w = img && (img.width || img.videoWidth) ? img.width : 0;
  const h = img && (img.height || img.videoHeight) ? img.height : 0;

  const canvas = document.createElement('canvas');
  canvas.width = w || 1;
  canvas.height = h || 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });

  if (w && h) {
    try {
      g.drawImage(img, 0, 0);
      const teamHue = rgbToHsl(
        ((teamHex >> 16) & 255) / 255,
        ((teamHex >> 8) & 255) / 255,
        (teamHex & 255) / 255,
      ).h;
      const imageData = g.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const rgb = { r: 0, g: 0, b: 0 };
      for (let i = 0; i < data.length; i += 4) {
        const hsl = rgbToHsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
        if (hsl.s >= 0.3 && !(hsl.h >= 15 && hsl.h <= 50)) {
          hslToRgb(teamHue, hsl.s, hsl.l, rgb);
          data[i] = Math.round(rgb.r * 255);
          data[i + 1] = Math.round(rgb.g * 255);
          data[i + 2] = Math.round(rgb.b * 255);
        }
      }
      g.putImageData(imageData, 0, 0);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[recolor] lecture pixels impossible, texture non teintée:', e);
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('[recolor] image source non décodée (taille nulle) — texture non teintée');
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = srcTexture.flipY;
  tex.wrapS = srcTexture.wrapS;
  tex.wrapT = srcTexture.wrapT;
  tex.magFilter = srcTexture.magFilter;
  tex.minFilter = srcTexture.minFilter;
  tex.generateMipmaps = srcTexture.generateMipmaps;
  tex.needsUpdate = true;
  _teamMaps.set(key, tex);
  return tex;
}

/**
 * Applique la teinte d'équipe à un CLONE (héros/canon/base). Traverse root ; pour chaque
 * Mesh/SkinnedMesh clone son matériau puis remplace `.map` par la colormap recolorée.
 * NE TOUCHE JAMAIS le matériau/texture d'origine.
 * @param {THREE.Object3D} root racine du CLONE
 * @param {number} teamHex 0xRRGGBB
 */
export function retintClone(root, teamHex) {
  root.traverse((o) => {
    if (!o.isMesh) return; // isMesh vaut aussi true pour SkinnedMesh
    if (Array.isArray(o.material)) {
      o.material = o.material.map((m) => {
        const c = m.clone();
        if (m.map) c.map = makeTeamColormap(m.map, teamHex);
        return c;
      });
    } else {
      const src = o.material;
      const c = src.clone();
      if (src.map) c.map = makeTeamColormap(src.map, teamHex);
      o.material = c;
    }
  });
}
