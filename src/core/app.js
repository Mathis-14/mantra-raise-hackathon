// MOB RUSH — orchestrateur (CONTRACT §6.11 + ordre d'update §7.2).
// SEUL module qui : crée renderer/scene/lumières/décor, précharge les assets, construit ctx,
// instancie les systèmes, remplit ctx.sys, possède la boucle RAF.
import * as THREE from 'three';
import * as C from './constants.js';
import { preload, getCached, dumpInfo } from '../assets/loader.js';
import { bakeRunPose } from '../assets/bake-pose.js';
import { createTime } from './time.js';
import { createCameraRig } from './camera-rig.js';
import { applyThemeCss, resolveVariantTheme } from './theme.js';
import { createAudio } from '../audio/audio-manager.js';
import { createParticles } from '../juice/particles.js';
import { createConfetti } from '../juice/confetti.js';
import { createFloatingText } from '../juice/floating-text.js';
import { createVignette } from '../juice/vignette.js';
import { createFlyingCoins } from '../ui/flying-coins.js';
import { createCannon } from '../crowd/cannon.js';
import { createCrowd } from '../crowd/crowd.js';
import { createChampion } from '../crowd/champion.js';
import { createHeroes } from '../crowd/heroes.js';
import { createGates } from '../gates/gates.js';
import { createWaves } from '../enemy/waves.js';
import { createGiants } from '../enemy/giants.js';
import { createBase } from '../enemy/base.js';
import { createLevels } from '../levels/levels.js';
import { createObstacles } from '../levels/obstacles.js';
import { createSkins } from '../levels/skins.js';
import { createHud } from '../ui/hud.js';
import { createOverlays } from '../ui/overlays.js';

const GLB = '/models';
const MC = `${GLB}/mini-characters/Models/GLB%20format`;
const BK = `${GLB}/blaster-kit/Models/GLB%20format`;
const PK = `${GLB}/platformer-kit/Models/GLB%20format`;
const AD_OVERLAY_STEP_S = 5;

// clé ctx.assets.gltf → URL (CONTRACT §8.1, pré-encodées %20)
const ASSET_URLS = {
  maleA: `${MC}/character-male-a.glb`,
  maleB: `${MC}/character-male-b.glb`,
  maleD: `${MC}/character-male-d.glb`,
  maleE: `${MC}/character-male-e.glb`,
  sunglasses: `${MC}/aid-sunglasses.glb`,
  blaster: `${BK}/blaster-b.glb`,
  bossChar: `${PK}/character-oozi.glb`,
  saw: `${PK}/saw.glb`,
  trapSpikes: `${PK}/trap-spikes.glb`,
  trapSpikesLarge: `${PK}/trap-spikes-large.glb`,
  conveyor: `${PK}/conveyor-belt.glb`,
  crate: `${PK}/crate.glb`,
  crateStrong: `${PK}/crate-strong.glb`,
  barrel: `${PK}/barrel.glb`,
  // skins de map (voir levels/skins.js)
  treeSnow: `${PK}/tree-snow.glb`,
  treePineSnow: `${PK}/tree-pine-snow.glb`,
  jewel: `${PK}/jewel.glb`,
  blockSnow: `${PK}/block-snow.glb`, // murs du skin neige
  blockSnowTall: `${PK}/block-snow-large-tall.glb`,      // falaises de l'environnement neige
  cliffSnowHex: `${PK}/block-snow-overhang-hexagon.glb`, // mesas/buttes de l'environnement neige
  blockTall: `${PK}/block-grass-large-tall.glb`,
  blockLow: `${PK}/block-grass-low-large.glb`,
  flag: `${PK}/flag.glb`,
  brick: `${PK}/brick.glb`,
  stones: `${PK}/stones.glb`,
  rocks: `${PK}/rocks.glb`,
  tree: `${PK}/tree.glb`,
  treePine: `${PK}/tree-pine.glb`,
  treePineSmall: `${PK}/tree-pine-small.glb`,
  hedge: `${PK}/hedge.glb`,
  flowers: `${PK}/flowers.glb`,
  flowersTall: `${PK}/flowers-tall.glb`,
  mushrooms: `${PK}/mushrooms.glb`,
  plant: `${PK}/plant.glb`,
  grassTuft: `${PK}/grass.glb`,
  fenceLow: `${PK}/fence-low-straight.glb`,
  // falaises de canyon (sommet herbeux, flancs sable) — réf. Mob Control 4-blue-vs-red
  cliffTall: `${PK}/block-grass-overhang-large-tall.glb`,
  cliffHex: `${PK}/block-grass-overhang-hexagon.glb`,
};

