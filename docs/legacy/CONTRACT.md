# CONTRACT.md — MOB RUSH : contrat d'interfaces Phase 2

> Artefact d'architecture (Fable). Ce document est **normatif** : il fixe les noms, signatures,
> structures de données et conventions que TOUS les agents d'implémentation doivent respecter à la
> lettre, afin de pouvoir écrire les modules **en parallèle** sans diverger.
>
> Préséance : `PLAN.md` (checklist de parité §5, constantes §4, tâches §7) > `CONTRACT.md` > choix
> d'implémentation locaux. Le prototype `game/mob-control-clone.html` est la référence de toutes les
> formules gameplay ; ce contrat les recopie — en cas de doute sur une formule, le prototype gagne.
> Tout blocage qui invaliderait ce contrat → `BLOCKERS.md` + retour à Fable (règle AGENT.md).
>
> Vocabulaire : **DOIT** = obligatoire ; **NE DOIT PAS** = interdit ; **PEUT** = laissé à
> l'implémenteur dans les bornes indiquées.

---

## 1. Conventions transverses (s'appliquent à tous les modules)

### 1.1 Politique couleur & lumière (three 0.185 vs r128 du prototype) — TRANCHÉ

Le prototype tourne sous r128 (aucun color management, sortie linéaire brute). three 0.185 active par
défaut `ColorManagement.enabled = true` et `renderer.outputColorSpace = SRGBColorSpace`. **Décision :
on garde le pipeline moderne par défaut et on compense les lumières.**

1. **NE PAS toucher** à `THREE.ColorManagement.enabled` ni à `renderer.outputColorSpace`
   (défauts conservés). `renderer.toneMapping` DOIT être laissé/forcé à `THREE.NoToneMapping`.
2. Toutes les couleurs de la palette sont déclarées avec les **hex du prototype, inchangés**
   (`new THREE.Color(0x2B1D6B)` etc.). Avec le color management actif, un hex est interprété comme
   sRGB puis ré-encodé en sRGB en sortie : une surface pleinement éclairée restitue le hex à l'écran,
   et le HUD CSS reste accordé à la scène.
3. **Compensation lumières** (migration r155, `useLegacyLights` supprimé) : les intensités du
   prototype DOIVENT être multipliées par π —
   `HemisphereLight(0xbfd4ff, 0x3a2a7a, 0.95 * Math.PI)` et
   `DirectionalLight(0xffffff, 0.85 * Math.PI)` position `(6, 14, 8)`.
4. Une **unique passe de calibration visuelle** est autorisée en T2 (comparaison côte à côte avec le
   prototype ouvert dans le navigateur) : elle ne peut ajuster QUE les deux intensités de lumière
   (jamais les hex de la palette, jamais le fog), et l'écart retenu DOIT être consigné dans
   `INTEGRATION.md`.
5. Les textures `colormap` des GLB sont taguées sRGB par `GLTFLoader` : ne rien changer. Toute
   `CanvasTexture` créée par code (recolor, portes, textes flottants) DOIT recevoir
   `texture.colorSpace = THREE.SRGBColorSpace`.

### 1.2 Règles de code (AGENT.md, rappel contraignant)

- `position/rotation/scale` : **toujours** muter via `.set()` / `.copy()` / affectation de composante ;
  **jamais** réassigner la propriété (`obj.position = v` est interdit).
- Tout SkinnedMesh DOIT être dupliqué via `SkeletonUtils.clone()`
  (`import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'`).
- `frustumCulled = false` sur **tous** les `InstancedMesh` (foules, pops, confettis, particules).
- **Jamais muter un matériau ou une texture partagés** : le matériau `colormap` est commun aux GLB
  chargés → cloner matériau ET texture avant toute teinte (voir `assets/recolor.js`).
- **Pas de `localStorage`** ni d'aucune persistance : pièces, mute, progression = mémoire de session.
- `AudioContext` créé **au premier geste utilisateur** (pointerdown), jamais avant.
- `dt` clampé à `0.05` ; `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Aucun fetch hors de `game/assets` (servi à la racine par Vite) ; aucun CDN ; aucune police externe.
- Noms de clips **exactement** : `sprint`, `walk`, `attack-melee-right`, `die`, `idle`, `static`
  (vérifiés sur les GLB — ne jamais supposer d'autres noms).

### 1.3 Conventions de modules

- ESM uniquement, **exports nommés** (pas de `export default`).
- Aucun effet de bord à l'import (exception : `core/constants.js`, données pures).
- **Modules-librairies** (§5) : purs ou auto-contenus ; ils NE DOIVENT PAS importer `GameState`, `ctx`
  ni un autre système. Dépendances autorisées : `three`, `core/constants.js`, `juice/springs.js`.
- **Modules-systèmes** (§6) : factory `createXxx(ctx)` retournant un objet de méthodes. Un système NE
  DOIT PAS importer un autre système ; toute interaction passe par `ctx.sys.<nom>` (rempli par
  `core/app.js` après création de tous les systèmes) et n'est utilisée que dans les méthodes appelées
  après init (jamais dans le corps de la factory).
- Aléatoire : `Math.random()` (parité prototype, pas de seed).
- Unités : 1 unité monde = celle du prototype. Personnages normalisés à **0.9 u de haut** (mesure de
  bounding box au bake, pas de constante devinée). Rayons de collision inchangés : `0.7` / `1.1` géant.

### 1.4 Timescale : hit-stop et slow-mo passent par `core/time.js`

- `time.dt` = delta **scalé** par le timescale global → utilisé par TOUTE la logique gameplay, les
  mixers d'animation, les particules/confettis/textes flottants, les springs de juice in-scene.
- `time.rawDt` = delta clampé **non scalé** → utilisé par : camera shake (le tremblement continue en
  slow-mo), vignette DOM, pièces volantes DOM, ghost fill du HUD, séquences d'overlay.
- Effets normés : **hit-stop mort de géant** = `time.pulse(0.05, 0.04)` (uniquement cet événement) ;
  **destruction finale de la base** = `time.pulse(0.25, 0.6)`. Personne d'autre ne touche au timescale.

---

## 2. Modèle d'état partagé : `GameState`

Créé par `core/app.js`, exposé via `ctx.state`. **Champs et valeurs initiales EXACTS du prototype.**
Un seul module « possède » l'écriture de chaque champ ; les autres lisent.

```js
/** @typedef {Object} GameState */
const state = {
  level: 1,          // int   — écrit par levels (next/retry)
  coins: 0,          // int   — écrit par levels (win : coins += 25 + 5*level)
  playerHp: 10,      // int   — reset par levels (10) ; décrémenté par waves (ligne franchie)
  enemyHp: 50,       // int   — reset par levels (40 + 15*level) ; décrémenté par base (impacts)
  enemyHpMax: 50,    // int   — écrit par levels (40 + 15*level)
  playing: false,    // bool  — écrit par levels (start/lose) et base (false au déclenchement destruction)
  fireTimer: 0,      // float s — écrit par cannon
  waveTimer: 0,      // float s — init 1.2 par levels ; décompté/rechargé par waves
  holding: false,    // bool  — écrit par cannon (pointerdown/up/cancel)
  cannonX: 0,        // float — écrit par cannon (lerp vers targetX)
  targetX: 0,        // float — écrit par cannon (raycast plan sol, clamp ±(LANE_HALF-0.8))
  blues: [],         // BlueUnit[] — possédé par crowd (spawn/kill) ; gates & base retirent VIA ctx.sys.crowd.killBlue
  reds:  [],         // RedUnit[]  — possédé par waves (spawn/mouvement/collisions/splice)
  gates: [],         // Gate[]     — possédé par gates (build/clear)
  pops:  [],         // Pop[]      — ALIAS : app fait `state.pops = particles.pops` à l'init (même référence)
};
```

Règles :
- Les tableaux sont **mutés en place** (`push`/`splice`/`length = 0`), jamais réassignés — les
  systèmes gardent des références.
- Aucun autre champ ne peut être ajouté à `state` sans passer par ce contrat (les états internes —
  trauma, timescale, mute, ghost ratio — vivent DANS leurs modules).

---

## 3. Formes des objets (structures exactes)

```js
/** Unité bleue — créée par crowd.spawnBlue() */
BlueUnit = {
  id: 1,             // int, compteur global monotone (unique toutes équipes) — pour le binding héros
  x: 0.0,            // clampé au spawn dans [-(LANE_HALF-0.3), +(LANE_HALF-0.3)]
  z: 18.8,           // spawn à PLAYER_Z - 1.2
  pz: 18.8,          // z du DÉBUT de frame — écrit par crowd.moveStep AVANT d'avancer (test de franchissement)
  wob: 0.0,          // phase aléatoire dans [0, 6.28)
  spawnT: 0.0,       // s écoulées depuis le spawn (temps scalé) — squash&stretch 150 ms
  viaGate: false,    // true si créé par une porte → rendu « saut latéral » pendant spawnT < 0.15
};

