// MRUSH — base ennemie composite (CONTRACT §6.7 + §3 Chunk).
// Module-SYSTÈME : factory createBase(ctx). N'importe aucun autre système ; toute interaction
// inter-système passe par ctx.sys.* dans les méthodes (jamais dans le corps de la factory).
// Dépendances autorisées : three, core/constants.js, juice/springs.js, librairies d'assets.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  BASE_Z, BLUE_HIT_Z, BASE_SQUASH, BASE_RETURN_K, BASE_CRACK_RATIOS, BASE_DESTROY,
  TRAUMA, COLORS,
} from '../core/constants.js';
import { protoLerp } from '../juice/springs.js';
import { retintClone } from '../assets/recolor.js';

// ---- Composition visuelle de la tour (« cale visuellement » — hors constants.js gameplay) ----
// La tour du proto est un cylindre r 2.6–3.1, h 4.5 + toit ; on reproduit l'emprise/hauteur avec
// des blocs platformer-kit recolorés rouge.
const BODY_BLOCK_W  = 2.7;   // largeur (u) d'un des 4 blockTall du corps (2×2)
const CROWN_W       = 1.35;  // largeur (u) d'un blockLow de la couronne (battlements)
const FLAG_HEIGHT   = 2.4;   // hauteur cible (u) du drapeau au sommet

// ---- Ondulation du drapeau (ambiance 5.8) ----
const FLAG_FREQ = 3.0;   // rad/s
const FLAG_AMP  = 0.14;  // rad — balancement latéral de la bannière
const FLAG_TILT = 0.4;   // rad — inclinaison du mât à l'état ruine

// ---- États de dégâts (assombrissement multiplicatif des matériaux clonés) ----
const CRACK_DARKEN = 0.72;  // palier 66 %
const RUIN_DARKEN  = 0.80;  // palier 33 %

// ---- Physique présentationnelle des chunks (hors constants.js gameplay) ----
const CHUNK_GRAVITY   = 24;    // u/s²
const CHUNK_OUT_MIN   = 2.5;   // vitesse radiale mini (u/s)
const CHUNK_OUT_RAND  = 4;     // + aléatoire
const CHUNK_UP_MIN    = 4;     // vitesse verticale mini (u/s)
const CHUNK_UP_RAND   = 4.5;   // + aléatoire
const CHUNK_SPIN      = 7;     // vitesse angulaire max (rad/s)
const CHUNK_LIFE      = 2.6;   // s (temps scalé)
const CHUNK_FLOOR_Y   = 0.15;  // sol local (u) — le group est à BASE_Z
const CHUNK_BOUNCE    = 0.32;  // restitution au rebond
const CHUNK_FRICTION  = 0.7;   // friction horizontale/angulaire au sol
const CHUNK_TARGET      = 1.1; // taille cible (u) d'un débris (brick/stones/rocks)
const CHUNK_TARGET_BLOCK = 1.7;// taille cible (u) d'un bloc de tour éjecté

/**
 * Base ennemie : tour composite, états de dégâts, séquence de destruction en chunks.
 * @param {object} ctx — contexte partagé (CONTRACT §4)
 * @returns {{ build(level:number):void, impactStep(dt:number,t:number):void,
 *             damage(amount:number,x:number,z:number,opts?:object):boolean,
 *             update(dt:number,t:number):void, reset(level:number):void }}
 */
