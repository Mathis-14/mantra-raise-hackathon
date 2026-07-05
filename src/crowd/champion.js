// MRUSH — champion bleu.
// Gère la jauge, le release et le clone géant qui nettoie une ligne jusqu'à la base.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  PLAYER_Z,
  BLUE_HIT_Z,
  UNIT_HEIGHT,
  UNIT_FACING_FIX,
  UNIT_RADIUS,
  GIANT_RADIUS,
  CHAMPION_MAX,
  CHAMPION_PASSIVE_RATE,
  CHAMPION_HP,
  CHAMPION_DAMAGE,
  CHAMPION_BASE_DAMAGE,
  CHAMPION_SPEED,
  CHAMPION_SCALE,
  CHAMPION_RADIUS,
  CHAMPION_KILL_CHARGE,
  CHAMPION_GIANT_CHARGE,
  CHAMPION_BOSS_CHARGE,
  BOSS_RADIUS,
  COLORS,
} from '../core/constants.js';
import { clamp01 } from '../juice/springs.js';
import { nextId } from '../core/ids.js';

const SPAWN_Z_OFFSET = 2.2;
const HIT_COOLDOWN = 0.1;
const FLASH_DUR = 0.1;
const BOB_FREQ = 5.2;
const BOB_AMP = 0.1;
const WOBBLE_FREQ = 2.4;
const WOBBLE_AMP = 0.18;
const FACING = UNIT_FACING_FIX;

// Jauge 3D collée au canon (réf. Mob Control : pilule verticale à côté du canon).
const GAUGE_X = -1.75;       // à gauche du socle (2.2 de large)
const GAUGE_BASE_Y = 0.2;    // bas de la jauge
const GAUGE_H = 2.0;         // hauteur de la pilule (bien visible)
const GAUGE_W = 0.46;
const GAUGE_D = 0.22;
const BTN_Y_OFFSET = 0.75;   // le bouton flotte au-dessus de la jauge
const BTN_SCALE_X = 2.6;     // gros bouton, tapable au pouce
const BTN_SCALE_Y = 0.98;
const BTN_PULSE_FREQ = 3.4;  // pulsation du RELEASE! (visible = appuyable)
const BTN_PULSE_AMP = 0.07;
const FILL_FLASH_DUR = 0.35; // flash blanc de la jauge au release

