// MOB RUSH — chargement GLB. CONTRACT §5.5.
// Module-LIBRAIRIE : ne connaît ni GameState ni ctx. Un seul GLTFLoader interne, cache par URL.
// L'objet GLTF caché est l'ORIGINAL PARTAGÉ : ne jamais l'ajouter à la scène ni muter ses
// matériaux/géométries — les consommateurs clonent (skeletonClone / recolor / bake).

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _loader = new GLTFLoader();

/** url -> Promise<GLTF> : garantit « même URL ⇒ MÊME promesse » (une seule requête réseau). */
const _promises = new Map();
/** url -> GLTF : valeur résolue, pour l'accès synchrone getCached(). */
const _resolved = new Map();

/**
 * Charge un GLB et met en cache la PROMESSE par URL.
 * Un second appel avec la même URL renvoie la même promesse (aucune requête supplémentaire).
 * @param {string} url URL déjà encodée (%20) — utilisée telle quelle (table CONTRACT §8).
 * @returns {Promise<object>} le GLTF ({ scene, animations, ... })
 */
export function loadGLB(url) {
  const existing = _promises.get(url);
  if (existing) return existing;

  const p = new Promise((resolve, reject) => {
    _loader.load(
      url,
      (gltf) => {
        _resolved.set(url, gltf);
        resolve(gltf);
      },
      undefined,
      (err) => reject(err),
    );
  });
  _promises.set(url, p);
  return p;
}

/**
 * Précharge un lot d'URLs. Résout quand tous les GLB sont chargés (dans l'ordre des URLs).
 * @param {string[]} urls
 * @returns {Promise<object[]>}
 */
export function preload(urls) {
  return Promise.all(urls.map((url) => loadGLB(url)));
}

/**
 * Accès synchrone au GLTF déjà chargé (après preload).
 * @param {string} url
 * @returns {object|undefined} le GLTF, ou undefined s'il n'est pas encore résolu.
 */
export function getCached(url) {
  return _resolved.get(url);
}

function nodeLine(o, depth) {
  const pad = '  '.repeat(depth);
  let extra = '';
  if (o.isMesh) {
    const g = o.geometry;
    let tris = 0;
    if (g) {
      if (g.index) tris = g.index.count / 3;
      else if (g.attributes && g.attributes.position) tris = g.attributes.position.count / 3;
    }
    const kind = o.isSkinnedMesh ? 'SkinnedMesh' : 'Mesh';
    const bones = o.isSkinnedMesh && o.skeleton ? ` bones:${o.skeleton.bones.length}` : '';
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const maps = mats.map((m) => (m && m.map ? 'map' : 'no-map')).join(',');
    extra = ` [${kind} tris:${tris}${bones} mat:${maps}]`;
  }
  return `${pad}${o.name || '(unnamed)'} <${o.type}>${extra}`;
}

function walk(o, depth, lines) {
  lines.push(nodeLine(o, depth));
  const kids = o.children;
  for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1, lines);
}

/**
 * Log de debug (requis T3) : hiérarchie de gltf.scene + clips {name, duration}.
 * @param {object} gltf
 * @param {string} [name]
 */
export function dumpInfo(gltf, name = 'GLB') {
  const lines = [];
  if (gltf && gltf.scene) walk(gltf.scene, 0, lines);
  const clips = (gltf && gltf.animations ? gltf.animations : []).map((c) => ({
    name: c.name,
    duration: Math.round(c.duration * 1000) / 1000,
  }));
  // eslint-disable-next-line no-console
  console.log(
    `[loader] ${name}\n${lines.join('\n')}\n[loader] ${name} clips (${clips.length}):`,
    clips,
  );
}
