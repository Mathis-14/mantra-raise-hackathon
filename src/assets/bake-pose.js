// MOB RUSH — cuisson de pose. CONTRACT §5.7.
// Module-LIBRAIRIE : n'importe QUE three + addons. Ne mute JAMAIS le gltf d'origine
// (skeletonClone duplique la hiérarchie et le squelette ; les géométries source sont copiées).
//
// SkinnedMesh -> BufferGeometry statique figée en pose de course :
// 1) skeletonClone(gltf.scene) ; AnimationMixer joue le clip figé à clipTime ; updateMatrixWorld.
// 2) skinning CPU (SkinnedMesh.getVertexPosition) sur TOUS les SkinnedMesh (body-mesh + head-mesh),
//    ramenés en espace racine du personnage (inverse(root.matrixWorld) * mesh.matrixWorld).
// 3) mergeGeometries -> une géométrie unique SANS matériau (UV conservés).
// 4) normalisation : pieds à y=0, recentrage x/z, scale uniforme pour bbox height = targetHeight.
// 5) computeVertexNormals.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * @param {object} gltf GLTF ORIGINAL (issu du loader) — non muté.
 * @param {{clipName?:string, clipTime?:number, targetHeight?:number}} [opts]
 * @returns {{geometry: THREE.BufferGeometry, height: number, scale: number}}
 */
export function bakeRunPose(gltf, opts = { clipName: 'sprint', clipTime: 0.25, targetHeight: 0.9 }) {
  const { clipName = 'sprint', clipTime = 0.25, targetHeight = 0.9 } = opts;

  // 1) Clone squelette + jeu figé du clip à clipTime.
  const root = skeletonClone(gltf.scene);

  const clips = gltf.animations || [];
  const clip = clips.find((c) => c.name === clipName);
  if (!clip) {
    const names = clips.map((c) => c.name).join(', ');
    throw new Error(`[bake-pose] clip '${clipName}' introuvable (dispo: ${names})`);
  }

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  mixer.update(0);
  mixer.update(clipTime);
  root.updateMatrixWorld(true);

  // 2) Récupère tous les SkinnedMesh (body-mesh + head-mesh chez Kenney).
  const skinned = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
  });
  if (skinned.length === 0) throw new Error('[bake-pose] aucun SkinnedMesh dans gltf.scene');

  // Attributs communs pour un merge homogène.
  let allHaveUV = true;
  let allIndexed = true;
  for (const m of skinned) {
    if (!m.geometry.attributes.uv) allHaveUV = false;
    if (!m.geometry.index) allIndexed = false;
  }

  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const toRoot = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const parts = [];

  for (const m of skinned) {
    const src = m.geometry;
    const posAttr = src.attributes.position;
    const count = posAttr.count;
    const out = new Float32Array(count * 3);

    // mesh-local (getVertexPosition) -> monde (mesh.matrixWorld) -> racine (rootInv)
    toRoot.multiplyMatrices(rootInv, m.matrixWorld);
    for (let i = 0; i < count; i++) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(toRoot);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    if (allHaveUV) geo.setAttribute('uv', src.attributes.uv.clone());
    if (allIndexed) geo.setIndex(src.index.clone());
    parts.push(geo);
  }

  // 3) Fusion en une géométrie unique (sans matériau).
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!geometry) {
    throw new Error('[bake-pose] mergeGeometries a échoué (attributs incompatibles)');
  }
  // Libère les buffers intermédiaires (jamais la géométrie retournée, jamais les sources partagées).
  if (geometry !== parts[0] || parts.length > 1) {
    for (const p of parts) if (p !== geometry) p.dispose();
  }

  // 4) Normalisation : pieds à y=0, recentrage x/z, scale uniforme -> targetHeight.
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  const rawHeight = bb.max.y - bb.min.y;
  geometry.translate(-cx, -bb.min.y, -cz);
  const scale = rawHeight > 1e-6 ? targetHeight / rawHeight : 1;
  geometry.scale(scale, scale, scale);

  // 5) Normales + bbox à jour.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  mixer.stopAllAction();

  return { geometry, height: targetHeight, scale };
}