export function createBase(ctx) {
  /** @type {THREE.Group|null} */
  let group = null;

  // Sous-parties (références conservées pour états & chunks).
  const bodyBlocks = [];   // holders des 4 blockTall du corps
  const crownBlocks = [];  // holders des blockLow de la couronne
  const decals = [];       // plans de fissures (CanvasTexture)
  let flag = null;         // holder du drapeau
  let flagWave = null;     // noeud qui ondule (rotation.z sinusoïdale)
  let flagPivot = null;    // noeud qui s'incline à la ruine (rotation.x)

  // Dimensions mesurées au build (pour placer couronne/drapeau/chunks).
  let bodyHeight = 2;
  let crownHeight = 0.6;
  let towerHeight = 3;
  let towerRadius = BODY_BLOCK_W;

  // État de dégâts / destruction.
  let damageState = 0;     // 0 intact, 1 fissuré (66 %), 2 ruine (33 %)
  let destroyed = false;   // séquence de destruction déclenchée (une seule fois)
  let won = false;         // levels.win() déjà appelé (une seule fois)
  let destroyElapsed = 0;  // s RÉELLES cumulées depuis le déclenchement

  /** @type {{mesh:THREE.Object3D, vel:THREE.Vector3, angVel:THREE.Vector3, life:number}[]} */
  const chunks = [];

  // Texture de fissures mise en cache par instance (CanvasTexture — SRGB obligatoire).
  let _crackTex = null;

  // Scratch (zéro allocation dans les mesures).
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  /**
   * Clone un GLB statique, le recolore, et le recentre (base à l'origine du holder, centré x/z).
   * @returns {{ holder: THREE.Group, size: THREE.Vector3 }}
   */
  function makePart(gltf, hex) {
    const root = skeletonClone(gltf.scene);
    retintClone(root, hex);
    _box.setFromObject(root);
    _box.getSize(_size);
    _box.getCenter(_center);
    // Décale root pour poser sa base à y=0 et le centrer en x/z (tient compte d'un offset initial).
    root.position.set(
      root.position.x - _center.x,
      root.position.y - _box.min.y,
      root.position.z - _center.z,
    );
    const holder = new THREE.Group();
    holder.add(root);
    return { holder, size: _size.clone() };
  }

  // ---- Texture de fissures (dessinée une fois, réutilisée) ----
  function crackTexture() {
    if (_crackTex) return _crackTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(15,8,18,0.85)';
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // Fissure principale (verticale, dentelée).
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 4);
    let x = 64;
    for (let y = 4; y < 124; y += 16) { x += (Math.random() - 0.5) * 26; g.lineTo(x, y); }
    g.stroke();
    // Ramifications.
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const sy = 16 + Math.random() * 90;
      g.beginPath();
      g.moveTo(64 + (Math.random() - 0.5) * 20, sy);
      g.lineTo(64 + (Math.random() - 0.5) * 70, sy + (Math.random() - 0.5) * 40);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;   // toute CanvasTexture code : SRGB (CONTRACT §1.1)
    _crackTex = tex;
    return tex;
  }

  // ---- Assombrissement (multiplie la couleur des matériaux CLONÉS — jamais un matériau partagé) ----
  function darken(holders, factor) {
    for (const h of holders) {
      h.traverse((n) => {
        if (!n.isMesh) return;
        const m = n.material;
        if (Array.isArray(m)) {
          for (const mm of m) { if (mm && mm.color) mm.color.multiplyScalar(factor); }
        } else if (m && m.color) {
          m.color.multiplyScalar(factor);
        }
      });
    }
  }

  function addCrackDecals() {
    const tex = crackTexture();
    const w = towerRadius * 1.4;
    const h = bodyHeight * 0.9;
    const specs = [
      { x: 0, y: bodyHeight * 0.55, z: towerRadius + 0.02, ry: 0 },
      { x: -towerRadius - 0.02, y: bodyHeight * 0.5, z: 0, ry: Math.PI / 2 },
      { x: towerRadius + 0.02, y: bodyHeight * 0.45, z: 0, ry: -Math.PI / 2 },
    ];
    for (const s of specs) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.set(0, s.ry, 0);
      group.add(m);
      decals.push(m);
    }
  }

  function addRubble() {
    const bits = [ctx.assets.gltf.stones, ctx.assets.gltf.rocks, ctx.assets.gltf.stones, ctx.assets.gltf.brick];
    for (let i = 0; i < bits.length; i++) {
      const part = makePart(bits[i], COLORS.red);
      const maxDim = Math.max(part.size.x, part.size.y, part.size.z) || 1;
      const s = 0.9 / maxDim;
      part.holder.scale.set(s, s, s);
      const ang = (i / bits.length) * Math.PI * 2 + Math.random() * 0.6;
      const r = towerRadius + 0.3 + Math.random() * 0.5;
      part.holder.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      part.holder.rotation.set(0, Math.random() * Math.PI * 2, 0);
      group.add(part.holder);
    }
  }

  // ---- Paliers de dégâts ----
  function applyDamageState(s) {
    if (s === 1) {
      darken(bodyBlocks, CRACK_DARKEN);
      darken(crownBlocks, CRACK_DARKEN);
      // Blocs légèrement désaxés (fixé une fois à l'entrée de l'état).
      for (const b of bodyBlocks) {
        b.rotation.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.12);
        b.position.y += Math.random() * 0.15;
      }
      addCrackDecals();
    } else if (s === 2) {
      darken(bodyBlocks, RUIN_DARKEN);
      for (const b of crownBlocks) b.visible = false;   // couronne retirée
      if (flagPivot) flagPivot.rotation.x = FLAG_TILT;   // drapeau incliné
      addRubble();                                       // stones/rocks au pied
    }
  }

  function updateDamageState() {
    const ratio = ctx.state.enemyHp / ctx.state.enemyHpMax;
    while (damageState < BASE_CRACK_RATIOS.length && ratio <= BASE_CRACK_RATIOS[damageState]) {
      damageState++;
      applyDamageState(damageState);
      ctx.audio.play('crack');
      ctx.cameraRig.addTrauma(TRAUMA.crack);
    }
  }

  // ---- Destruction ----
  function setTowerVisible(v) {
    for (const b of bodyBlocks) b.visible = v;
    for (const b of crownBlocks) b.visible = v;
    if (flagPivot) flagPivot.visible = v;
    for (const d of decals) d.visible = v;
  }

  function spawnChunks() {
    setTowerVisible(false);
    const span = BASE_DESTROY.chunkMax - BASE_DESTROY.chunkMin + 1;
    const count = BASE_DESTROY.chunkMin + Math.floor(Math.random() * span);   // 8..10
    const debris = [
      ctx.assets.gltf.brick, ctx.assets.gltf.brick, ctx.assets.gltf.brick, ctx.assets.gltf.brick,
      ctx.assets.gltf.stones, ctx.assets.gltf.stones,
      ctx.assets.gltf.rocks, ctx.assets.gltf.rocks,
    ];
    for (let k = 0; k < count; k++) {
      const isDebris = k < debris.length;
      const src = isDebris ? debris[k] : (k % 2 ? ctx.assets.gltf.blockLow : ctx.assets.gltf.blockTall);
      const target = isDebris ? CHUNK_TARGET : CHUNK_TARGET_BLOCK;
      const part = makePart(src, COLORS.red);
      const maxDim = Math.max(part.size.x, part.size.y, part.size.z) || 1;
      const s = target / maxDim;
      part.holder.scale.set(s, s, s);

      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * towerRadius * 0.5;
      part.holder.position.set(Math.cos(ang) * rr, 0.6 + Math.random() * towerHeight, Math.sin(ang) * rr);
      part.holder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.add(part.holder);

      const out = CHUNK_OUT_MIN + Math.random() * CHUNK_OUT_RAND;
      const vel = new THREE.Vector3(Math.cos(ang) * out, CHUNK_UP_MIN + Math.random() * CHUNK_UP_RAND, Math.sin(ang) * out);
      const angVel = new THREE.Vector3(
        (Math.random() * 2 - 1) * CHUNK_SPIN,
        (Math.random() * 2 - 1) * CHUNK_SPIN,
        (Math.random() * 2 - 1) * CHUNK_SPIN,
      );
      chunks.push({ mesh: part.holder, vel, angVel, life: CHUNK_LIFE });
    }
  }

  function triggerDestruction() {
    if (destroyed) return;
    destroyed = true;
    ctx.state.playing = false;
    if (group) group.scale.set(1, 1, 1);              // neutralise un squash résiduel
    ctx.time.pulse(BASE_DESTROY.slowScale, BASE_DESTROY.slowDur);   // 0.25 × 0.6 s réelles
    ctx.audio.synth?.explosion();
    ctx.audio.play('rubble');
    ctx.cameraRig.addTrauma(TRAUMA.baseDestroy);
    spawnChunks();
    ctx.confetti.burst(0, 3, BASE_Z);
    destroyElapsed = 0;
    won = false;
  }

  // ---- Construction ----
  function teardown() {
    if (!group) return;
    ctx.scene.remove(group);
    // Dispose UNIQUEMENT les matériaux clonés (par-clone, sûrs) ; jamais les géométries GLTF
    // partagées ni les colormaps recolorées mises en cache (partagées entre équipes).
    group.traverse((n) => {
      if (!n.isMesh) return;
      const m = n.material;
      if (Array.isArray(m)) { for (const mm of m) mm && mm.dispose && mm.dispose(); }
      else if (m && m.dispose) m.dispose();
    });
    for (const d of decals) { if (d.geometry && d.geometry.dispose) d.geometry.dispose(); }
    group = null;
  }

  function build(level) {   // eslint-disable-line no-unused-vars
    teardown();

    // Purge des états / timers.
    damageState = 0;
    destroyed = false;
    won = false;
    destroyElapsed = 0;
    chunks.length = 0;
    bodyBlocks.length = 0;
    crownBlocks.length = 0;
    decals.length = 0;
    flag = null;
    flagWave = null;
    flagPivot = null;

    group = new THREE.Group();
    group.position.set(0, 0, BASE_Z);

    // Corps : 2×2 blockTall (empilement carré) recolorés rouge.
    let sBody = 1;
    const bodyOff = BODY_BLOCK_W / 2;
    const grid = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < grid.length; i++) {
      const part = makePart(ctx.assets.gltf.blockTall, COLORS.red);
      if (i === 0) {
        sBody = BODY_BLOCK_W / (part.size.x || 1);
        bodyHeight = (part.size.y || 2) * sBody;
      }
      part.holder.scale.set(sBody, sBody, sBody);
      part.holder.position.set(grid[i][0] * bodyOff, 0, grid[i][1] * bodyOff);
      group.add(part.holder);
      bodyBlocks.push(part.holder);
    }
    towerRadius = BODY_BLOCK_W;   // ~ bord externe de l'emprise (proto : 2.6–3.1)

    // Couronne : blockLow aux 4 coins du sommet (battlements).
    for (let i = 0; i < grid.length; i++) {
      const part = makePart(ctx.assets.gltf.blockLow, COLORS.red);
      const s = CROWN_W / (part.size.x || 1);
      if (i === 0) crownHeight = (part.size.y || 1) * s;
      part.holder.scale.set(s, s, s);
      part.holder.position.set(grid[i][0] * bodyOff, bodyHeight, grid[i][1] * bodyOff);
      group.add(part.holder);
      crownBlocks.push(part.holder);
    }
    towerHeight = bodyHeight + crownHeight;

    // Drapeau au sommet (posé à plat, ondule dans update).
    const fpart = makePart(ctx.assets.gltf.flag, COLORS.red);
    const fs = FLAG_HEIGHT / (fpart.size.y || 1);
    fpart.holder.scale.set(fs, fs, fs);
    flag = fpart.holder;
    flagWave = new THREE.Group();
    flagWave.add(flag);
    flagPivot = new THREE.Group();
    flagPivot.position.set(0, bodyHeight + crownHeight * 0.3, 0);
    flagPivot.add(flagWave);
    group.add(flagPivot);

    ctx.scene.add(group);
  }

  function damage(amount, x, z, opts = {}) {
    const state = ctx.state;
    if (!group || destroyed) return false;
    const dmg = Math.max(1, Math.floor(amount || 1));
    state.enemyHp = Math.max(0, state.enemyHp - dmg);
    ctx.particles.pop(x, z);
    group.scale.set(BASE_SQUASH[0], BASE_SQUASH[1], BASE_SQUASH[2]);   // squash (retour lerp k=8)
    ctx.audio.play('baseHit');
    ctx.floatingText.spawn('-' + dmg, x, opts.y || 3.2, BASE_Z + 2, { color: opts.color || '#ff8fa3' });
    ctx.sys.hud.refresh();

    updateDamageState();   // paliers 66 % / 33 %

    if (state.enemyHp <= 0) {
      triggerDestruction();
      return true;
    }
    return false;
  }

  // ---- Impacts (APRÈS gates.crossStep) ----
  function impactStep(dt, t) {   // eslint-disable-line no-unused-vars
    const state = ctx.state;
    if (!state.playing || !group) return;   // re-test parité (le step est court-circuité si !playing)

    const blues = state.blues;
    for (let i = blues.length - 1; i >= 0; i--) {
      const u = blues[i];
      if (u.z <= BLUE_HIT_Z) {
        ctx.sys.crowd.killBlue(i);
        if (damage(1, u.x, u.z)) return;
      }
    }
  }

  // ---- Update (TOUJOURS, même !playing) ----
  function update(dt, t) {
    if (!group) return;

    // Retour du squash vers (1,1,1) — protoLerp k=BASE_RETURN_K (dt scalé, parité proto).
    group.scale.set(
      protoLerp(group.scale.x, 1, dt, BASE_RETURN_K),
      protoLerp(group.scale.y, 1, dt, BASE_RETURN_K),
      protoLerp(group.scale.z, 1, dt, BASE_RETURN_K),
    );

    // Physique des chunks (dt scalé → retombent au ralenti pendant le slow-mo, comme les confettis).
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.life <= 0) continue;
      c.vel.y -= CHUNK_GRAVITY * dt;
      c.mesh.position.x += c.vel.x * dt;
      c.mesh.position.y += c.vel.y * dt;
      c.mesh.position.z += c.vel.z * dt;
      if (c.mesh.position.y < CHUNK_FLOOR_Y) {
        c.mesh.position.y = CHUNK_FLOOR_Y;
        c.vel.y = Math.abs(c.vel.y) * CHUNK_BOUNCE;
        c.vel.x *= CHUNK_FRICTION;
        c.vel.z *= CHUNK_FRICTION;
        c.angVel.multiplyScalar(CHUNK_FRICTION);
      }
      c.mesh.rotation.x += c.angVel.x * dt;
      c.mesh.rotation.y += c.angVel.y * dt;
      c.mesh.rotation.z += c.angVel.z * dt;
      c.life -= dt;
    }

    // Ondulation sinusoïdale du drapeau (ambiance 5.8 ; t scalé, juice in-scene).
    if (flagWave) flagWave.rotation.z = Math.sin(t * FLAG_FREQ) * FLAG_AMP;

    // Décompte de la séquence de destruction en TEMPS RÉEL (rawDt) → win() une seule fois à 1.6 s.
    if (destroyed && !won) {
      destroyElapsed += ctx.time.rawDt;
      if (destroyElapsed >= BASE_DESTROY.seqDur) {
        won = true;
        ctx.sys.levels.win();
      }
    }
  }

  function reset(level) {
    build(level);   // build() purge déjà chunks / états / timers
  }

  return { build, impactStep, damage, update, reset };
}
