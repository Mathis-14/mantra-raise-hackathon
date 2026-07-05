// MRUSH — heroes : clones animés du premier plan (CONTRACT §6.3, PLAN §3).
// Habillage visuel PUR : les héros ne comptent pas, ne collisionnent pas, ne possèdent aucun état
// gameplay. Ils sont un MIROIR des `count` unités logiques les plus proches du front.
//
// Les troupes sont une masse pleine (matériau plat d'équipe) mais ANIMÉE : chaque clone est un
// SkinnedMesh piloté par un mixer (clip `sprint`), avec sa texture remplacée par une couleur unie.
// Le skin (texture détaillée) est réservé aux unités focales — champion (crowd/champion.js) et
// boss/géants (enemy/giants.js) — pour que « skinné = unité qui compte ».
//
// Générique par équipe : `getUnits`/`solidColor`/`bob`/`faceBack` paramètrent bleu (défaut) et rouge.
// `boundIds` (Set) expose les ids couverts par un héros ce frame → la masse instanciée saute ces
// unités pour éviter le double rendu (flat + skinné superposés).
//
// Module-SYSTÈME : factory createHeroes(ctx, opts). N'importe AUCUN autre système ; ne lit que
// ctx.state, ctx.scene et ctx.assets. skeletonClone est une librairie (autorisée).

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { COLORS, UNIT_HEIGHT, UNIT_FACING_FIX, BLUE_BOB } from '../core/constants.js';

const CLIP_NAME = 'sprint';
// Comparateur hissé au module (pas de closure allouée à chaque frame) : z décroissant = front d'abord.
const byZDesc = (a, b) => b.z - a.z;

