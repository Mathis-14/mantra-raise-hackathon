// MOB RUSH — enemy/waves.js : vagues rouges, ligne de défaite, collisions bleu/rouge.
// Système (CONTRACT §6.5). Possède state.reds (spawn / mouvement / collisions / splice).
// Parité prototype game/mob-control-clone.html (boucle loop()). Aucun littéral gameplay hors constants.

import * as THREE from 'three';
import { nextId } from '../core/ids.js';
import { teamMaterial } from '../assets/recolor.js';
import { variantNumber } from '../core/variant.js';
import { clamp01 } from '../juice/springs.js';
import {
  LANE_HALF, BASE_Z, RED_WIN_Z, MAX_RED,
  GIANT_MIN_LEVEL, GIANT_PROBA, GIANT_HP, GIANT_SPEED, GIANT_LINE_DAMAGE,
  BOSS_HP, BOSS_SPEED, BOSS_LINE_DAMAGE, BOSS_SCALE, BOSS_RADIUS, BOSS_SPAWN_Z,
  CHAMPION_KILL_CHARGE, CHAMPION_GIANT_CHARGE, CHAMPION_BOSS_CHARGE,
  UNIT_RADIUS, GIANT_RADIUS, DANGER_DIST,
  TRAUMA, COLORS, RED_BOB, RED_WOBBLE, SPAWN_SQUASH, UNIT_FACING_FIX,
  wavePeriodForLevel, waveSizeForLevel, redSpeedForLevel,
} from '../core/constants.js';

/**
 * Vagues rouges + collisions.
 * @param {object} ctx contexte partagé (CONTRACT §4)
 * @returns {{ spawnStep(dt:number):void, spawnWave():void, spawnBoss():void, moveStep(dt:number,t:number):void,
 *   collideStep():void, render(t:number):void, reset():void }}
 */
