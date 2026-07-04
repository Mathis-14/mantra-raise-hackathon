// MOB RUSH — orchestrateur (CONTRACT §6.11 + ordre d'update §7.2).
// SEUL module qui : crée renderer/scene/lumières/décor, précharge les assets, construit ctx,
// instancie les systèmes, remplit ctx.sys, possède la boucle RAF.
import * as THREE from 'three';
import * as C from './constants.js';
import { preload, getCached, dumpInfo } from '../assets/loader.js';
import { bakeRunPose } from '../assets/bake-pose.js';
import { createTime } from './time.js';
import { createCameraRig } from './camera-rig.js';
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
import { createHud } from '../ui/hud.js';
import { createOverlays } from '../ui/overlays.js';

const GLB = '/models';
const MC = `${GLB}/mini-characters/Models/GLB%20format`;
const BK = `${GLB}/blaster-kit/Models/GLB%20format`;
const PK = `${GLB}/platformer-kit/Models/GLB%20format`;

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
  blockTall: `${PK}/block-grass-large-tall.glb`,
  blockLow: `${PK}/block-grass-low-large.glb`,
  flag: `${PK}/flag.glb`,
  brick: `${PK}/brick.glb`,
  stones: `${PK}/stones.glb`,
  rocks: `${PK}/rocks.glb`,
  tree: `${PK}/tree.glb`,
  treePine: `${PK}/tree-pine.glb`,
  hedge: `${PK}/hedge.glb`,
};

/** Décor procédural + props (CONTRACT §6.11 étape 2). Retourne les nuages (drift en boucle). */
function buildDecor(scene, gltf) {
  // piste
  const track = new THREE.Mesh(
    new THREE.BoxGeometry(C.TRACK.w, C.TRACK.h, C.TRACK.len),
    new THREE.MeshLambertMaterial({ color: C.COLORS.track }),
  );
  track.position.set(0, C.TRACK.y, C.TRACK.z);
  scene.add(track);

  // rails latéraux
  const railMat = new THREE.MeshLambertMaterial({ color: C.COLORS.rail });
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(C.RAIL.w, C.RAIL.h, C.RAIL.len), railMat);
    rail.position.set(s * C.RAIL.x, C.RAIL.y, C.RAIL.z);
    scene.add(rail);
  }

  // pointillés centraux
  const dashMat = new THREE.MeshLambertMaterial({ color: C.COLORS.dash });
  for (let z = C.DASH.zStart; z > C.DASH.zEnd; z += C.DASH.step) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(C.DASH.w, C.DASH.h, C.DASH.len), dashMat);
    d.position.set(0, C.DASH.y, z);
    scene.add(d);
  }

  // props hors piste (couleurs naturelles Kenney — environnement) — clones légers, sparses
  const placeProp = (g, x, z, s = 1, ry = 0) => {
    if (!g || !g.scene) return;
    const o = g.scene.clone(true);
    o.scale.setScalar(s);
    o.position.set(x, 0, z);
    o.rotation.y = ry;
    scene.add(o);
  };
  const edge = C.LANE_HALF + 2.6;
  placeProp(gltf.tree, -edge - 1.5, -6, 1.1, 0.4);
  placeProp(gltf.treePine, edge + 1.2, -12, 1.2, 1.1);
  placeProp(gltf.tree, edge + 2.0, 4, 1.0, 2.2);
  placeProp(gltf.treePine, -edge - 2.2, 10, 1.1, 0.7);
  placeProp(gltf.rocks, -edge - 0.6, -16, 1.2, 0.3);
  placeProp(gltf.rocks, edge + 0.5, -2, 1.0, 1.9);
  placeProp(gltf.hedge, edge + 0.4, 14, 1.0, 0);
  placeProp(gltf.hedge, -edge - 0.4, -1, 1.0, 0);

  // nuages procéduraux (3 sphères fusionnées, flat), drift en boucle
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf3f0ff });
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
  return clouds;
}

export async function createApp({ container = document.getElementById('game') } = {}) {
  const params = new URLSearchParams(location.search);
  const isDebug = params.has('debug');

  // 1. renderer + scène + lumières (CONTRACT §1.1 : NoToneMapping, hex inchangés, lumières ×π)
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, C.PIXEL_RATIO_MAX));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.COLORS.bg);
  scene.fog = new THREE.Fog(C.FOG.color, C.FOG.near, C.FOG.far);

  scene.add(new THREE.HemisphereLight(C.LIGHTS.hemi.sky, C.LIGHTS.hemi.ground, C.LIGHTS.hemi.intensity));
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

  const clouds = buildDecor(scene, gltf);

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
    loadout: C.LOADOUT_DEFAULT,
    championCharge: 0, championReady: false, championActive: false,
    fireTimer: 0, waveTimer: 0, holding: false, cannonX: 0, targetX: 0,
    blues: [], reds: [], champions: [], gates: [], obstacles: [], boosts: [], pops: particles.pops, // alias (A4)
  };

  // 6. contexte partagé (CONTRACT §4)
  const ctx = {
    scene, renderer, camera,
    time, cameraRig, audio, particles, confetti, floatingText, vignette,
    flyingCoins: null, // rempli juste après (closure sur ctx.sys.overlays)
    state,
    assets: { gltf, bakedUnit, colormap },
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
  ctx.sys.heroes = createHeroes(ctx);
  ctx.sys.gates = createGates(ctx);
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
    vignette.update(rawDt, realT);
    cameraRig.update(rawDt, realT);
    ctx.flyingCoins.update(rawDt);
    ctx.sys.hud.update(rawDt);
    ctx.sys.overlays.update(rawDt);
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