export function createHeroes(ctx, {
  count = 5,
  getUnits = (c) => c.state.blues,
  bob = BLUE_BOB,
  faceBack = false,               // rouges : regardent +Z (vers le joueur)
  solidColor = COLORS.blue,       // couleur du matériau plat d'équipe
} = {}) {
  const { scene, assets } = ctx;
  const facingY = faceBack ? UNIT_FACING_FIX + Math.PI : UNIT_FACING_FIX;
  const boundIds = new Set();     // ids couverts par un héros ce frame (lu par crowd/waves.render)
  // Matériau plat unique par équipe, partagé entre les clones (skinné → skinning automatique).
  const solidMaterial = new THREE.MeshLambertMaterial({ color: solidColor });
  // Variété visuelle : on alterne les 4 modèles mâles (cycle si count > 4).
  const sources = [assets.gltf.maleA, assets.gltf.maleB, assets.gltf.maleD, assets.gltf.maleE];

  /** @type {{ wrapper: THREE.Group, mixer: THREE.AnimationMixer, boundId: (number|null) }[]} */
  const heroes = [];

  // Scratch réutilisés (mesure de bbox à la création uniquement).
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const src = sources[i % sources.length];

    // SkinnedMesh → clone via SkeletonUtils, puis texture remplacée par le matériau plat d'équipe.
    const rig = skeletonClone(src.scene);
    rig.traverse((o) => { if (o.isMesh) o.material = solidMaterial; });

    // Hiérarchie : wrapper (déplacé/orienté chaque frame) → inner (normalisation) → rig (clone GLB).
    // On ne touche jamais aux transforms internes du clone : la normalisation vit dans `inner`.
    const inner = new THREE.Group();
    inner.add(rig);
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.rotation.y = facingY;   // regarde comme la masse instanciée de l'équipe
    wrapper.visible = false;
    scene.add(wrapper);

    // Normalisation d'échelle à UNIT_HEIGHT via mesure de bbox (cohérence avec le bake de la masse) ;
    // pieds à y=0 et recentrage x/z, comme bake-pose.js.
    wrapper.updateMatrixWorld(true);
    _box.setFromObject(rig);
    _box.getSize(_size);
    const s = _size.y > 1e-6 ? UNIT_HEIGHT / _size.y : 1;
    inner.scale.setScalar(s);
    wrapper.updateMatrixWorld(true);
    _box.setFromObject(rig);
    _box.getCenter(_center);
    inner.position.set(-_center.x, -_box.min.y, -_center.z);

    // AnimationMixer : clip `sprint` avec offset de temps aléatoire (désync entre héros).
    const mixer = new THREE.AnimationMixer(rig);
    const clip = THREE.AnimationClip.findByName(src.animations, CLIP_NAME);
    if (clip) {
      mixer.clipAction(clip).play();
      mixer.setTime(Math.random() * clip.duration);
    }

    heroes.push({ wrapper, mixer, boundId: null });
  }

  // Sélection des cibles, réutilisée chaque frame (zéro alloc quand units.length <= count).
  const _target = [];       // unités suivies (les plus proches du front), z décroissant
  const _byId = new Map();  // id → Unit
  const _used = new Set();  // ids déjà liés à un héros cette frame
  const _scratch = [];      // tampon de tri réutilisé (évite units.slice() par frame → moins de GC)

  function selectTargets(units) {
    _target.length = 0;
    _byId.clear();
    if (units.length <= count) {
      for (let i = 0; i < units.length; i++) _target.push(units[i]);
    } else {
      // Les `count` unités au z le plus grand = les plus proches du front (côté joueur).
      // Tri dans un tampon réutilisé (pas de nouvelle allocation de tableau chaque frame).
      _scratch.length = 0;
      for (let i = 0; i < units.length; i++) _scratch.push(units[i]);
      _scratch.sort(byZDesc);
      for (let i = 0; i < count; i++) _target.push(_scratch[i]);
    }
    for (let i = 0; i < _target.length; i++) _byId.set(_target[i].id, _target[i]);
  }

  return {
    boundIds,
    update(dt, t) {
      const units = getUnits(ctx);
      selectTargets(units);

      // 1) Conserver les liaisons dont l'unité est toujours dans la cible ; libérer les autres
      //    (unité morte/disparue OU sortie du peloton de tête). Re-binding par id.
      _used.clear();
      for (let h = 0; h < heroes.length; h++) {
        const hero = heroes[h];
        if (hero.boundId != null && _byId.has(hero.boundId)) _used.add(hero.boundId);
        else hero.boundId = null;
      }

      // 2) Affecter les héros libres aux unités cible non encore suivies (ordre z décroissant).
      let ti = 0;
      for (let h = 0; h < heroes.length; h++) {
        const hero = heroes[h];
        if (hero.boundId != null) continue;
        while (ti < _target.length && _used.has(_target[ti].id)) ti++;
        if (ti < _target.length) {
          hero.boundId = _target[ti].id;
          _used.add(_target[ti].id);
          ti++;
        }
      }

      // 3) Placement (position logique de l'unité, même bobbing y que la foule) + animation scalée.
      //    Héros excédentaires (moins de `count` unités) : cachés.
      //    boundIds = ids réellement affichés → la masse instanciée saute ces unités (pas de doublon).
      boundIds.clear();
      for (let h = 0; h < heroes.length; h++) {
        const hero = heroes[h];
        const u = hero.boundId != null ? _byId.get(hero.boundId) : null;
        if (u) {
          const y = Math.abs(Math.sin(t * bob.freq + u.wob)) * bob.amp;
          hero.wrapper.position.set(u.x, y, u.z);
          if (!hero.wrapper.visible) hero.wrapper.visible = true;
          hero.mixer.update(dt);   // dt SCALÉ → gel en hit-stop
          boundIds.add(u.id);
        } else if (hero.wrapper.visible) {
          hero.wrapper.visible = false;
        }
      }
    },

    reset() {
      boundIds.clear();
      for (let h = 0; h < heroes.length; h++) {
        heroes[h].boundId = null;
        heroes[h].wrapper.visible = false;
      }
    },
  };
}