export function createWaves(ctx) {
  const dummy = new THREE.Object3D();
  const enemyColor = ctx.theme?.teams?.enemy || COLORS.red;
  const bossColor = ctx.theme?.teams?.boss || COLORS.gold;

  // InstancedMesh de la masse rouge (non-géants). frustumCulled=false (foule).
  const redMesh = new THREE.InstancedMesh(ctx.assets.bakedUnit.geometry, teamMaterial(enemyColor), MAX_RED);
  redMesh.frustumCulled = false;
  redMesh.count = 0;
  ctx.scene.add(redMesh);

  function spawnStep(dt) {
    if (!ctx.state.playing) return;
    ctx.state.waveTimer -= dt;
    if (ctx.state.waveTimer <= 0) {
      ctx.state.waveTimer = wavePeriodForLevel(ctx.state.level);
      spawnWave();
    }
  }

  function spawnWave() {
    const reds = ctx.state.reds;
    const level = ctx.state.level;
    // pression de horde : layout (state.hordeMult) × variant d'ad éventuel (ctx.variant.wavePressure)
    const mult = (ctx.state.hordeMult || 1) * variantNumber(ctx, 'wavePressure', 1, { min: 0.4, max: 2.5 });
    const count = Math.round(waveSizeForLevel(level) * mult);
    const carpet = mult >= 2; // marée « tapis rouge » : rangées denses réparties sur la largeur
    const lanes = ctx.state.lanesX; // layout « couloirs » : ennemis séparés par les murs
    for (let i = 0; i < count && reds.length < MAX_RED; i++) {
      const z = carpet
        ? BASE_Z + 2 + Math.floor(i / 8) * 1.1 + Math.random() * 0.4
        : BASE_Z + 2 + Math.random() * 1.5;
      const laneX = lanes
        ? lanes[carpet ? i % lanes.length : Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 1.2
        : null;
      reds.push({
        id: nextId(),
        x: laneX != null
          ? laneX
          : carpet
            ? -(LANE_HALF - 0.7) + (i % 8) * ((LANE_HALF - 0.7) * 2 / 7) + (Math.random() - 0.5) * 0.5
            : (Math.random() * 2 - 1) * (LANE_HALF - 0.6),
        z,
        pz: z,
        hp: 1,
        hpMax: 1,
        giant: false,
        boss: false,
        wob: Math.random() * 6.28,
        spawnT: 0,
        flashT: 0,
      });
    }
    const giantProba = variantNumber(ctx, 'giantProba', GIANT_PROBA, { min: 0, max: 1 });
    if (level >= GIANT_MIN_LEVEL && Math.random() < giantProba && reds.length < MAX_RED) {
      const gz = BASE_Z + 2;
      reds.push({
        id: nextId(),
        x: (Math.random() * 2 - 1) * (LANE_HALF - 1),
        z: gz,
        pz: gz,
        hp: GIANT_HP,
        hpMax: GIANT_HP,
        giant: true,
        boss: false,
        wob: 0,
        spawnT: 0,
        flashT: 0,
      });
    }
  }

  function spawnBoss() {
    if (ctx.state.bossSpawned || ctx.state.reds.length >= MAX_RED) return;
    ctx.state.bossSpawned = true;
    ctx.state.bossDefeated = false;
    const bossHp = variantNumber(ctx, 'bossHp', BOSS_HP, { min: 8, max: 80, integer: true });
    const bossScale = variantNumber(ctx, 'bossScale', BOSS_SCALE, { min: 1, max: 4 });
    const radiusScale = bossScale / BOSS_SCALE;
    ctx.state.reds.push({
      id: nextId(),
      x: 0,
      z: BOSS_SPAWN_Z,
      pz: BOSS_SPAWN_Z,
      hp: bossHp,
      hpMax: bossHp,
      giant: true,
      boss: true,
      scale: bossScale,
      radius: BOSS_RADIUS * radiusScale,
      speed: BOSS_SPEED,
      lineDamage: BOSS_LINE_DAMAGE,
      wob: 0,
      spawnT: 0,
      flashT: 0,
    });
    ctx.particles.ring(0, BOSS_SPAWN_Z, bossColor);
    ctx.floatingText.spawn('BOSS', 0, 3.2, BOSS_SPAWN_Z, { color: '#ffe66d', size: 1.4, life: 1.1 });
    ctx.cameraRig.addTrauma(0.25); // l'arrivée du boss ébranle l'écran
    ctx.audio.play('baseHit', { volume: 0.9, rateJitter: 0 }); // thud d'entrée en scène
  }

  function moveStep(dt, t) {
    if (!ctx.state.playing) return;
    const reds = ctx.state.reds;
    for (let i = reds.length - 1; i >= 0; i--) {
      const r = reds[i];
      const sp = r.speed || (r.giant ? GIANT_SPEED : redSpeedForLevel(ctx.state.level));
      r.pz = r.z;
      r.z += sp * dt;
      r.spawnT += dt;
      if (!r.giant) r.x += Math.sin(t * RED_WOBBLE.freq + r.wob) * dt * RED_WOBBLE.amp;
      if (r.z >= RED_WIN_Z) {
        reds.splice(i, 1);
        ctx.state.playerHp -= r.lineDamage || (r.giant ? GIANT_LINE_DAMAGE : 1);
        ctx.particles.pop(r.x, RED_WIN_Z);
        ctx.audio.synth?.alarm();
        ctx.cameraRig.addTrauma(TRAUMA.redCross);
        ctx.vignette.flash(80);
        navigator.vibrate?.(80);
        ctx.sys.hud.refresh();
        if (ctx.state.playerHp <= 0) {
          ctx.vignette.setDanger(0);
          ctx.audio.synth?.setHeartbeat(0);
          ctx.sys.levels.lose();
          return;
        }
      }
    }
    // danger : max sur les rouges de la proximité à la ligne (CONTRACT §6.5)
    let danger = 0;
    for (let i = 0; i < reds.length; i++) {
      const d = clamp01((reds[i].z - (RED_WIN_Z - DANGER_DIST)) / DANGER_DIST);
      if (d > danger) danger = d;
    }
    ctx.vignette.setDanger(danger);
    ctx.audio.synth?.setHeartbeat(danger);
  }

  function collideStep() {
    if (!ctx.state.playing) return;
    const reds = ctx.state.reds;
    const blues = ctx.state.blues;
    for (let i = reds.length - 1; i >= 0; i--) {
      const r = reds[i];
      const rad = r.radius || (r.giant ? GIANT_RADIUS : UNIT_RADIUS);
      for (let j = blues.length - 1; j >= 0; j--) {
        const b = blues[j];
        const dz = b.z - r.z;
        if (Math.abs(dz) > rad) continue;
        const dx = b.x - r.x;
        if (dx * dx + dz * dz < rad * rad) {
          ctx.sys.crowd.killBlue(j);
          r.hp--;
          ctx.particles.pop(r.x, r.z);
          ctx.audio.play('unitHit');
          if (r.giant) {
            r.flashT = 0.1;
            ctx.sys.giants.onGiantHit(r, 1);
          }
          if (r.hp <= 0) {
            reds.splice(i, 1);
            ctx.sys.champion?.addCharge(r.boss ? CHAMPION_BOSS_CHARGE : (r.giant ? CHAMPION_GIANT_CHARGE : CHAMPION_KILL_CHARGE));
            if (r.giant) {
              ctx.sys.giants.onGiantDeath(r);
              if (r.boss) {
                ctx.state.bossDefeated = true;
                ctx.state.gems += 1;
                ctx.floatingText.spawn('+1', r.x, 3.4, r.z, { color: '#b9ffd7' });
                ctx.sys.hud.refresh();
              }
            } else {
              ctx.particles.burst(r.x, 0.5, r.z, { color: COLORS.red, shape: 'star', count: 4 });
              ctx.audio.synth?.beep(500, 0.06, 'triangle', 0.06);
            }
            break;
          }
        }
      }
    }
  }

  function render(t) {
    const reds = ctx.state.reds;
    const from = SPAWN_SQUASH.from;
    const rotY = UNIT_FACING_FIX + Math.PI; // face +Z (vers le joueur)
    const bound = ctx.sys.redHeroes?.boundIds; // unités rendues par un héros skinné → sautées ici
    let n = 0;
    for (let i = 0; i < reds.length; i++) {
      const r = reds[i];
      if (r.giant) continue; // les géants sont rendus par enemy/giants.js
      if (bound && bound.has(r.id)) continue;
      const y = Math.abs(Math.sin(t * RED_BOB.freq + r.wob)) * RED_BOB.amp;
      const p = clamp01(r.spawnT / SPAWN_SQUASH.dur);
      dummy.position.set(r.x, y, r.z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(
        from[0] + (1 - from[0]) * p,
        from[1] + (1 - from[1]) * p,
        from[2] + (1 - from[2]) * p,
      );
      dummy.updateMatrix();
      redMesh.setMatrixAt(n++, dummy.matrix);
    }
    redMesh.count = n;
    redMesh.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    ctx.state.reds.length = 0;
    ctx.state.bossSpawned = false;
    ctx.state.bossDefeated = false;
    redMesh.count = 0;
    redMesh.instanceMatrix.needsUpdate = true;
  }

  return { spawnStep, spawnWave, spawnBoss, moveStep, collideStep, render, reset };
}