/** Unité rouge — créée par waves.spawnWave() */
RedUnit = {
  id: 2,             // int, même compteur
  x: 0.0,            // spawn : (Math.random()*2-1)*(LANE_HALF-0.6) ; géant : *(LANE_HALF-1)
  z: -22.0,          // spawn : BASE_Z + 2 + Math.random()*1.5 ; géant : BASE_Z + 2
  pz: -22.0,         // z du début de frame (symétrie, utilisé par la ligne de défaite)
  hp: 1,             // int — 1 normal, 5 géant ; décrémenté par les collisions (waves)
  giant: false,      // bool
  wob: 0.0,          // phase aléatoire ; géant : 0 (trajectoire droite, pas de wobble)
  spawnT: 0.0,       // squash&stretch au spawn (même formule que bleu)
  flashT: 0.0,       // s restantes de flash blanc (géant touché) — écrit par waves, lu par giants
};

/** Porte — créée par gates.build() */
Gate = {
  x: 0.0,            // ±(LANE_HALF/2 + 0.1)
  z: 7,              // rangées : 7 et -5
  halfW: 2.1,        // (LANE_HALF - 0.3) / 2
  op: 'x2',          // 'x2' | 'x3' | 'X'
  group: THREE.Group,        // racine scène (panneau + poteaux habillés)
  panel: THREE.Mesh,         // PlaneGeometry(LANE_HALF-0.3, 2.4), y = 1.3
  panelMat: THREE.MeshBasicMaterial, // CLONE dédié (CanvasTexture du texte) — jamais partagé
  flashT: 0.0,       // s restantes du flash ×2 (100 ms) après franchissement
  punchT: 0.0,       // s restantes du punch texte 1→1.3→1
};

/** Pop — parité prototype exacte (possédé par juice/particles, aliasé dans state.pops) */
Pop = { x: 0.0, z: 0.0, t: 0.0 };   // vie 0.3 s, scale 0.5 + 4t, y = 0.6, pool 60 (shift si plein)

/** Chunk de destruction de base — interne à enemy/base.js */
Chunk = { mesh: THREE.Object3D, vel: THREE.Vector3, angVel: THREE.Vector3, life: 0.0 };
```

CanvasTexture de panneau de porte (parité `gateTexture` du prototype) : canvas 256×128 ; fond
`rgba(0,229,255,0.28)` (bonne) / `rgba(255,60,90,0.30)` (✕) ; texte `bold 84px` centré, contour
`rgba(0,0,0,0.35)` épaisseur 10, remplissage `#aefcff` / `#ffd0d8` ; texte `'x2'`, `'x3'` ou `'✕'`.

---

## 4. Contexte partagé `ctx` (forme EXACTE)

Construit par `core/app.js` **après** préchargement des assets. Tous les systèmes le reçoivent.

```js
ctx = {
  // three
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,      // === cameraRig.camera

  // librairies instanciées (§5)
  time,          // createTime()
  cameraRig,     // createCameraRig({ renderer })
  audio,         // createAudio()
  particles,     // createParticles(scene)
  confetti,      // createConfetti(scene)
  floatingText,  // createFloatingText(scene)
  vignette,      // createVignette()
  flyingCoins,   // createFlyingCoins({ coinPillEl, onTick })  — câblé par ui/overlays

  // état
  state,         // GameState (§2)

  // assets préchargés (aucun système ne charge lui-même)
  assets: {
    gltf: {
      maleA, maleB, maleD, maleE,   // GLTF mini-characters (héros, géants)
      sunglasses,                   // aid-sunglasses.glb (accessoire géant, bone `head`)
      blaster,                      // blaster-b.glb (fût du canon)
      smoke,                        // smoke.glb (muzzle, optionnel)
      coinGold, star, flag, brick, stones, rocks,
      tree, treePine, hedge, jewel, blockTall, blockLow, // décor + base composite
    },
    bakedUnit: { geometry: THREE.BufferGeometry, height: 0.9 }, // pose sprint (bake-pose)
    colormap: THREE.Texture,      // texture partagée d'origine — LECTURE SEULE
  },

  // systèmes (§6) — rempli par app APRÈS création de tous ; jamais lu dans les factories
  sys: { cannon, crowd, heroes, gates, waves, giants, base, levels, hud, overlays },
};
```

---

## 5. MODULES-LIBRAIRIES (indépendants — constructibles en parallèle dès maintenant)

Aucun de ces modules ne connaît `GameState` ni `ctx`. Testables isolément.

### 5.1 `src/core/constants.js`

DOIT exporter les constantes nommées suivantes, **valeurs exactes**, gelées (`Object.freeze` pour les
objets). C'est la SEULE source de valeurs numériques gameplay : aucun littéral magique dans les
systèmes.

