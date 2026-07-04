// MOB RUSH — point d'entrée. (T0 : smoke-test toolchain — remplacé par l'orchestrateur en T13.)
import * as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b1d6b);
scene.fog = new THREE.Fog(0x2b1d6b, 55, 90);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 17, 30);
camera.lookAt(0, 0, -3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a2a7a, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(6, 14, 8);
scene.add(sun);

// Piste témoin (valeurs prototype) — confirme que three rend correctement.
const track = new THREE.Mesh(
  new THREE.BoxGeometry(4.5 * 2 + 1, 1, 52),
  new THREE.MeshLambertMaterial({ color: 0xede7ff }),
);
track.position.set(0, -0.5, -2);
scene.add(track);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
console.log('[MOB RUSH] scaffold T0 — three', THREE.REVISION);
