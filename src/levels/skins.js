// MOB RUSH — skins de map (styles visuels par niveau, UNIQUEMENT nos assets Kenney + palette).
// Système : retinte le décor persistant (ciel/fog/sol/piste) et pose quelques props de bord
// propres au skin (arbres enneigés, cristaux…), reconstruits à chaque niveau comme les obstacles.
// Expose `current` (couleurs du skin) — les mottes de terre d'obstacles.js s'y accordent.

import * as THREE from 'three';
import { TRACK, COLORS, FOG, LIGHTS } from '../core/constants.js';

// Chaque skin : palette (bg/fog/route/sol) + couleur de motte assortie + props de bord.
// props : [cléAssetGltf, x, z, taille, rotationY]
const EDGE = TRACK.w / 2 + 2.2;

// PURETÉ THÉMATIQUE : chaque skin définit AUSSI les assets de ses murs/mottes — en neige,
// les murs sont des blocs de neige, au crépuscule des briques améthyste, etc.
// wallKinds : clés d'assets gltf pour les murs `crates`/`lane` ; wallTint : teinte optionnelle.
export const SKINS = Object.freeze({
  // Canyon de jour (palette par défaut de constants.js) — murs bois (caisses/barils).
  canyon: Object.freeze({
    bg: COLORS.bg, fog: FOG.color, road: COLORS.road, ground: COLORS.ground,
    mound: 0xB8996B, // terre sable, assortie au sol canyon
    wallKinds: Object.freeze(['crate', 'crateStrong', 'crate', 'barrel']),
    wallTint: null,
    env: 'canyon', // environnement (falaises/végétation) affiché
    lighting: null, // éclairage par défaut (constants.LIGHTS)
    props: Object.freeze([]), // l'environnement canyon EST le skin
  }),

  // Crépuscule violet (hommage à la palette du prototype) — murs briques + cristaux améthyste.
  dusk: Object.freeze({
    bg: 0x2B1D6B, fog: 0x3A2A7A, road: 0xEDE7FF, ground: 0x4A3B8C,
    mound: 0x6B58B8, // terre « améthyste » assortie au sol violet
    wallKinds: Object.freeze(['brick', 'brick', 'jewel']),
    wallTint: 0x9F8FD6,
    env: 'canyon', // mêmes falaises… mais en ÉCLAIRAGE NUIT (silhouettes sombres, plus de vert cru)
    lighting: Object.freeze({ hemiSky: 0x8A79E8, hemiGround: 0x1D1450, hemiMult: 0.55, sunMult: 0.5, sunColor: 0xBFA8FF }),
    props: Object.freeze([
      Object.freeze(['jewel', -EDGE, 6, 1.6, 0.4]),
      Object.freeze(['jewel', EDGE + 0.6, -4, 2.0, 1.2]),
      Object.freeze(['mushrooms', -EDGE - 0.8, -12, 1.4, 0]),
      Object.freeze(['jewel', EDGE, -16, 1.4, 2.1]),
    ]),
  }),

  // Neige (set block-snow / sapins enneigés du platformer-kit) — murs en blocs de neige.
  snow: Object.freeze({
    bg: 0xDCEAF5, fog: 0xE4EEF6, road: 0xF2F6FA, ground: 0xE9F0F7,
    mound: 0xD9E4EE, // congère assortie à la neige
    wallKinds: Object.freeze(['blockSnow']),
    wallTint: null, // les blocs de neige sont déjà dans le thème
    env: 'snow', // environnement TOUT-NEIGE (falaises enneigées, sapins blancs — plus de vert)
    lighting: null,
    props: Object.freeze([
      Object.freeze(['treePineSnow', -EDGE, 8, 4.2, 0.3]),
      Object.freeze(['treeSnow', EDGE + 0.8, 2, 3.6, 1.6]),
      Object.freeze(['treePineSnow', EDGE, -9, 4.6, 0.9]),
      Object.freeze(['treePineSnow', -EDGE - 1, -15, 4.0, 2.2]),
      Object.freeze(['treeSnow', -EDGE + 0.4, 16, 3.2, 1.1]),
    ]),
  }),
});

const CYCLE = ['canyon', 'dusk', 'snow'];

/** Skin du niveau : rotation lente (change tous les 2 niveaux pour laisser respirer chaque style). */
export function skinKeyForLevel(level) {
  return CYCLE[Math.floor((level - 1) / 2) % CYCLE.length];
}

export function createSkins(ctx) {
  const props = [];
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();
  let current = SKINS.canyon;
  let currentKey = 'canyon';

  function makeProp(gltf, size) {
    const holder = new THREE.Group();
    if (!gltf || !gltf.scene) return holder;
    const root = gltf.scene.clone(true);
    _box.setFromObject(root);
    _box.getSize(_size);
    _box.getCenter(_center);
    const maxDim = Math.max(_size.x, _size.y, _size.z) || 1;
    root.position.set(-_center.x, -_box.min.y, -_center.z);
    holder.add(root);
    holder.scale.setScalar(size / maxDim);
    return holder;
  }

  function clear() {
    for (const p of props) ctx.scene.remove(p);
    props.length = 0;
  }

  /** Applique le skin du niveau : retinte le décor persistant + pose les props du skin. */
  function build(level) {
    clear();
    // skin imposé par le variant d'ad (toolkit agent) sinon rotation par niveau
    const forced = ctx.variant && ctx.variant.skin;
    currentKey = forced && SKINS[forced] ? forced : skinKeyForLevel(level);
    current = SKINS[currentKey];

    // retinte (mutation .set — jamais de réassignation de matériaux partagés d'assets)
    if (ctx.scene.background && ctx.scene.background.isColor) ctx.scene.background.set(current.bg);
    if (ctx.scene.fog) ctx.scene.fog.color.set(current.fog);
    if (ctx.decor && ctx.decor.ground) ctx.decor.ground.material.color.set(current.ground);
    if (ctx.decor && ctx.decor.road) ctx.decor.road.material.color.set(current.road);

    // ENVIRONNEMENT : bascule falaises/végétation (canyon vert ↔ tout-neige, silhouettes jumelles)
    if (ctx.decor && ctx.decor.envs) {
      for (const [name, group] of Object.entries(ctx.decor.envs)) {
        group.visible = name === (current.env || 'canyon');
      }
    }
    // ÉCLAIRAGE : nuit violette pour dusk (les falaises vertes deviennent des silhouettes sombres)
    if (ctx.decor && ctx.decor.hemi && ctx.decor.sun) {
      const L = current.lighting;
      ctx.decor.hemi.color.set(L ? L.hemiSky : LIGHTS.hemi.sky);
      ctx.decor.hemi.groundColor.set(L ? L.hemiGround : LIGHTS.hemi.ground);
      ctx.decor.hemi.intensity = LIGHTS.hemi.intensity * (L ? L.hemiMult : 1);
      ctx.decor.sun.color.set(L && L.sunColor ? L.sunColor : LIGHTS.dir.color);
      ctx.decor.sun.intensity = LIGHTS.dir.intensity * (L ? L.sunMult : 1);
    }

    for (const [key, x, z, size, ry] of current.props) {
      const p = makeProp(ctx.assets.gltf[key], size);
      p.position.set(x, 0, z);
      p.rotation.y = ry;
      ctx.scene.add(p);
      props.push(p);
    }
  }

  return {
    build,
    clear,
    get current() { return current; },
    get key() { return currentKey; },
  };
}