// tampons partagés pour la normalisation bbox (évite les allocations par clone)
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Clone un GLB, le normalise à `size` (plus grande dimension), centré en x/z,
 * base posée à y=0. `holder.userData.height` = hauteur montée (pour asseoir le sommet).
 */
function makeProp(gltf, size) {
  const holder = new THREE.Group();
  if (!gltf || !gltf.scene) return holder;
  const root = gltf.scene.clone(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  _box.getCenter(_center);
  const maxDim = Math.max(_size.x, _size.y, _size.z) || 1;
  const s = size / maxDim;
  root.position.set(-_center.x, -_box.min.y, -_center.z);
  holder.add(root);
  holder.scale.setScalar(s);
  holder.userData.height = _size.y * s;
  return holder;
}

// tampons pour l'instanciation des props (init uniquement)
const _iPos = new THREE.Vector3();
const _iQuat = new THREE.Quaternion();
const _iEuler = new THREE.Euler();
const _iScale = new THREE.Vector3();
const _iMat = new THREE.Matrix4();

/**
 * Fusionne N copies d'un prop MONO-mesh (même géométrie + matériau) en un seul InstancedMesh :
 * 1 draw call au lieu de N. Reproduit EXACTEMENT makeProp(size) + position + rotationY, donc
 * l'aspect est identique. `placements` : [{ x, y, z, size, ry }]. Statique → aucun coût par frame.
 * Retourne null si le prop n'est pas mono-mesh (l'appelant garde alors le placement individuel).
 */
function addInstancedProp(scene, gltf, placements) {
  if (!gltf || !gltf.scene || placements.length === 0) return null;
  // Géométrie de base normalisée à maxDim=1 (base y=0, centrée x/z) — réutilise makeProp.
  const proto = makeProp(gltf, 1);
  proto.updateWorldMatrix(true, true);
  let src = null, meshCount = 0;
  proto.traverse((o) => { if (o.isMesh) { meshCount++; if (!src) src = o; } });
  if (!src || meshCount !== 1) return null;      // multi-mesh non géré ici
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);             // fige la normalisation dans la géométrie
  const inst = new THREE.InstancedMesh(geo, src.material, placements.length);
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    _iEuler.set(0, p.ry, 0);
    _iQuat.setFromEuler(_iEuler);
    _iPos.set(p.x, p.y, p.z);
    _iScale.setScalar(p.size);
    _iMat.compose(_iPos, _iQuat, _iScale);
    inst.setMatrixAt(i, _iMat);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;   // statique, presque toujours à l'écran ; évite un cull erroné (bbox unité)
  scene.add(inst);
  return inst;
}

