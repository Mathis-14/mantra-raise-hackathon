// MOB RUSH — heroes : clones animés du premier plan (CONTRACT §6.3, PLAN §3).
// Habillage visuel PUR : les héros ne comptent pas, ne collisionnent pas, ne possèdent aucun état
// gameplay. Ils sont un MIROIR des `count` unités bleues logiques les plus proches du canon.
//
// Module-SYSTÈME : factory createHeroes(ctx). N'importe AUCUN autre système ; ne lit que ctx.state,
// ctx.scene et ctx.assets. retintClone / skeletonClone sont des librairies (autorisées).

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { COLORS, UNIT_HEIGHT, UNIT_FACING_FIX, BLUE_BOB } from '../core/constants.js';
import { retintClone } from '../assets/recolor.js';

const CLIP_NAME = 'sprint';

export function createHeroes(ctx, { count = 5 } = {}) {
  const { scene, assets } = ctx;
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

    // SkinnedMesh → clone via SkeletonUtils, puis teinte d'équipe (matériaux/textures clonés).
    const rig = skeletonClone(src.scene);
    retintClone(rig, COLORS.blue);

    // Hiérarchie : wrapper (déplacé/orienté chaque frame) → inner (normalisation) → rig (clone GLB).
    // On ne touche jamais aux transforms internes du clone : la normalisation vit dans `inner`.
    const inner = new THREE.Group();
    inner.add(rig);
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.rotation.y = UNIT_FACING_FIX;   // regarde -Z, comme la masse instanciée
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

  // Sélection des cibles, réutilisée chaque frame (zéro alloc quand blues.length <= count).
  const _target = [];       // unités bleues suivies (les plus proches du canon), z décroissant
  const _byId = new Map();  // id → BlueUnit
  const _used = new Set();  // ids déjà liés à un héros cette frame

  function selectTargets(blues) {
    _target.length = 0;
    _byId.clear();
    if (blues.length <= count) {
      for (let i = 0; i < blues.length; i++) _target.push(blues[i]);
    } else {
      // Les `count` unités au z le plus grand = les plus proches du canon (PLAYER_Z).
      const sorted = blues.slice().sort((a, b) => b.z - a.z);
      for (let i = 0; i < count; i++) _target.push(sorted[i]);
    }
    for (let i = 0; i < _target.length; i++) _byId.set(_target[i].id, _target[i]);
  }

  return {
    update(dt, t) {
      const blues = ctx.state.blues;
      selectTargets(blues);

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
      //    Héros excédentaires (moins de `count` bleus) : cachés.
      for (let h = 0; h < heroes.length; h++) {
        const hero = heroes[h];
        const u = hero.boundId != null ? _byId.get(hero.boundId) : null;
        if (u) {
          const y = Math.abs(Math.sin(t * BLUE_BOB.freq + u.wob)) * BLUE_BOB.amp;
          hero.wrapper.position.set(u.x, y, u.z);
          if (!hero.wrapper.visible) hero.wrapper.visible = true;
          hero.mixer.update(dt);   // dt SCALÉ → gel en hit-stop
        } else if (hero.wrapper.visible) {
          hero.wrapper.visible = false;
        }
      }
    },

    reset() {
      for (let h = 0; h < heroes.length; h++) {
        heroes[h].boundId = null;
        heroes[h].wrapper.visible = false;
      }
    },
  };
}