export function createChampion(ctx) {
  const clones = new Map();
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _white = new THREE.Color(0xffffff);

  // --- jauge 3D + bouton RELEASE (game objects attachés au groupe du canon) ---
  let gauge = null; // { rig, bg, fill, fillMat, btn }
  let fillFlashT = 0; // flash blanc au release (récompense)
  const _gold = new THREE.Color(COLORS.gold);
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _wpos = new THREE.Vector3();

  function makeReleaseSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const c = canvas.getContext('2d');
    // pilule verte à ombre dure (style candy du jeu)
    const r = 34;
    const drawPill = (x, y, w, h, fill) => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    };
    drawPill(8, 16, 240, 74, 'rgba(21,72,48,0.9)');  // ombre dure dessous
    drawPill(8, 8, 240, 74, '#45E28D');
    c.font = 'bold 44px "Arial Rounded MT Bold","Helvetica Rounded",ui-rounded,Arial,sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.strokeText('RELEASE!', 128, 46);
    c.fillStyle = '#ffffff';
    c.fillText('RELEASE!', 128, 46);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(BTN_SCALE_X, BTN_SCALE_Y, 1);
    sprite.renderOrder = 11;
    return sprite;
  }

  /** Construit la jauge, enfant du groupe canon (suit position/tilt). Lazy : ctx.sys prêt à l'update. */
  function buildGauge() {
    const cannonGroup = ctx.sys.cannon && ctx.sys.cannon.group;
    if (!cannonGroup) return;
    const rig = new THREE.Group();
    rig.position.set(GAUGE_X, 0, 0);

    const bg = new THREE.Mesh(
      new THREE.BoxGeometry(GAUGE_W, GAUGE_H, GAUGE_D),
      new THREE.MeshLambertMaterial({ color: 0x1b1c38, transparent: true, opacity: 0.85 }),
    );
    bg.position.set(0, GAUGE_BASE_Y + GAUGE_H / 2, 0);
    rig.add(bg);

    const fillMat = new THREE.MeshBasicMaterial({ color: COLORS.gold }); // OR : lisible sur le canon bleu
    // Le remplissage est posé DEVANT la face avant du fond (sinon il serait noyé dans la boîte sombre).
    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(GAUGE_W * 0.72, GAUGE_H, GAUGE_D * 0.5),
      fillMat,
    );
    fill.position.set(0, GAUGE_BASE_Y + GAUGE_H / 2, GAUGE_D / 2 + 0.06);
    rig.add(fill);

    const btn = makeReleaseSprite();
    btn.position.set(0, GAUGE_BASE_Y + GAUGE_H + BTN_Y_OFFSET, 0);
    btn.visible = false;
    rig.add(btn);

    cannonGroup.add(rig);
    gauge = { rig, bg, fill, fillMat, btn };

    // Tap sur le bouton → release, intercepté en PHASE CAPTURE sur window : l'événement est
    // stoppé AVANT d'atteindre le canvas, donc le canon ne vise/tire pas sur ce tap.
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!ctx.state.championReady || !ctx.state.playing || !gauge.btn.visible) return;
        const p = e.touches ? e.touches[0] : e;
        _ndc.set((p.clientX / innerWidth) * 2 - 1, -(p.clientY / innerHeight) * 2 + 1);
        _ray.setFromCamera(_ndc, ctx.camera);
        if (_ray.intersectObjects([gauge.btn, gauge.bg], false).length === 0) return;
        e.stopPropagation();
        e.preventDefault();
        if (release()) releaseRewardFx();
      },
      { capture: true },
    );
  }

  /** FX de récompense du release : burst d'étoiles dorées au bouton, double anneau, flash de jauge, gemme. */
  function releaseRewardFx() {
    if (!gauge) return;
    fillFlashT = FILL_FLASH_DUR;
    gauge.btn.getWorldPosition(_wpos);
    ctx.particles.burst(_wpos.x, _wpos.y, _wpos.z, { color: COLORS.gold, shape: 'star', count: 14, speed: 4, life: 0.7 });
    ctx.particles.ring(_wpos.x, _wpos.z, COLORS.gold);
    ctx.floatingText.spawn('GO!', _wpos.x, _wpos.y + 0.5, _wpos.z, { color: '#ffe66d', size: 1.2, life: 0.8 });
    ctx.audio.play('gem', { volume: 0.8 });
  }

  /** Remplissage OR, visibilité du bouton (SEULEMENT jauge pleine), pulse + flash de release. */
  function updateGauge(dt, t) {
    if (!gauge) {
      buildGauge();
      if (!gauge) return;
    }
    const state = ctx.state;
    const ratio = clamp01((state.championCharge || 0) / CHAMPION_MAX);
    gauge.rig.visible = !!state.playing;
    // la barre grandit depuis le bas
    gauge.fill.scale.y = Math.max(0.001, ratio);
    gauge.fill.position.y = GAUGE_BASE_Y + (GAUGE_H * ratio) / 2;
    // OR permanent ; flash blanc décroissant au release (récompense visuelle)
    if (fillFlashT > 0) {
      fillFlashT = Math.max(0, fillFlashT - dt);
      gauge.fillMat.color.copy(_gold).lerp(_white, fillFlashT / FILL_FLASH_DUR);
    } else {
      gauge.fillMat.color.copy(_gold);
    }
    // bouton : uniquement quand la jauge est pleine (et pas de champion en piste)
    const showBtn = !!(state.championReady && state.playing);
    gauge.btn.visible = showBtn;
    if (showBtn) {
      const s = 1 + Math.sin(t * BTN_PULSE_FREQ) * BTN_PULSE_AMP;
      gauge.btn.scale.set(BTN_SCALE_X * s, BTN_SCALE_Y * s, 1);
      // la jauge pleine "respire" aussi (appelle le regard)
      gauge.fill.scale.x = 1 + Math.sin(t * BTN_PULSE_FREQ) * 0.08;
    } else {
      gauge.fill.scale.x = 1;
    }
  }

  function clipByName(gltf, name) {
    const anims = gltf && gltf.animations ? gltf.animations : [];
    return anims.find((c) => c.name === name) || null;
  }

  function makeClone(champ) {
    const source = ctx.assets.gltf.maleD || ctx.assets.gltf.maleA;
    const root = skeletonClone(source.scene);
    // Full colored : matériau plat unique par clone (skinning auto), pas de texture.
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.blue });
    root.traverse((o) => { if (o.isMesh) o.material = mat; });

    _box.setFromObject(root);
    _box.getSize(_size);
    const nativeH = _size.y || 1;
    const s = (UNIT_HEIGHT / nativeH) * CHAMPION_SCALE;
    root.scale.setScalar(s);
    const footY = -_box.min.y * s;
    root.position.set(champ.x, footY, champ.z);
    root.rotation.set(0, FACING, 0);

    const mats = [mat]; // flash émissif sur l'unique matériau du clone

    const head = root.getObjectByName('head');
    if (head && ctx.assets.gltf.sunglasses) head.add(skeletonClone(ctx.assets.gltf.sunglasses.scene));

    const mixer = new THREE.AnimationMixer(root);
    let action = null;
    const sprint = clipByName(source, 'sprint');
    if (sprint) {
      action = mixer.clipAction(sprint);
      action.timeScale = 0.82;
      action.play();
    }

    ctx.scene.add(root);
    return { root, mixer, action, mats, footY };
  }

  function recycle(entry) {
    entry.mixer.stopAllAction();
    entry.mixer.uncacheRoot(entry.root);
    ctx.scene.remove(entry.root);
  }

  function addCharge(amount) {
    const state = ctx.state;
    state.championCharge = Math.min(CHAMPION_MAX, state.championCharge + Math.max(0, amount || 0));
  }

  function killRed(reds, index, red) {
    reds.splice(index, 1);
    addCharge(red.boss ? CHAMPION_BOSS_CHARGE : (red.giant ? CHAMPION_GIANT_CHARGE : CHAMPION_KILL_CHARGE));
    if (red.giant) {
      ctx.sys.giants.onGiantDeath(red);
      if (red.boss) {
        ctx.state.bossDefeated = true;
        ctx.state.gems += 1;
        ctx.floatingText.spawn('+1', red.x, 3.4, red.z, { color: '#b9ffd7' });
        ctx.sys.hud.refresh();
      }
    } else {
      ctx.particles.burst(red.x, 0.5, red.z, { color: COLORS.red, shape: 'star', count: 4 });
      ctx.audio.synth?.beep(560, 0.05, 'triangle', 0.06);
    }
  }

  function release() {
    const state = ctx.state;
    if (!state.playing || state.championCharge < CHAMPION_MAX || state.champions.length > 0) return false;
    const z = PLAYER_Z - SPAWN_Z_OFFSET;
    const x = state.cannonX;
    state.champions.push({
      id: nextId(),
      x,
      z,
      pz: z,
      hp: CHAMPION_HP,
      hitCd: 0,
      flashT: 0,
      wob: Math.random() * Math.PI * 2,
    });
    state.championCharge = 0;
    state.championReady = false;
    ctx.particles.ring(x, z, COLORS.blue);
    ctx.particles.burst(x, 1.2, z, { color: COLORS.blue, shape: 'spark', count: 10 });
    ctx.floatingText.spawn('CHAMPION', x, 2.7, z, { color: '#bdefff' });
    ctx.cameraRig.addTrauma(0.2); // le release doit se SENTIR (secousse courte)
    ctx.audio.synth?.ding();
    return true;
  }

  function updateLogic(dt, t) {
    const state = ctx.state;
    if (!state.playing) return;

    if (state.championCharge < CHAMPION_MAX) {
      state.championCharge = Math.min(CHAMPION_MAX, state.championCharge + CHAMPION_PASSIVE_RATE * dt);
    }

    const champions = state.champions;
    const reds = state.reds;
    for (let i = champions.length - 1; i >= 0; i--) {
      const champ = champions[i];
      champ.pz = champ.z;
      champ.z -= CHAMPION_SPEED * dt;
      champ.x += Math.sin(t * WOBBLE_FREQ + champ.wob) * WOBBLE_AMP * dt;
      champ.hitCd = Math.max(0, champ.hitCd - dt);
      champ.flashT = Math.max(0, champ.flashT - dt);

      if (champ.hitCd <= 0) {
        for (let j = reds.length - 1; j >= 0; j--) {
          const red = reds[j];
          const redRad = red.radius || (red.boss ? BOSS_RADIUS : (red.giant ? GIANT_RADIUS : UNIT_RADIUS));
          const rad = CHAMPION_RADIUS + redRad * 0.65;
          const dx = champ.x - red.x;
          const dz = champ.z - red.z;
          if (dx * dx + dz * dz > rad * rad) continue;

          const dmg = Math.min(CHAMPION_DAMAGE, red.hp);
          red.hp -= CHAMPION_DAMAGE;
          red.flashT = FLASH_DUR;
          champ.hp -= red.boss ? 2 : 1;
          champ.flashT = FLASH_DUR;
          champ.hitCd = HIT_COOLDOWN;
          ctx.particles.pop(red.x, red.z);
          ctx.audio.play('unitHit');
          if (red.giant) ctx.sys.giants.onGiantHit(red, dmg);

          if (red.hp <= 0) killRed(reds, j, red);
          break;
        }
      }

      if (champ.hp <= 0) {
        ctx.particles.burst(champ.x, 1.2, champ.z, { color: COLORS.blue, shape: 'spark', count: 8 });
        champions.splice(i, 1);
        continue;
      }

      if (champ.z <= BLUE_HIT_Z) {
        ctx.sys.base.damage(CHAMPION_BASE_DAMAGE, champ.x, champ.z, { y: 3.8, color: '#bdefff' });
        ctx.cameraRig.addTrauma(0.25);
        champions.splice(i, 1);
      }
    }

    state.championActive = champions.length > 0;
    state.championReady = state.championCharge >= CHAMPION_MAX && !state.championActive;
  }

  function updateVisuals(dt, t) {
    const live = new Set();
    for (const champ of ctx.state.champions) {
      live.add(champ.id);
      let entry = clones.get(champ.id);
      if (!entry) {
        entry = makeClone(champ);
        clones.set(champ.id, entry);
      }
      const y = entry.footY + Math.abs(Math.sin(t * BOB_FREQ + champ.wob)) * BOB_AMP;
      entry.root.position.set(champ.x, y, champ.z);
      entry.root.rotation.set(0, FACING, 0);
      const f = clamp01(champ.flashT / FLASH_DUR);
      for (const m of entry.mats) m.emissive.copy(_white).multiplyScalar(f);
      entry.mixer.update(dt);
    }

    for (const [id, entry] of clones) {
      if (live.has(id)) continue;
      recycle(entry);
      clones.delete(id);
    }
  }

  function update(dt, t) {
    updateLogic(dt, t);
    updateVisuals(dt, t);
    updateGauge(dt, t);
  }

  function reset() {
    ctx.state.champions.length = 0;
    ctx.state.championCharge = 0;
    ctx.state.championReady = false;
    ctx.state.championActive = false;
    for (const entry of clones.values()) recycle(entry);
    clones.clear();
  }

  return { addCharge, release, update, reset };
}