/** Décor procédural + props (CONTRACT §6.11 étape 2). Retourne les nuages (drift en boucle). */
function buildDecor(scene, gltf, theme) {
  // sol continu (sable chaud, réf. canyon Mob Control) : supprime le vide violet sous le décor,
  // tout repose dessus. Les falaises enfoncées sous ce plan semblent sortir du terrain.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.MeshLambertMaterial({ color: theme.colors.ground || C.COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.12, C.TRACK.z);
  scene.add(ground);

  // piste : une seule dalle continue (surface propre, sommet à y=0, silhouette de plateau épais).
  const ROAD_THICKNESS = 2.2;
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(C.TRACK.w, ROAD_THICKNESS, C.TRACK.len),
    new THREE.MeshLambertMaterial({ color: theme.colors.road }),
  );
  road.position.set(0, -ROAD_THICKNESS / 2, C.TRACK.z);
  scene.add(road);
  const zStart = C.TRACK.z + C.TRACK.len / 2;

  // pointillés centraux (repère de vitesse), juste au-dessus des dalles
  const dashMat = new THREE.MeshLambertMaterial({ color: theme.colors.dash });
  for (let z = C.DASH.zStart; z > C.DASH.zEnd; z += C.DASH.step) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(C.DASH.w, C.DASH.h, C.DASH.len), dashMat);
    d.position.set(0, C.DASH.y, z);
    scene.add(d);
  }

  // barrières basses bordant la voie : tournées de 90° pour courir le long de la piste (axe Z).
  const FENCE_LEN = 1.7;
  const fencePlacements = [];
  for (const s of [-1, 1]) {
    for (let z = zStart - FENCE_LEN / 2; z > C.TRACK.z - C.TRACK.len / 2; z -= FENCE_LEN) {
      fencePlacements.push({ x: s * (C.TRACK.w / 2 + 0.35), y: 0, z, size: FENCE_LEN, ry: Math.PI / 2 });
    }
  }
  addInstancedProp(scene, gltf.fenceLow, fencePlacements);   // ~60 barrières → 1 draw call

  // ── ENVIRONNEMENT THÉMABLE (falaises + végétation) : construit DEUX fois avec le même
  // seed déterministe (silhouettes identiques) mais des kits d'assets différents (canyon vert /
  // tout-neige). Les skins (levels/skins.js) basculent la visibilité des groupes par niveau —
  // le background suit ENFIN le thème (plus de falaises vertes sous la neige).
  const edge = C.TRACK.w / 2 + 1.4;
  function buildEnvironment(root, kit) {
    // props de bord de piste
    for (const [g, x, z, size, ry] of kit.edgeProps) {
      const o = makeProp(g, size);
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      root.add(o);
    }
    function place(g, x, y, z, size, ry) {
      const o = makeProp(g, size);
      o.position.set(x, y, z);
      o.rotation.y = ry;
      root.add(o);
      return { o, topY: y + (o.userData.height || 0) };
    }
    let seed = 20260704; // même seed pour tous les kits → mêmes silhouettes
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    // parois latérales (blocs droits, jamais au-dessus de la piste)
    const WALL_X = 10.5;
    const zTop = C.TRACK.z + C.TRACK.len / 2;
    const zBot = C.TRACK.z - C.TRACK.len / 2;
    const wallNormH = makeProp(kit.wall, 1).userData.height || 0;
    const rims = [];
    const wallPlacements = [];
    for (let z = zTop; z >= zBot - 2; z -= 3.0) {
      for (const s of [-1, 1]) {
        const size = 6 + rand() * 3.4;
        const x = s * (WALL_X + rand() * 1.8);
        const y = -1.8 - rand() * 1.6;
        const zz = z + (rand() - 0.5) * 1.2;
        const ry = rand() * Math.PI;
        wallPlacements.push({ x, y, z: zz, size, ry });
        if (rand() < 0.8) rims.push({ x, z: zz, topY: y + size * wallNormH - 0.25 });
      }
    }
    addInstancedProp(root, kit.wall, wallPlacements);

    // mesa de fond + buttes éparses
    const hexPlacements = [];
    for (let x = -13; x <= 13; x += 4.2) {
      hexPlacements.push({ x: x + (rand() - 0.5) * 2, y: -1.4, z: -31 - rand() * 4, size: 8.5 + rand() * 4, ry: rand() * Math.PI });
    }
    for (const [x, z, sz] of [[-16, 3, 9], [17, -9, 10.5], [-18, -19, 11], [16, -27, 10], [18, 13, 8.5]]) {
      hexPlacements.push({ x, y: -1.2, z, size: sz, ry: rand() * Math.PI });
    }
    addInstancedProp(root, kit.hex, hexPlacements);

    // végétation de rebord
    rims.forEach((r) => {
      const n = 1 + (rand() < 0.6 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const g = kit.rimProps[Math.floor(rand() * kit.rimProps.length)];
        place(g, r.x + (rand() - 0.5) * 2.4, r.topY, r.z + (rand() - 0.5) * 2.4,
          1.6 + rand() * 1.3, rand() * Math.PI);
      }
    });
  }

  const CANYON_KIT = {
    wall: gltf.blockTall,
    hex: gltf.cliffHex,
    rimProps: [gltf.hedge, gltf.tree, gltf.hedge, gltf.treePine, gltf.hedge, gltf.treePineSmall],
    edgeProps: [
      [gltf.tree,          -edge - 2.4,  -6,  4.2, 0.4],
      [gltf.treePine,       edge + 2.0, -12,  4.6, 1.1],
      [gltf.tree,           edge + 3.2,   4,  3.8, 2.2],
      [gltf.treePine,      -edge - 3.0,  10,  4.4, 0.7],
      [gltf.treePineSmall,  edge + 1.6,  18,  2.6, 0.2],
      [gltf.treePineSmall, -edge - 1.5, -18,  2.4, 1.5],
      [gltf.tree,           edge + 3.6, -22,  4.0, 0.9],
      [gltf.treePine,      -edge - 3.4, -24,  4.8, 2.6],
      [gltf.rocks,         -edge - 0.6, -16,  1.6, 0.3],
      [gltf.rocks,          edge + 0.6,  -2,  1.4, 1.9],
      [gltf.stones,        -edge - 0.5,  16,  1.2, 0.8],
      [gltf.stones,         edge + 0.7, -20,  1.1, 2.1],
      [gltf.hedge,          edge + 0.5,  14,  1.6, 0],
      [gltf.hedge,         -edge - 0.5,  -1,  1.6, 0],
      [gltf.flowers,       -edge - 0.2,   2,  1.0, 0.5],
      [gltf.flowers,        edge + 0.2,   8,  1.0, 1.7],
      [gltf.flowersTall,    edge + 0.3, -10,  1.4, 0.9],
      [gltf.flowersTall,   -edge - 0.3, -12,  1.3, 2.4],
      [gltf.mushrooms,     -edge - 0.4,  -3,  0.9, 1.2],
      [gltf.mushrooms,      edge + 0.4,  20,  0.9, 0.4],
      [gltf.plant,          edge + 0.3,   0,  1.1, 1.9],
      [gltf.plant,         -edge - 0.3,   6,  1.0, 0.6],
      [gltf.grassTuft,     -edge + 0.1, -8,   0.9, 0.3],
      [gltf.grassTuft,      edge - 0.1,  12,  0.9, 1.1],
      [gltf.grassTuft,     -edge + 0.2,  22,  0.8, 2.0],
      [gltf.grassTuft,      edge + 1.1,  -6,  0.8, 0.7],
    ],
  };
  const SNOW_KIT = {
    wall: gltf.blockSnowTall,
    hex: gltf.cliffSnowHex,
    rimProps: [gltf.treePineSnow, gltf.treeSnow, gltf.treePineSnow],
    edgeProps: [
      [gltf.treeSnow,      -edge - 2.4,  -6,  4.2, 0.4],
      [gltf.treePineSnow,   edge + 2.0, -12,  4.6, 1.1],
      [gltf.treeSnow,       edge + 3.2,   4,  3.8, 2.2],
      [gltf.treePineSnow,  -edge - 3.0,  10,  4.4, 0.7],
      [gltf.treePineSnow,   edge + 1.6,  18,  2.6, 0.2],
      [gltf.treePineSnow,  -edge - 1.5, -18,  2.4, 1.5],
      [gltf.treeSnow,       edge + 3.6, -22,  4.0, 0.9],
      [gltf.treePineSnow,  -edge - 3.4, -24,  4.8, 2.6],
      [gltf.rocks,         -edge - 0.6, -16,  1.6, 0.3],
      [gltf.rocks,          edge + 0.6,  -2,  1.4, 1.9],
      [gltf.stones,        -edge - 0.5,  16,  1.2, 0.8],
      [gltf.stones,         edge + 0.7, -20,  1.1, 2.1],
    ],
  };

  const envCanyon = new THREE.Group();
  buildEnvironment(envCanyon, CANYON_KIT);
  scene.add(envCanyon);
  const envSnow = new THREE.Group();
  buildEnvironment(envSnow, SNOW_KIT);
  envSnow.visible = false; // activé par le skin neige (levels/skins.js)
  scene.add(envSnow);

  // nuages procéduraux (3 sphères fusionnées, flat), drift en boucle
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: theme.colors.cloud });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    for (const [dx, dy, r] of [[0, 0, 1.4], [1.3, -0.2, 1.0], [-1.2, -0.15, 1.1]]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
      puff.position.set(dx, dy, 0);
      g.add(puff);
    }
    g.position.set((i - 1.5) * 9, 12 + (i % 2) * 2.5, -18 - i * 6);
    g.userData.driftSpeed = 0.4 + (i % 3) * 0.15;
    scene.add(g);
    clouds.push(g);
  }
  return { clouds, ground, road, envs: { canyon: envCanyon, snow: envSnow } };
}