```js
// géométrie de jeu
export const LANE_HALF   = 4.5;
export const PLAYER_Z    = 20;
export const BASE_Z      = -24;
export const BLUE_HIT_Z  = -22.4;
export const RED_WIN_Z   = 20.5;
export const TRACK       = Object.freeze({ w: LANE_HALF*2 + 1, h: 1, len: 52, y: -0.5, z: -2 });
export const RAIL        = Object.freeze({ w: 0.5, h: 1.3, len: 52, x: LANE_HALF + 0.7, y: -0.3, z: -2 });
export const DASH        = Object.freeze({ w: 0.35, h: 0.05, len: 1.6, y: 0.03, zStart: 16, zEnd: -22, step: -4 });

// caps & vitesses
export const MAX_BLUE    = 170;    // arbitrage PLAN C3 (proto: 380)
export const MAX_RED     = 160;
export const BLUE_SPEED  = 9;
export const FIRE_DELAY  = 0.14;
export const PLAYER_HP_START = 10;

// canon / visée (parité)
export const AIM_CLAMP        = LANE_HALF - 0.8;   // clamp targetX
export const SPAWN_CLAMP      = LANE_HALF - 0.3;   // clamp x au spawnBlue
export const CANNON_LERP_K    = 14;                // cannonX += (targetX-cannonX)*min(1, dt*14)
export const CANNON_TILT      = 0.08;              // rotation.z = (targetX - cannonX) * 0.08
export const FIRE_JITTER_X    = 0.25;              // ±0.25  ((Math.random()-0.5)*0.5)
export const FIRE_SPAWN_DZ    = 1.2;               // spawn à PLAYER_Z - 1.2
export const BARREL_PUNCH     = 1.25;              // scale au tir
export const BARREL_RETURN_K  = 10;                // lerp retour min(1, dt*10)
export const BARREL_RECOIL    = 0.3;               // recul spring du fût (spec 5.1), en u

// niveaux (formules — fonctions pures)
export const enemyHpForLevel   = (lv) => 40 + lv * 15;
export const coinsForLevel     = (lv) => 25 + lv * 5;
export const wavePeriodForLevel= (lv) => Math.max(1.1, 2.4 - lv * 0.12);
export const waveSizeForLevel  = (lv) => 2 + Math.floor(lv * 1.3);
export const redSpeedForLevel  = (lv) => 3.6 + lv * 0.12;
export const WAVE_FIRST_DELAY  = 1.2;

// géant rouge
export const GIANT_MIN_LEVEL   = 2;
export const GIANT_PROBA       = 0.35;
export const GIANT_HP          = 5;
export const GIANT_SPEED       = 2.2;
export const GIANT_LINE_DAMAGE = 3;
export const GIANT_SCALE       = 2.1;

// collisions
export const UNIT_RADIUS  = 0.7;
export const GIANT_RADIUS = 1.1;

// portes
export const GATE_ROWS_Z     = Object.freeze([7, -5]);
export const GATE_WIDTH      = LANE_HALF - 0.3;
export const GATE_OFFSET_X   = LANE_HALF / 2 + 0.1;   // portes à -OFFSET et +OFFSET
export const GATE_X_MIN_LEVEL= 3;
export const GATE_X_PROBA    = 0.4;
export const GATE_CLONE_JITTER_X = 0.6;   // ±0.6  ((Math.random()-0.5)*1.2)
export const GATE_CLONE_BACK_Z   = 0.5;   // z - Math.random()*0.5
export const GATE_FLASH_DUR  = 0.1;       // flash panneau ×2, 100 ms
export const GATE_PUNCH_DUR  = 0.25;      // punch texte 1→1.3→1

// caméra
export const CAM = Object.freeze({ fov: 55, near: 0.1, far: 200,
  baseY: 17, baseZ: 30, kY: 10, kZ: 12, kBias: 0.55, lookAt: Object.freeze([0, 0, -3]) });
// fit : k = max(0, 1/aspect - CAM.kBias) ; pos(0, baseY + k*kY, baseZ + k*kZ) ; lookAt(...CAM.lookAt)
export const TRAUMA = Object.freeze({ decay: 1.5, maxOffset: 0.5, maxRoll: 0.06,
  giantDeath: 0.15, pop: 0.05, popFrameCap: 0.1, redCross: 0.4, crack: 0.3, baseDestroy: 0.6 });

// rendu / ambiance
export const COLORS = Object.freeze({
  bg: 0x2B1D6B, track: 0xEDE7FF, rail: 0x7C5CFF, dash: 0xCFC2FF,
  blue: 0x38B6FF, blueDark: 0x2D7DFF, red: 0xFF4D6D, redDark: 0xD63354,
  gold: 0xFFD54A, gateGood: 0x00E5FF, gateBad: 0xFF3C5A,
});
export const FOG = Object.freeze({ color: 0x2B1D6B, near: 55, far: 90 });
export const LIGHTS = Object.freeze({
  hemi: Object.freeze({ sky: 0xbfd4ff, ground: 0x3a2a7a, intensity: 0.95 * Math.PI }),
  dir:  Object.freeze({ color: 0xffffff, intensity: 0.85 * Math.PI, pos: Object.freeze([6, 14, 8]) }),
});
export const DT_MAX = 0.05;
export const PIXEL_RATIO_MAX = 2;

// unités : animation procédurale (parité)
export const UNIT_HEIGHT   = 0.9;                       // normalisation bake (bbox)
export const BLUE_BOB      = Object.freeze({ freq: 10, amp: 0.15 });
export const RED_BOB       = Object.freeze({ freq: 8,  amp: 0.12 });
export const BLUE_WOBBLE   = Object.freeze({ freq: 7,  amp: 0.4 });
export const RED_WOBBLE    = Object.freeze({ freq: 5,  amp: 0.5 });
export const SPAWN_SQUASH  = Object.freeze({ from: Object.freeze([1.3, 0.6, 1.3]), dur: 0.15 }); // spec 5.1
export const UNIT_LEAN     = 0.12;                      // rad, inclinaison avant (spec 5.2)
export const UNIT_FACING_FIX = Math.PI;                 // rotY pour que le modèle regarde -Z (à VALIDER en T3, seul point d'ajustement)

// base
export const BASE_SQUASH   = Object.freeze([1.08, 0.94, 1.08]);
export const BASE_RETURN_K = 8;
export const BASE_CRACK_RATIOS = Object.freeze([0.66, 0.33]);
export const BASE_DESTROY  = Object.freeze({ slowScale: 0.25, slowDur: 0.6, seqDur: 1.6, chunkMin: 8, chunkMax: 10 });

// pops / juice
export const POP_LIFE = 0.3;  export const POP_POOL = 60;  export const POP_Y = 0.6;
export const HITSTOP_GIANT = Object.freeze({ scale: 0.05, dur: 0.04 });
export const GHOST_DELAY = 0.4;          // ghost fill 400 ms
export const DANGER_DIST = 6;            // vignette si rouge à < 6 u de RED_WIN_Z
export const DING_WINDOW = 0.3;          // fenêtre 300 ms du pitch croissant
export const LEVEL_FLASH_DUR = 1.4;      // s
export const LOSE_BTN_DELAY = 0.3;       // boutons défaite +300 ms
export const STAR_STAGGER = 0.2;         // étoiles séquentielles 200 ms
export const COIN_FLY_COUNT = 12;        // sprites de pièces volantes par victoire
```

### 5.2 `src/core/time.js`

```js
/** Horloge de jeu : dt clampé + timescale global (hit-stop / slow-mo). */
export function createTime() {
  return {
    update(rawDtSeconds) {},   // appelé 1×/frame par app ; clampe à DT_MAX, gère les pulses, accumule t
    get dt() {},               // float — delta clampé × timescale (LE dt gameplay)
    get rawDt() {},            // float — delta clampé, non scalé (UI, shake)
    get t() {},                // float — temps de jeu cumulé en dt scalé (phases de bobbing)
    get realT() {},            // float — temps réel cumulé (bruit du shake)
    get timescale() {},        // float — valeur effective courante
    pulse(scale, durationSec) {}, // enclenche un ralenti : scale ∈ (0,1], durée en TEMPS RÉEL
    reset() {},                // purge les pulses, timescale → 1 (t conservé)
  };
}
```

Sémantique normée : la cible = `min(1, min des scales des pulses actifs)` (expiration en temps réel).
Descente **instantanée** (snap) quand la cible baisse ; remontée par approche exponentielle
`timescale += (1 - timescale) * (1 - exp(-10 * rawDt))` quand les pulses expirent.

### 5.3 `src/core/camera-rig.js`

```js
/** Caméra responsive (formule proto) + trauma shake (shake = trauma²). */
export function createCameraRig({ renderer }) {
  return {
    camera,                    // THREE.PerspectiveCamera(CAM.fov, aspect, CAM.near, CAM.far)
    fit() {},                  // formule proto : k=max(0,1/aspect-0.55); pos(0,17+k*10,30+k*12); lookAt(0,0,-3);
                               // updateProjectionMatrix ; renderer.setSize(innerWidth, innerHeight)
    addTrauma(amount) {},      // trauma = clamp(trauma + amount, 0, 1)
    setBaseYOffset(dy) {},     // défaite : -1 (appliqué à la position fit, PAS au shake)
    update(rawDt, realT) {},   // decay trauma (TRAUMA.decay/s), shake = trauma²,
                               // offsets pos.x/y = ±TRAUMA.maxOffset*shake, roll = ±TRAUMA.maxRoll*shake
                               // bruit déterministe: sin(realT*47.13), sin(realT*39.7+1.3), sin(realT*43.3+2.1)
  };
}
```

Le rig écrit la position finale = position fit + offset Y de défaite + offset de shake, chaque frame,
via `.set()`/`.copy()` (jamais de dérive cumulative : la base fit est recalculée, le shake s'ajoute).
Il pose lui-même son listener `resize` (appelle `fit()`).

### 5.4 `src/juice/springs.js` — helpers purs (aucun état)

```js
export function protoLerp(current, target, dt, k) {} // current + (target-current)*Math.min(1, dt*k)
                                                      // ⚠ PARITÉ : à utiliser pour canon, fût, squash base
export function damp(current, target, lambda, dt) {} // approche exp: + (target-current)*(1-exp(-lambda*dt))
export function dampVec3(vec, tx, ty, tz, lambda, dt) {} // in-place via .set — jamais de réassignation
export function spring(s, target, stiffness, damping, dt) {} // s = {x, v} muté in-place (recul du fût)
export function clamp(v, min, max) {}
export function clamp01(v) {}
export function lerp(a, b, u) {}
export function easeOutBack(u) {}   // pour punchs d'échelle (texte porte, étoiles)
```

### 5.5 `src/assets/loader.js`

```js
export function loadGLB(url) {}      // → Promise<GLTF> ; cache par URL : même URL ⇒ MÊME promesse (1 requête)
export function preload(urls) {}     // → Promise<GLTF[]> (Promise.all sur loadGLB)
export function getCached(url) {}    // → GLTF | undefined (synchrone, après preload)
export function dumpInfo(gltf, name) {} // log hiérarchie + clips {name, duration} — requis par le debug T3
```

Règles : un seul `GLTFLoader` interne. Les URLs de la table §8 sont **déjà encodées** (`%20`) : les
utiliser telles quelles. L'objet GLTF caché est l'ORIGINAL partagé : interdiction d'ajouter
`gltf.scene` à la scène ou de muter ses matériaux — toujours cloner (`skeletonClone` si skinné).

### 5.6 `src/assets/recolor.js`

```js
/** Matériau flat d'équipe pour les masses instanciées. UN matériau par hex, caché et PARTAGÉ
 *  volontairement (lecture seule après création) — MeshLambertMaterial({ color: hex }). */
export function teamMaterial(hex) {}          // → THREE.MeshLambertMaterial (caché par hex)

/** Recoloration de la palette-texture Kenney `colormap` : retourne une CanvasTexture NEUVE.
 *  Règle : pour chaque pixel, si saturation HSL ≥ 0.3 ET teinte hors plage peau [15°,50°],
 *  remplacer la teinte par celle de teamHex en conservant saturation/luminosité du pixel
 *  (préserve les rampes d'ombrage et la peau/visages). colorSpace = SRGBColorSpace.
 *  Cache par (texture.uuid, teamHex) : les clones d'une même équipe PARTAGENT la texture recolorée. */
export function makeTeamColormap(srcTexture, teamHex) {}   // → THREE.CanvasTexture

/** Applique la teinte d'équipe à un clone : traverse root, pour chaque Mesh/SkinnedMesh
 *  fait `mesh.material = mesh.material.clone()` puis `material.map = makeTeamColormap(map, teamHex)`.
 *  NE TOUCHE JAMAIS au matériau/texture d'origine. */
export function retintClone(root, teamHex) {} // → void
```

### 5.7 `src/assets/bake-pose.js`

```js
/** SkinnedMesh → BufferGeometry statique en pose de course.
 *  1) skeletonClone(gltf.scene) ; mixer joue `opts.clipName` figé à `opts.clipTime` ; updateMatrixWorld.
 *  2) Skinning CPU (boneTransform) sur `body-mesh` ET `head-mesh`, en espace racine du personnage.
 *  3) mergeGeometries(BufferGeometryUtils) → une géométrie (~723 tris), SANS matériau.
 *  4) Normalisation : pieds à y=0 (minY→0), recentrage x/z, scale uniforme pour bbox height = targetHeight.
 *  5) computeVertexNormals ; conserve les UV (utilisables avec colormap si besoin). */
export function bakeRunPose(gltf, opts = { clipName: 'sprint', clipTime: 0.25, targetHeight: 0.9 }) {}
// → { geometry: THREE.BufferGeometry, height: number, scale: number }
```

`clipTime: 0.25` = mi-foulée du clip `sprint` (durée vérifiée 0.5 s). Import requis :
`three/examples/jsm/utils/BufferGeometryUtils.js` (`mergeGeometries`).

### 5.8 `src/juice/particles.js`

```js
/** ParticleSystem InstancedMesh (pools, zéro allocation par émission, frustumCulled=false). */
export function createParticles(scene, { poolSize = 256 } = {}) {
  return {
    pops,                       // Pop[] — LE tableau aliasé dans state.pops (parité proto)
    pop(x, z) {},               // parité EXACTE : push {x,z,t:0}, shift si > POP_POOL(60)
                                //   rendu : sphère blanche, y=POP_Y, scale 0.5+4t, vie POP_LIFE
    burst(x, y, z, opts) {},    // opts: { count=6, color=0xffffff, speed=3, life=0.5, gravity=6,
                                //         size=0.18, shape='spark'|'star'|'quad' } — combat 5.4 (étoiles teintées)
    ring(x, z, color) {},       // anneau plat au sol qui s'étend et s'estompe (porte, 5.3)
    muzzle(x, y, z) {},         // flash de bouche 2 frames (~0.05 s) au bout du fût (5.1)
    update(dt) {},              // dt SCALÉ (gel pendant hit-stop)
    reset() {},                 // vide tous les pools (pops.length = 0 — jamais réassigner)
  };
}
```

Budget : ≤ 3 InstancedMesh au total (pops + particules génériques + anneaux). Sprites générés en
`CanvasTexture` au boot (cercle flou, étoile 4 branches, spark) — aucun asset externe.

### 5.9 `src/juice/confetti.js`

```js
export function createConfetti(scene) {
  return {
    burst(x, y, z, count = 150) {}, // quads InstancedMesh, vélocités coniques, gravité, rotations,
                                    // couleurs palette (blue, red, gold, blanc), vie ~2.5 s
    update(dt) {},                  // dt scalé (retombe au ralenti pendant le slow-mo de victoire ✔)
    reset() {},
  };
}
```

### 5.10 `src/juice/floating-text.js`

```js
/** Textes flottants IN-SCENE (sprites CanvasTexture) — JAMAIS de DOM (spec §3.6). */
export function createFloatingText(scene) {
  return {
    spawn(text, x, y, z, opts = {}) {}, // opts: { color='#ffffff', size=0.9, life=0.7, vy=2 }
                                        // usages : '+1'/'+2' portes, '-1' base, dégâts géant
    update(dt) {},                      // montée + fondu, dt scalé
    reset() {},
  };
}
```

Pool ≥ 24 sprites ; cache de canvases par `(text, color)` ; `texture.colorSpace = SRGBColorSpace`.

### 5.11 `src/juice/vignette.js`

```js
/** Pilote le DOM #dangerVignette (overlay). */
export function createVignette(el = document.getElementById('dangerVignette')) {
  return {
    setDanger(level01) {},   // 0..1 ; opacité pulsée = level*(0.55+0.25*sin(t*6)) ; 0 ⇒ invisible
    flash(ms = 80) {},       // flash rouge plein écran 80 ms (franchissement de ligne, 5.6)
    update(rawDt, realT) {}, // temps RÉEL (le DOM ne subit pas le slow-mo)
  };
}
```

### 5.12 `src/audio/synth.js`

```js
/** Synthèse WebAudio pure. Reçoit le contexte + noeud de sortie (créés par audio-manager). */
export function createSynth(audioCtx, outNode) {
  return {
    beep(freq, dur, type, vol) {},  // générique parité proto (osc + gain expRamp)
    ding() {},           // porte positive — OBLIGATOIREMENT synthétisé (AGENT.md) :
                         // base 660 Hz ; +1 demi-ton (×2^(1/12)) si appel < DING_WINDOW(0.3 s)
                         // après le précédent, sinon reset ; plafond +12 demi-tons
    alarm() {},          // sweep DESCENDANT 400→150 Hz, 0.25 s (franchissement de ligne)
    explosion() {},      // burst de bruit filtré passe-bas + sub (destruction base)
    jingleWin() {},      // parité proto : triangle 660 Hz/.12 s, puis 880/.15 à +130 ms, 1100/.25 à +280 ms
    jingleLose() {},     // 2 notes descendantes (sawtooth 200 Hz zone, ~.4 s)
    setHeartbeat(level01) {},  // battement grave ~2 Hz, gain ∝ level (danger 5.6) ; 0 ⇒ coupé
    setPatterLevel(level01) {},// boucle bruit filtré « pas de foule », volume = min(1, n/100) fourni par l'appelant
    startMusic() {}, stopMusic() {}, // séquenceur pentatonique ~110 BPM (sine+decay marimba), −12 dB sous SFX
  };
}
```

### 5.13 `src/audio/audio-manager.js`

```js
export const SFX = { /* table logique → fichiers, EXACTEMENT le mapping §8.2 */ };

export function createAudio() {
  return {
    unlock() {},                 // crée AudioContext + createSynth au 1er geste ; idempotent ;
                                 // lance le décodage des OGG préfetchés
    get synth() {},              // Synth | null (null avant unlock — les appelants doivent tolérer)
    play(name, opts = {}) {},    // opts: { rateJitter=0, volume=1 } — no-op silencieux avant unlock/mute
                                 // 'shoot' alterne pluck_001/002 avec rateJitter 0.1 (±10 %)
                                 // 'unitHit' throttlé ≤ 10/s (fenêtre glissante interne)
    setMuted(b) {}, toggleMute() {},  // mémoire de session UNIQUEMENT (pas de localStorage)
    update(rawDt) {},            // fenêtres de throttle
  };
}
```

Chargement : `fetch` des ArrayBuffers dès la création (URLs table §8.2), `decodeAudioData` après
`unlock()`. Pools de lecture (≥ 4 sources par nom). Master gain unique ; musique sur un gain séparé à
−12 dB.

### 5.14 `src/ui/flying-coins.js`

```js
/** Pièces volantes DOM : n sprites 🪙 en courbe de Bézier quadratique vers le compteur. */
export function createFlyingCoins({ coinPillEl, onTick }) {
  return {
    fly(count, fromXY = null) {},  // count sprites (échelonnés ~40 ms) ; départ fromXY {x,y} px ou centre écran ;
                                   // contrôle Bézier aléatoire latéral ; durée 0.6–1.0 s ; à CHAQUE arrivée :
                                   // retire le sprite + onTick(indexArrivé)
    update(rawDt) {},              // temps réel (DOM)
    get active() {},               // bool — vrai tant que des pièces volent
  };
}
```

`onTick` est fourni par `ui/overlays.js` (joue `coinTick`, incrémente l'affichage, punch le pill).

---

## 6. MODULES-SYSTÈMES (couplés à l'état — factory `createXxx(ctx)`)

Tous suivent : `const sys = createXxx(ctx)` ; interactions inter-systèmes via `ctx.sys.*` uniquement
dans les méthodes (jamais dans la factory). Toutes les méthodes `update`/`*Step` reçoivent
`(dt, t)` = `ctx.time.dt` / `ctx.time.t` sauf mention « rawDt ».

### 6.1 `src/crowd/cannon.js` — canon, visée, tir (voir Arbitrage A2)

```js
export function createCannon(ctx) {
  return {
    group,                     // THREE.Group à PLAYER_Z : socle procédural (box 2.2×1×2 bleu 0x2D7DFF
                               // + pivot) + fût = clone blaster-b recoloré bleu, pivot reculé à sa base
    attachInput(domElement) {},// pointerdown/move/up/cancel : raycast Plane(0,1,0) via ctx.camera ;
                               // state.targetX = clamp(hit.x, ±AIM_CLAMP) ; state.holding ;
                               // pointerdown appelle AUSSI ctx.audio.unlock()
    update(dt, t) {},          // si state.playing :
                               //   state.cannonX = protoLerp(cannonX, targetX, dt, CANNON_LERP_K)
                               //   group.position.x = cannonX ; group.rotation.z = (targetX-cannonX)*CANNON_TILT
                               //   state.fireTimer -= dt ; si holding && fireTimer<=0 :
                               //     fireTimer = FIRE_DELAY
                               //     ctx.sys.crowd.spawnBlue(cannonX + (Math.random()-0.5)*0.5, PLAYER_Z - FIRE_SPAWN_DZ)
                               //     juice 5.1 : punch fût ×BARREL_PUNCH (retour protoLerp k=10),
                               //     recul spring BARREL_RECOIL, ctx.particles.muzzle(...),
                               //     ctx.audio.play('shoot', { rateJitter: 0.1 }),
                               //     micro-tremble du canon (PAS de camera shake au tir)
                               // toujours (même !playing) : respiration ±2 % période 2 s (5.8)
    reset() {},                // cannonX = targetX = 0, springs à zéro
  };
}
```

### 6.2 `src/crowd/crowd.js` — masse bleue instanciée

```js
export function createCrowd(ctx) {
  return {
    spawnBlue(x, z, viaGate = false) {},
        // → bool ; refuse si state.blues.length >= MAX_BLUE (cap, parité)
        // push { id: nextId(), x: clamp(x, ±SPAWN_CLAMP), z, pz: z, wob: Math.random()*6.28,
        //        spawnT: 0, viaGate }
    killBlue(index) {},        // → BlueUnit retiré (splice) ; AUCUN effet (pop/son = à l'appelant)
    moveStep(dt, t) {},        // pour chaque bleu : u.pz = u.z ; u.z -= BLUE_SPEED*dt ;
                               // u.x += Math.sin(t*BLUE_WOBBLE.freq + u.wob)*dt*BLUE_WOBBLE.amp ;
                               // u.spawnT += dt
    render(t) {},              // écrit l'InstancedMesh (geometry ctx.assets.bakedUnit, material
                               // teamMaterial(COLORS.blue), count = blues.length, frustumCulled=false) :
                               // y = |sin(t*BLUE_BOB.freq + wob)|*BLUE_BOB.amp ; rotY = UNIT_FACING_FIX ;
                               // lean avant UNIT_LEAN ; squash&stretch spawn (SPAWN_SQUASH, 150 ms)
                               // ou arc de « saut latéral » si viaGate ; appelle AUSSI
                               // ctx.audio.synth?.setPatterLevel(Math.min(1, blues.length/100))
    reset() {},                // blues.length = 0
  };
}
```

### 6.3 `src/crowd/heroes.js` — clones animés du premier plan

```js
export function createHeroes(ctx, { count = 5 } = {}) {
  return {
    update(dt, t) {},   // miroir visuel : suit par id les `count` bleus logiques les plus proches du canon
                        // (re-binding quand une unité meurt) ; clones skeletonClone de maleA/B/D/E,
                        // retintClone(COLORS.blue), AnimationMixer clip `sprint`, offsets de time aléatoires,
                        // mixer.update(dt) (dt SCALÉ → gel en hit-stop) ; positions = position logique de
                        // l'unité suivie (mêmes bobbing/x/z) ; cachés si moins de `count` bleus
    reset() {},
  };
}
```

Zéro logique gameplay : les héros ne comptent pas, ne collisionnent pas — pur habillage (PLAN §3).

### 6.4 `src/gates/gates.js` — portes

```js
export function createGates(ctx) {
  return {
    build(level) {},    // parité buildGates : clear() ; pour chaque z de GATE_ROWS_Z :
                        //   ops = Math.random()<0.5 ? ['x2','x3'] : ['x3','x2']
                        //   si level>=GATE_X_MIN_LEVEL && Math.random()<GATE_X_PROBA :
                        //     ops[Math.floor(Math.random()*2)] = 'X'
                        //   makeGate(-GATE_OFFSET_X, z, ops[0]) ; makeGate(+GATE_OFFSET_X, z, ops[1])
                        // visuel : panneau CanvasTexture (§3), poteaux habillés, matériaux CLONÉS par porte
    clear() {},         // retire les groups de la scène ; state.gates.length = 0
    crossStep(dt, t) {},// APRÈS crowd.moveStep — pour chaque bleu (itération DESCENDANTE), chaque porte :
                        //   franchie si u.pz > g.z && u.z <= g.z && |u.x - g.x| < g.halfW
                        //   'X'  : ctx.particles.pop(u.x, u.z) ; ctx.sys.crowd.killBlue(i) ;
                        //          ctx.audio.play('gateBad') ; break (parité)
                        //   'x2' : 1 clone ; 'x3' : 2 clones — chacun :
                        //          ctx.sys.crowd.spawnBlue(u.x + (Math.random()-0.5)*1.2,
                        //                                  u.z - Math.random()*0.5, /*viaGate*/ true)
                        //   juice 5.3 : g.flashT = GATE_FLASH_DUR ; g.punchT = GATE_PUNCH_DUR ;
                        //   ctx.particles.ring(g.x, g.z, COLORS.gateGood) ;
                        //   ctx.floatingText.spawn(op==='x3' ? '+2' : '+1', u.x, 1.6, g.z) ;
                        //   ctx.audio.synth?.ding()
    update(dt, t) {},   // decay flashT/punchT, pulse émissif lent des panneaux (toujours, même !playing)
  };
}
```

Note parité : les clones spawnés pendant `crossStep` ont `pz === z` → ils ne re-franchissent pas la
porte dans la même frame (équivalent au comportement du prototype, boucle descendante).

### 6.5 `src/enemy/waves.js` — vagues rouges, ligne de défaite, collisions

```js
export function createWaves(ctx) {
  return {
    spawnStep(dt) {},        // state.waveTimer -= dt ; si <= 0 :
                             //   waveTimer = wavePeriodForLevel(level) ; spawnWave()
    spawnWave() {},          // count = waveSizeForLevel(level) ; pour i<count && reds.length<MAX_RED :
                             //   push { id, x:(Math.random()*2-1)*(LANE_HALF-0.6),
                             //          z: BASE_Z+2+Math.random()*1.5, pz:=z, hp:1, giant:false,
                             //          wob: Math.random()*6.28, spawnT:0, flashT:0 }
                             // puis si level>=GIANT_MIN_LEVEL && Math.random()<GIANT_PROBA && reds.length<MAX_RED :
                             //   push géant { x:(Math.random()*2-1)*(LANE_HALF-1), z:BASE_Z+2, hp:GIANT_HP,
                             //                giant:true, wob:0, ... }
    moveStep(dt, t) {},      // itération DESCENDANTE : sp = giant ? GIANT_SPEED : redSpeedForLevel(level) ;
                             // r.pz=r.z ; r.z += sp*dt ; si !giant : r.x += sin(t*5+wob)*dt*0.5 ;
                             // si r.z >= RED_WIN_Z : splice ; state.playerHp -= giant?3:1 ;
                             //   ctx.particles.pop(r.x, RED_WIN_Z) ; ctx.audio.synth?.alarm() ;
                             //   ctx.cameraRig.addTrauma(TRAUMA.redCross) ; ctx.vignette.flash(80) ;
                             //   navigator.vibrate?.(80) ; ctx.sys.hud.refresh() ;
                             //   si playerHp <= 0 : ctx.sys.levels.lose() ; return
                             // puis : ctx.vignette.setDanger(max sur les rouges de
                             //   clamp01((r.z - (RED_WIN_Z - DANGER_DIST)) / DANGER_DIST)) ;
                             //   ctx.audio.synth?.setHeartbeat(même valeur)
    collideStep() {},        // parité EXACTE : pour i rouges DESC : rad = giant?1.1:0.7 ;
                             //   pour j bleus DESC : si |b.z-r.z| > rad → continue ;
                             //   si dx²+dz² < rad² : ctx.sys.crowd.killBlue(j) ; r.hp-- ;
                             //     ctx.particles.pop(r.x, r.z) ; ctx.audio.play('unitHit') ;
                             //     si giant : r.flashT = 0.1 ; ctx.sys.giants.onGiantHit(r, 1) ;
                             //     si r.hp <= 0 : splice(i) ;
                             //       si giant : ctx.sys.giants.onGiantDeath(r) sinon petit burst + son ;
                             //       break
    render(t) {},            // InstancedMesh rouge (bakedUnit + teamMaterial(COLORS.red)) — UNIQUEMENT
                             // les non-géants ; y = |sin(t*8+wob)|*RED_BOB.amp ; face +Z ; squash spawn
    reset() {},              // reds.length = 0 ; waveTimer non touché (levels s'en charge)
  };
}
```

### 6.6 `src/enemy/giants.js` — visuels des géants + juice 5.4

```js
export function createGiants(ctx) {
  return {
    update(dt, t) {},        // pour chaque red géant : obtient/crée un clone animé (skeletonClone maleA,
                             // retintClone(COLORS.red), scale GIANT_SCALE, sunglasses attachées au bone `head`,
                             // clip `sprint` timeScale 0.7, mixer.update(dt)) ; synchronise position/rotation ;
                             // flash blanc émissif ∝ r.flashT (matériau du CLONE uniquement) ;
                             // recycle les clones des géants disparus (pool par id)
    onGiantHit(red, dmg) {}, // ctx.floatingText.spawn('-'+dmg, red.x, 2.4, red.z, {color:'#fff'})
    onGiantDeath(red) {},    // anim `die` (0.333 s) sur le clone puis recyclage ;
                             // ctx.time.pulse(HITSTOP_GIANT.scale, HITSTOP_GIANT.dur)  ← SEUL hit-stop
                             // ctx.cameraRig.addTrauma(TRAUMA.giantDeath) ;
                             // ctx.particles.burst(red.x, 1.2, red.z, { color: COLORS.red, shape:'star', count: 4 })
    reset() {},
  };
}
```

### 6.7 `src/enemy/base.js` — base ennemie composite

```js
export function createBase(ctx) {
  return {
    build(level) {},         // (re)construit la tour composite à (0,0,BASE_Z) : 2×2 blockTall empilés +
                             // blockLow en couronne + flag au sommet — clones recolorés rouge (retintClone
                             // ou teamMaterial suivant le mesh), état intact, drapeau à plat
    impactStep(dt, t) {},    // APRÈS gates.crossStep — itération DESCENDANTE des bleus :
                             //   si u.z <= BLUE_HIT_Z : state.enemyHp-- ; ctx.particles.pop(u.x, u.z) ;
                             //     ctx.sys.crowd.killBlue(i) ; squash groupe BASE_SQUASH (retour protoLerp k=8) ;
                             //     ctx.audio.play('baseHit') ; ctx.floatingText.spawn('-1', u.x, 3.2, BASE_Z+2,
                             //       {color:'#ff8fa3'}) ; ctx.sys.hud.refresh() ;
                             //   paliers : au passage sous 66 %/33 % de enemyHpMax → état de dégâts suivant
                             //     (blocs désaxés, decals fissures CanvasTexture, couronne retirée à l'état 3),
                             //     ctx.audio.play('crack') ; ctx.cameraRig.addTrauma(TRAUMA.crack) ;
                             //   si enemyHp <= 0 : déclenche la séquence de destruction (une seule fois) :
                             //     state.playing = false ; ctx.time.pulse(0.25, 0.6) ;
                             //     ctx.audio.synth?.explosion() + play('rubble') ;
                             //     ctx.cameraRig.addTrauma(TRAUMA.baseDestroy) ;
                             //     tour → 8–10 chunks (brick×4, stones×2, rocks×2 + blocs) vélocités
                             //     radiales + gravité ; ctx.confetti.burst(0, 3, BASE_Z) ;
                             //     après BASE_DESTROY.seqDur (temps réel) : ctx.sys.levels.win()
    update(dt, t) {},        // TOUJOURS appelé (même !playing) : retour de squash, physique des chunks,
                             //   ondulation sinusoïdale du drapeau (5.8)
    reset(level) {},         // build(level) + purge chunks/états
  };
}
```

### 6.8 `src/levels/levels.js` — configuration + flow de partie

```js
export function createLevels(ctx) {
  return {
    configFor(level) {},     // → { enemyHpMax, coinGain, wavePeriod, waveSize, redSpeed,
                             //     giantAllowed, xGateAllowed }  (pures formules de constants.js)
    startLevel() {},         // ORDRE PARITÉ startLevel proto :
                             //   crowd.reset() ; waves.reset() ; particles.reset() ; confetti.reset() ;
                             //   floatingText.reset() ; giants.reset() ; heroes.reset() ; cannon.reset() ;
                             //   time.reset() ; cameraRig.setBaseYOffset(0) ; désaturation retirée ;
                             //   state.playerHp = PLAYER_HP_START ;
                             //   state.enemyHpMax = state.enemyHp = enemyHpForLevel(state.level) ;
                             //   state.waveTimer = WAVE_FIRST_DELAY ;
                             //   gates.build(state.level) ; base.reset(state.level) ;
                             //   hud.refresh() ; hud.flashLevel() ; state.playing = true
    win() {},                // appelé par base APRÈS la séquence de destruction :
                             //   gain = coinsForLevel(state.level) ; state.coins += gain ;
                             //   audio.synth?.jingleWin() ; overlays.showWin(gain)
    lose() {},               // state.playing = false ; audio.synth?.jingleLose() ;
                             //   désaturation (#game → filter grayscale(0.6), 5.6) ;
                             //   cameraRig.setBaseYOffset(-1) ; overlays.showLose()
    next() {},               // state.level++ ; overlays.hideAll() ; startLevel()
    retry() {},              // overlays.hideAll() ; startLevel()
  };
}
```

`levels/boss.js` (P2, T18) : nom réservé — `export function createBoss(ctx)`, spécifié après le gate T14.

### 6.9 `src/ui/hud.js`

```js
export function createHud(ctx) {
  return {
    refresh() {},            // parité refreshUI : levelPill 'NIV '+level ; coinPill '🪙 '+coinsAffichés ;
                             // playerHpVal ; enemyFill.width = max(0, enemyHp/enemyHpMax*100)+'%'
                             // (le ghost NE bouge PAS ici)
    flashLevel() {},         // 'NIVEAU '+level, animation opacité 1.4 s (keyframes parité proto)
    punchCoins() {},         // scale 1.25→1 du coinPill (transition CSS)
    setDisplayedCoins(v) {}, // compteur qui « roule » pendant les pièces volantes
    showGameHud() {}, hideGameHud() {}, // enemyHp/playerHp/hint : classe .hidden
    update(rawDt) {},        // GHOST FILL : quand le ratio HP baisse, enemyGhost garde l'ancienne largeur
                             // GHOST_DELAY (0.4 s) puis rejoint enemyFill par damp(λ=8) — temps réel
  };
}
```

Ids DOM (index.html, EXACTS) : `topbar levelPill coinPill enemyHp enemyBar enemyGhost enemyFill
playerHp playerHpVal hint levelFlash levelFlashTxt dangerVignette startOverlay startBtn winOverlay
winCoins nextBtn loseOverlay retryBtn`. `hud.js` est le SEUL module (avec overlays/vignette/flying-coins)
autorisé à toucher le DOM.

### 6.10 `src/ui/overlays.js`

```js
export function createOverlays(ctx, { onStart, onNext, onRetry }) {
  return {
    bind() {},            // câble startBtn/nextBtn/retryBtn (click → callbacks + audio.play('click')/'clickUp') ;
                          // applique les 9-slice UI Pack aux .btn : border-image
                          //   start/next = Blue, retry = Red (fichiers §8.3), slice 16 fill (ajustable
                          //   visuellement en T10, l'asset est fixé) ; press = translateY conservé (parité)
    showStart() {},
    showWin(gain) {},     // affiche winOverlay ; winCoins '+gain 🪙' ; 3 étoiles séquentielles :
                          //   éléments <img> injectés par overlays (star.png Yellow, spring easeOutBack,
                          //   STAR_STAGGER 200 ms entre elles + audio.play('coinTick') chacune) ;
                          //   pièces volantes : ctx.flyingCoins.fly(COIN_FLY_COUNT) avec onTick →
                          //   audio.play('coinTick') + hud.setDisplayedCoins(+gain/12) + hud.punchCoins() ;
                          //   bouton next pulse scale 1→1.05 période 1.2 s
    showLose() {},        // affiche loseOverlay ; retryBtn inerte pendant LOSE_BTN_DELAY (0.3 s)
    hideAll() {},
    update(rawDt) {},     // timings d'étoiles/delays — temps réel
  };
}
```

### 6.11 `src/core/app.js` — orchestrateur

```js
/** Bootstrap complet. SEUL module qui : crée renderer/scene/lights/décor, précharge les assets,
 *  construit ctx, instancie les systèmes, remplit ctx.sys, possède la boucle RAF. */
export async function createApp({ container = document.getElementById('game') } = {}) {
  // 1. renderer (antialias, pixelRatio ≤ 2, NoToneMapping) ; scene (bg + fog §1.1/constants) ; lumières
  // 2. cameraRig ; décor procédural (piste/rails/pointillés TRACK/RAIL/DASH) + props hors piste + nuages
  // 3. await preload(ASSET_URLS) ; bakedUnit = bakeRunPose(maleA) ; ctx.assets
  // 4. librairies : time, audio, particles (state.pops = particles.pops), confetti, floatingText, vignette
  // 5. state (§2) ; ctx (§4)
  // 6. systèmes : cannon, crowd, heroes, gates, waves, giants, base, levels, hud, overlays → ctx.sys
  // 7. cannon.attachInput(renderer.domElement) ; overlays.bind() avec
  //    onStart = () => { hud.showGameHud(); levels.startLevel(); }
  //    onNext = levels.next ; onRetry = levels.retry
  // 8. si location.search contient 'debug' : dumpInfo de chaque GLB + window.__MOB__ = ctx
  return { start() {} };   // start() : overlays.showStart() ; hud.refresh() ; lance la boucle §7
}
```

### 6.12 `src/main.js` — point d'entrée (une dizaine de lignes, réécrit par l'orchestrateur)

```js
import { createApp } from './core/app.js';
createApp()
  .then((app) => app.start())
  .catch((err) => { console.error('[MOB RUSH] boot failed', err); });
```

---

## 7. Cycle de vie & ordre d'update par frame (NORMATIF)

### 7.1 Boot

`main.js → createApp()` : politique couleur → renderer/scène/lumières/décor → préchargement §8.1 →
bake → librairies → state → ctx → systèmes → ctx.sys → inputs/overlays → `start()` (overlay start +
RAF). `AudioContext` : uniquement dans `audio.unlock()` au premier pointerdown.

### 7.2 Boucle (ordre PLAN §2, chaque étape = un appel explicite de l'app)

| # | Appel | Gating |
|---|---|---|
| 1 | `time.update(clock.getDelta())` | toujours |
| 2 | `sys.cannon.update(dt, t)` — visée, tir (spawn bleus), juice 5.1, respiration | tir/visée si `playing` ; respiration toujours |
| 3 | `sys.waves.spawnStep(dt)` — vagues | si `playing` |
| 4 | `sys.crowd.moveStep(dt, t)` puis `sys.gates.crossStep(dt, t)` | si `playing` |
| 5 | `sys.base.impactStep(dt, t)` — impacts, paliers, déclenchement destruction | si `playing` |
| 6 | `sys.waves.moveStep(dt, t)` — mouvements rouges + ligne de défaite + danger | si `playing` |
| 7 | `sys.waves.collideStep()` — collisions bleu/rouge | si `playing` |
| 8 | `sys.giants.update(dt, t)` — sync clones, flash, morts | toujours (anims visibles) |
| 9 | Juice : `sys.gates.update(dt,t)` ; `sys.base.update(dt,t)` (chunks/drapeau) ; `particles.update(dt)` ; `confetti.update(dt)` ; `floatingText.update(dt)` ; `sys.heroes.update(dt,t)` ; `vignette.update(rawDt, realT)` ; `cameraRig.update(rawDt, realT)` ; `flyingCoins.update(rawDt)` ; `sys.hud.update(rawDt)` ; `sys.overlays.update(rawDt)` ; `audio.update(rawDt)` | toujours |
| 10 | Rendu instances : `sys.crowd.render(t)` ; `sys.waves.render(t)` | toujours (foules figées visibles sous les overlays, parité) |
| 11 | `renderer.render(scene, camera)` | toujours |

Les étapes 2–7 sont **court-circuitées dès que `state.playing` passe à false en cours de frame**
(défaite/destruction) : chaque step re-teste `state.playing` à son entrée (parité des `return` du
prototype).

### 7.3 Transitions

- **start / next / retry** → `levels.startLevel()` (ordre de reset EXACT §6.8).
- **victoire** : `base.impactStep` détecte `enemyHp <= 0` → `playing=false` + séquence destruction
  (slow-mo 0.25×600 ms, chunks, confettis, explosion) → après 1.6 s réelles `levels.win()` → overlay
  (étoiles, pièces volantes, jingle).
- **défaite** : `waves.moveStep` détecte `playerHp <= 0` → `levels.lose()` (désaturation, caméra −1 u,
  jingle lose, boutons +300 ms).

---

## 8. Table des chemins d'assets (URLs finales, vérifiées sur disque — `publicDir: game/assets`)

Les URLs sont **pré-encodées** (`%20`) et utilisées telles quelles par `loader.js` / `audio-manager.js`.

### 8.1 Modèles (préchargés au boot par `app.js`)

| Clé `ctx.assets.gltf` | URL |
|---|---|
| `maleA` (bake masse + héros + géant) | `/models/mini-characters/Models/GLB%20format/character-male-a.glb` |
| `maleB`, `maleD`, `maleE` (héros) | `/models/mini-characters/Models/GLB%20format/character-male-{b,d,e}.glb` |
| `sunglasses` (accessoire géant) | `/models/mini-characters/Models/GLB%20format/aid-sunglasses.glb` |
| `blaster` (fût canon) | `/models/blaster-kit/Models/GLB%20format/blaster-b.glb` |
| `smoke` (muzzle, optionnel) | `/models/blaster-kit/Models/GLB%20format/smoke.glb` |
| `coinGold` | `/models/platformer-kit/Models/GLB%20format/coin-gold.glb` |
| `star` | `/models/platformer-kit/Models/GLB%20format/star.glb` |
| `flag` | `/models/platformer-kit/Models/GLB%20format/flag.glb` |
| `brick`, `stones`, `rocks` (chunks) | `/models/platformer-kit/Models/GLB%20format/{brick,stones,rocks}.glb` |
| `tree`, `treePine`, `hedge`, `jewel` (décor) | `/models/platformer-kit/Models/GLB%20format/{tree,tree-pine,hedge,jewel}.glb` |
| `blockTall`, `blockLow` (base composite) | `/models/platformer-kit/Models/GLB%20format/block-grass-{large-tall,low-large}.glb` |
| P2 : conveyor (T16), oozi (T18) | `/models/platformer-kit/Models/GLB%20format/{conveyor-belt,character-oozi}.glb` |

Nuage : AUCUN asset — procédural (3 sphères fusionnées, flat), cf. PLAN §1.6.

### 8.2 Sons — table `SFX` de `audio-manager.js` (noms logiques NORMATIFS)

| Nom logique | Fichier(s) | Note |
|---|---|---|
| `shoot` | `/sounds/interface-sounds/Audio/pluck_001.ogg` + `pluck_002.ogg` | alternés, rate ±10 % |
| `gateBad` | `/sounds/interface-sounds/Audio/error_004.ogg` | porte ✕ |
| `unitHit` | `/sounds/interface-sounds/Audio/drop_002.ogg` | throttle ≤ 10/s |
| `baseHit` | `/sounds/interface-sounds/Audio/bong_001.ogg` (+ couche `scratch_001.ogg` légère) | |
| `crack` | `/sounds/interface-sounds/Audio/scratch_002.ogg` (palier 66 %) / `scratch_003.ogg` (33 %) | |
| `rubble` | `/sounds/interface-sounds/Audio/scratch_004.ogg` | couche avec `synth.explosion()` |
| `coinTick` | `/sounds/interface-sounds/Audio/tick_001.ogg` / `tick_002.ogg` / `tick_004.ogg` | rotation |
| `click` / `clickUp` | `/ui/ui-pack/Sounds/click-a.ogg` / `click-b.ogg` | boutons |
| (alternatives non câblées) | `confirmation_002.ogg`, `back_002.ogg` | si les jingles synthé déçoivent |

Synthétisés (jamais des fichiers) : `ding`, `alarm`, `explosion`, `jingleWin`, `jingleLose`,
`heartbeat`, `patter`, musique.

### 8.3 Sprites UI (CSS `url()` — chemins absolus depuis la racine servie)

| Usage | Fichier |
|---|---|
| Bouton start/next (9-slice) | `/ui/ui-pack/PNG/Blue/Default/button_rectangle_depth_gradient.png` |
| Bouton retry (9-slice) | `/ui/ui-pack/PNG/Red/Default/button_rectangle_depth_gradient.png` |
| Étoile pleine (victoire) | `/ui/ui-pack/PNG/Yellow/Default/star.png` |
| Étoile creuse (avant spring) | `/ui/ui-pack/PNG/Grey/Default/star_outline_depth.png` |
| Icônes disponibles (optionnel) | `/ui/ui-pack/PNG/Extra/Default/icon_play_light.png`, `icon_repeat_light.png` |

Typo : stack système arrondie déjà dans `index.html` — Kenney Future INTERDITE (AGENT.md). Icônes
manquantes = emoji système (parité proto : 🪙 🛡️ 👆 🎉 💥).

---

## 9. Répartition parallèle (résumé opérationnel)

**Vague A — librairies, AUCUNE dépendance croisée (parallélisables immédiatement)** :
`core/constants.js` · `core/time.js` · `core/camera-rig.js` · `juice/springs.js` · `assets/loader.js`
· `assets/recolor.js` · `assets/bake-pose.js` · `juice/particles.js` · `juice/confetti.js` ·
`juice/floating-text.js` · `juice/vignette.js` · `audio/synth.js` · `audio/audio-manager.js` ·
`ui/flying-coins.js`.

**Vague B — systèmes (dépendent de ctx §4 + Vague A ; parallélisables ENTRE EUX car ils ne
s'importent jamais)** : `crowd/cannon.js` · `crowd/crowd.js` · `crowd/heroes.js` · `gates/gates.js` ·
`enemy/waves.js` · `enemy/giants.js` · `enemy/base.js` · `levels/levels.js` · `ui/hud.js` ·
`ui/overlays.js`.

**Vague C — intégration (séquentiel, un seul agent)** : `core/app.js` puis `main.js`.

---

## 10. Arbitrages du contrat (points que PLAN.md ne tranchait pas explicitement)

- **A1 — Politique couleur** : pipeline moderne conservé + lumières ×π + calibration bornée (§1.1).
  Rejeté : désactiver `ColorManagement` pour mimer r128 — casserait le rendu des textures sRGB des GLB
  et serait fragile aux futures versions de three.
- **A2 — `crowd/cannon.js`** : l'arborescence PLAN §2 n'a pas de fichier pour le canon (tâche T4).
  Créé sous `crowd/` (il produit la foule bleue). L'input pointeur vit dans ce module
  (`attachInput`), qui possède aussi `state.holding/targetX/cannonX/fireTimer`.
- **A3 — Découpe de la boucle proto en systèmes** : le prototype mêle mouvement/portes/impacts dans
  une seule boucle. Découpé en steps ordonnés (§7.2) avec le champ `pz` (z de début de frame) porté
  par l'unité pour préserver la sémantique exacte du test de franchissement. Les collisions restent
  dans `waves.js` (`collideStep`) : c'est lui qui possède `reds` et l'issue (r.hp) — PLAN n'attribuait
  pas ce bloc.
- **A4 — `state.pops` aliasé** : le tableau vit dans `juice/particles.js` (qui en est propriétaire) ;
  `app` fait `state.pops = particles.pops` pour conserver le contrat d'état du prototype sans double
  source de vérité.
- **A5 — Victoire différée** : le prototype appelle `win()` à l'instant où `enemyHp<=0` ; la spec 5.5
  impose la séquence de destruction. L'overlay est donc affiché **après** 1.6 s réelles de séquence
  (slow-mo + chunks + confettis), le gain/jingle inchangés. `playing` passe à false immédiatement.
- **A6 — Squash vertical ×1.35 du proto** : c'était la mise en forme des SPHÈRES en ovoïdes, pas du
  juice. Non appliqué aux personnages bakés (déjà anthropomorphes, normalisés 0.9 u) ; le bobbing
  (amplitudes/fréquences exactes), le squash de SPAWN (spec 5.1) et l'inclinaison avant (spec 5.2) le
  remplacent. Les rayons de collision, eux, ne changent pas.
- **A7 — Orientation des modèles** : le « forward » des GLB Kenney n'est pas vérifiable sans rendu.
  Un unique point de réglage : `UNIT_FACING_FIX` dans `constants.js`, validé sur la page debug T3.
- **A8 — 3 étoiles toujours pleines** en victoire (aucun système de scoring dans le prototype ni le
  plan) ; la séquence spring séquentielle 200 ms reste celle de la spec 5.7.
- **A9 — Recolor colormap** : règle « teinte remplacée si saturation ≥ 0.3 hors plage peau 15–50° »
  (§5.6) — préserve visages et rampes d'ombrage, déterministe, cache par équipe.
- **A10 — Ding** : base 660 Hz, +1 demi-ton par franchissement < 300 ms, plafond +12 demi-tons, reset
  sinon (la spec fixait la fenêtre et la croissance, pas la base ni le plafond).
- **A11 — Trauma des pops** : `+0.05` par pop mais contribution plafonnée à `0.1` par frame
  (TRAUMA.popFrameCap) pour éviter le shake permanent à 170 unités.