function readVariantConfig(params) {
  try {
    if (window.__MOB_VARIANT__ && typeof window.__MOB_VARIANT__ === 'object') {
      return window.__MOB_VARIANT__;
    }
    const raw = params.get('variant');
    if (!raw) return null;
    const normalized = raw.trim().replace(/\s/g, '+').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (e) {
    console.warn('[MOB RUSH] config variant illisible', e);
    return null;
  }
}

function showAdOverlay(texts) {
  if (!Array.isArray(texts) || !texts.length) return null;
  let el = document.getElementById('adOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'adOverlay';
    el.style.cssText =
      'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:30;max-width:min(86vw,440px);' +
      'padding:12px 16px;border-radius:18px;background:rgba(0,0,0,.42);color:#fff;font:900 28px/1.08 Arial Rounded MT Bold,Arial,sans-serif;' +
      'text-align:center;pointer-events:none;text-shadow:0 3px 0 rgba(0,0,0,.5),0 0 18px var(--variant-glow);letter-spacing:.5px;';
    document.body.appendChild(el);
  }
  let shown = -1;
  let startT = null;
  return {
    reset(realT = 0) {
      shown = -1;
      startT = realT;
    },
    update(realT) {
      if (startT === null) startT = realT;
      const idx = Math.min(texts.length - 1, Math.floor((realT - startT) / AD_OVERLAY_STEP_S));
      if (idx === shown) return;
      shown = idx;
      el.textContent = texts[idx];
    },
  };
}

function configuredLoadout(variantConfig) {
  const loadout = variantConfig && variantConfig.loadout;
  return loadout === 'single' || loadout === 'double' || loadout === 'triple'
    ? loadout
    : C.LOADOUT_DEFAULT;
}

function configuredStartLevel(variantConfig) {
  const level = variantConfig && variantConfig.startLevel;
  return Number.isFinite(level) ? Math.max(1, Math.min(50, Math.round(level))) : null;
}

export async function createApp({ container = document.getElementById('game') } = {}) {
  const params = new URLSearchParams(location.search);
  const isDebug = params.has('debug');
  const variantConfig = readVariantConfig(params);
  const theme = resolveVariantTheme(variantConfig);
  applyThemeCss(theme);
  const adOverlay = showAdOverlay(variantConfig && variantConfig.overlayText);

  // 1. renderer + scène + lumières (CONTRACT §1.1 : NoToneMapping, hex inchangés, lumières ×π)
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, C.PIXEL_RATIO_MAX));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.colors.bg);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);

  // ciel dégradé (bleu zénith → crème à l'horizon) : remplace le fond indigo, s'accorde au
  // vert menthe de la piste, au sable du sol et aux falaises. Non affecté par le brouillard ;
  // FOG.color = teinte d'horizon → les reliefs lointains se fondent dans le ciel sans couture.
  {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const g2 = cv.getContext('2d');
    const grd = g2.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, `#${C.COLORS.skyTop.toString(16).padStart(6, '0')}`);      // zénith (haut = v→1)
    grd.addColorStop(0.34, `#${C.COLORS.skyMid.toString(16).padStart(6, '0')}`);
    grd.addColorStop(0.5, `#${C.COLORS.skyHorizon.toString(16).padStart(6, '0')}`);  // horizon (v=0.5)
    grd.addColorStop(1.0, `#${C.COLORS.skyHorizon.toString(16).padStart(6, '0')}`);
    g2.fillStyle = grd; g2.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(150, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    scene.add(dome);
  }

  const hemi = new THREE.HemisphereLight(C.LIGHTS.hemi.sky, C.LIGHTS.hemi.ground, C.LIGHTS.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(C.LIGHTS.dir.color, C.LIGHTS.dir.intensity);
  sun.position.set(...C.LIGHTS.dir.pos);
  scene.add(sun);

  // 2. caméra
  const cameraRig = createCameraRig({ renderer });
  const camera = cameraRig.camera;
  cameraRig.fit();

  // 3. préchargement + bake
  await preload(Object.values(ASSET_URLS));
  const gltf = {};
  for (const [k, url] of Object.entries(ASSET_URLS)) gltf[k] = getCached(url);
  if (isDebug) for (const [k, g] of Object.entries(gltf)) dumpInfo(g, k);

  const bakedUnit = bakeRunPose(gltf.maleA);

  // texture colormap partagée (lecture seule) — best effort
  let colormap = null;
  gltf.maleA.scene.traverse((o) => { if (!colormap && o.material && o.material.map) colormap = o.material.map; });

  const { clouds, ground, road, envs } = buildDecor(scene, gltf, theme); // refs retenues pour les skins de map

  // 4. librairies
  const time = createTime();
  const audio = createAudio();
  const particles = createParticles(scene);
  const confetti = createConfetti(scene);
  const floatingText = createFloatingText(scene);
  const vignette = createVignette();

  // 5. état (CONTRACT §2)
  const state = {
    level: 1, coins: 0, gems: 0, playerHp: C.PLAYER_HP_START,
    enemyHp: 50, enemyHpMax: 50, playing: false, bossLevel: false, bossSpawned: false, bossDefeated: false,
    loadout: configuredLoadout(variantConfig),
    championCharge: 0, championReady: false, championActive: false,
    fireTimer: 0, waveTimer: 0, holding: false, cannonX: 0, targetX: 0,
    blues: [], reds: [], champions: [], gates: [], obstacles: [], boosts: [], pops: particles.pops, // alias (A4)
  };
  // debug/test : ?level=N démarre directement au niveau N (layouts slalom/maze/horde testables)
  const forcedLevel = parseInt(params.get('level'), 10);
  const variantStartLevel = configuredStartLevel(variantConfig);
  if (Number.isFinite(forcedLevel) && forcedLevel > 0) state.level = Math.min(50, forcedLevel);
  else if (variantStartLevel !== null) state.level = variantStartLevel;

  // 6. contexte partagé (CONTRACT §4)
  const ctx = {
    scene, renderer, camera,
    time, cameraRig, audio, particles, confetti, floatingText, vignette,
    flyingCoins: null, // rempli juste après (closure sur ctx.sys.overlays)
    state,
    variant: variantConfig || {},
    theme,
    assets: { gltf, bakedUnit, colormap },
    decor: { ground, road, envs, hemi, sun }, // refs du décor persistant, pilotées par levels/skins.js
    sys: {},
  };

  ctx.flyingCoins = createFlyingCoins({
    coinPillEl: document.getElementById('coinPill'),
    onTick: (i) => ctx.sys.overlays && ctx.sys.overlays.handleCoinTick(i),
  });

  // 7. systèmes → ctx.sys (aucune interaction inter-système avant que ctx.sys soit complet)
  ctx.sys.cannon = createCannon(ctx);
  ctx.sys.crowd = createCrowd(ctx);
  ctx.sys.champion = createChampion(ctx);
  // Alliés : troupes = bleu plein animé (le champion garde son skin via champion.js).
  ctx.sys.heroes = createHeroes(ctx, {
    count: C.HERO_COUNT_BLUE,
    solidColor: theme.teams.player,
  });
  // Ennemis : troupes = rouge plein animé (le boss/les géants gardent leur skin via giants.js).
  ctx.sys.redHeroes = createHeroes(ctx, {
    count: C.HERO_COUNT_RED,
    getUnits: (c) => c.state.reds.filter((r) => !r.giant),
    bob: C.RED_BOB,
    faceBack: true,
    solidColor: theme.teams.enemy,
  });
  ctx.sys.gates = createGates(ctx);
  ctx.sys.skins = createSkins(ctx);
  ctx.sys.obstacles = createObstacles(ctx);
  ctx.sys.waves = createWaves(ctx);
  ctx.sys.giants = createGiants(ctx);
  ctx.sys.base = createBase(ctx);
  ctx.sys.levels = createLevels(ctx);
  ctx.sys.hud = createHud(ctx);
  ctx.sys.overlays = createOverlays(ctx, {
    onStart: () => {
      ctx.sys.overlays.hideAll();
      ctx.sys.hud.showGameHud();
      ctx.sys.levels.startLevel();
    },
    onNext: () => ctx.sys.levels.next(),
    onRetry: () => ctx.sys.levels.retry(),
  });

  // 8. inputs + overlays
  ctx.sys.cannon.attachInput(renderer.domElement);
  ctx.sys.overlays.bind();
  ctx.sys.hud.bindChampion(() => ctx.sys.champion.release());

  if (isDebug) window.__MOB__ = ctx;

  // lecteur de debug (compteurs live) — gated ?debug
  let dbgEl = null;
  if (isDebug) {
    dbgEl = document.createElement('div');
    dbgEl.style.cssText = 'position:fixed;top:60px;left:8px;z-index:9998;background:rgba(0,0,0,.7);' +
      'color:#0f0;font:11px monospace;padding:6px;white-space:pre;pointer-events:none;';
    document.body.appendChild(dbgEl);
  }
  const bakedVerts = bakedUnit && bakedUnit.geometry && bakedUnit.geometry.attributes.position
    ? bakedUnit.geometry.attributes.position.count : -1;

  // modes de test headless : bot = tir continu ; sim=SECONDES = pré-avance synchrone déterministe
  const isBot = params.has('bot');
  const isSim = params.has('sim');
  const simSeconds = isSim ? Math.min(60, Math.max(0, parseFloat(params.get('sim')) || 6)) : 0;

  const clock = new THREE.Clock();
  function frame(forcedRawDt) {
    time.update(forcedRawDt != null ? forcedRawDt : clock.getDelta());
    const dt = time.dt, t = time.t, rawDt = time.rawDt, realT = time.realT;

    if ((isBot || isSim) && state.playing) {
      state.holding = true;
      state.targetX = Math.sin(realT * 1.7) * (C.AIM_CLAMP * 0.9);
    }

    // ordre d'update CONTRACT §7.2 ; steps 2-7 re-testent state.playing (parité returns proto)
    ctx.sys.cannon.update(dt, t);                                    // 2 (tir gated interne ; respiration toujours)
    if (state.playing) ctx.sys.waves.spawnStep(dt);                 // 3
    if (state.playing) { ctx.sys.crowd.moveStep(dt, t); ctx.sys.gates.crossStep(dt, t); ctx.sys.obstacles.hitStep(dt, t); } // 4
    if (state.playing) ctx.sys.base.impactStep(dt, t);              // 5
    if (state.playing) ctx.sys.waves.moveStep(dt, t);               // 6
    if (state.playing) ctx.sys.waves.collideStep();                 // 7

    ctx.sys.champion.update(dt, t);
    ctx.sys.giants.update(dt, t);                                   // 8 (toujours)
    // 9 juice (toujours)
    ctx.sys.gates.update(dt, t);
    ctx.sys.obstacles.update(dt, t);
    ctx.sys.base.update(dt, t);
    particles.update(dt);
    confetti.update(dt);
    floatingText.update(dt);
    ctx.sys.heroes.update(dt, t);
    ctx.sys.redHeroes.update(dt, t);
    vignette.update(rawDt, realT);
    cameraRig.update(rawDt, realT);
    ctx.flyingCoins.update(rawDt);
    ctx.sys.hud.update(rawDt);
    ctx.sys.overlays.update(rawDt);
    if (state.playing) adOverlay?.update(realT);
    audio.update(rawDt);

    // ambiance : drift des nuages (temps réel)
    for (const cl of clouds) {
      cl.position.x += cl.userData.driftSpeed * rawDt;
      if (cl.position.x > 22) cl.position.x = -22;
    }

    // 10 rendu instances + 11 render
    ctx.sys.crowd.render(t);
    ctx.sys.waves.render(t);
    renderer.render(scene, camera);

    if (dbgEl) {
      dbgEl.textContent =
        `playing=${state.playing} t=${t.toFixed(2)} dt=${dt.toFixed(3)}\n` +
        `blues=${state.blues.length} reds=${state.reds.length} champs=${state.champions.length} gates=${state.gates.length}\n` +
        `cannonX=${state.cannonX.toFixed(2)} targetX=${state.targetX.toFixed(2)} fireT=${state.fireTimer.toFixed(2)} hold=${state.holding}\n` +
        `bakedVerts=${bakedVerts} hp=${state.enemyHp}/${state.enemyHpMax} pHp=${state.playerHp} champ=${state.championCharge.toFixed(0)}`;
    }
  }

  return {
    start() {
      ctx.sys.hud.refresh();
      adOverlay?.reset(0);
      if (params.has('autostart') || isBot || isSim) {
        ctx.sys.overlays.hideAll();
        ctx.sys.hud.showGameHud();
        ctx.sys.levels.startLevel();
      } else {
        ctx.sys.overlays.showStart();
      }
      // pré-avance synchrone déterministe (capture headless de N s de jeu)
      if (isSim) {
        const STEP = 1 / 30;
        const n = Math.min(2000, Math.round(simSeconds / STEP));
        for (let i = 0; i < n; i++) frame(STEP);
      }
      // ⚠ ne PAS passer `frame` directement : three appelle le callback avec le timestamp rAF (ms),
      // qui serait interprété comme forcedRawDt → dt figé à DT_MAX. On force l'usage de clock.getDelta().
      renderer.setAnimationLoop(() => frame());
    },
  };
}
