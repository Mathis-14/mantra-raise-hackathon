// MOB RUSH — per-variant visual theme resolver.
// Constants stay immutable defaults; variants resolve to one app-local theme.

import { COLORS, FOG, LIGHTS } from './constants.js';

const MAP_STYLES = Object.freeze({
  default: Object.freeze({
    bg: COLORS.bg,
    fog: FOG.color,
    road: COLORS.road,
    dash: COLORS.dash,
    cloud: 0xf3f0ff,
    gateGood: COLORS.gateGood,
    gateBad: COLORS.gateBad,
    overlayBg: 'rgba(18,10,54,.78)',
    buttonTop: '#4dc9ff',
    buttonBottom: '#2d7dff',
    buttonShadow: '#1c4fd6',
    selectedTop: '#57e08a',
    selectedBottom: '#28b36a',
    selectedShadow: '#17864a',
    glow: 'rgba(56,182,255,.5)',
  }),
  neon_night: Object.freeze({
    bg: 0x09122f,
    fog: 0x09122f,
    road: 0x1e2a66,
    dash: 0x00f0ff,
    cloud: 0x314a91,
    gateGood: 0x00f0ff,
    gateBad: 0xff2bd6,
    overlayBg: 'rgba(3,8,26,.82)',
    buttonTop: '#00f0ff',
    buttonBottom: '#3366ff',
    buttonShadow: '#162ab8',
    selectedTop: '#ff58dc',
    selectedBottom: '#b21eff',
    selectedShadow: '#6c148f',
    glow: 'rgba(0,240,255,.56)',
  }),
  sunset: Object.freeze({
    bg: 0x59224f,
    fog: 0x59224f,
    road: 0xffb45f,
    dash: 0xfff0a3,
    cloud: 0xffc7a8,
    gateGood: 0xffd54a,
    gateBad: 0xff4d6d,
    overlayBg: 'rgba(72,28,52,.8)',
    buttonTop: '#ffd54a',
    buttonBottom: '#ff7a3d',
    buttonShadow: '#b94423',
    selectedTop: '#ffef8a',
    selectedBottom: '#ffb22e',
    selectedShadow: '#a56712',
    glow: 'rgba(255,213,74,.5)',
  }),
  toxic: Object.freeze({
    bg: 0x103222,
    fog: 0x103222,
    road: 0x263b2f,
    dash: 0xafff3d,
    cloud: 0x67d38b,
    gateGood: 0xafff3d,
    gateBad: 0xff315e,
    overlayBg: 'rgba(7,34,24,.84)',
    buttonTop: '#afff3d',
    buttonBottom: '#21c063',
    buttonShadow: '#0d7439',
    selectedTop: '#fff45a',
    selectedBottom: '#75d933',
    selectedShadow: '#4b8c1f',
    glow: 'rgba(175,255,61,.48)',
  }),
});

const TEAM_COLORS = Object.freeze({
  classic: Object.freeze({
    player: COLORS.blue,
    playerDark: COLORS.blueDark,
    enemy: COLORS.red,
    enemyDark: COLORS.redDark,
    boss: COLORS.gold,
    base: COLORS.red,
  }),
  cyan_magenta: Object.freeze({
    player: 0x00e5ff,
    playerDark: 0x2458ff,
    enemy: 0xff2bd6,
    enemyDark: 0xb01886,
    boss: 0xffd54a,
    base: 0xff2bd6,
  }),
  lime_violet: Object.freeze({
    player: 0xafff3d,
    playerDark: 0x3aa64f,
    enemy: 0x8d4dff,
    enemyDark: 0x5d2ec0,
    boss: 0xfff45a,
    base: 0x8d4dff,
  }),
  gold_crimson: Object.freeze({
    player: 0xffd54a,
    playerDark: 0xd98b1e,
    enemy: 0xff315e,
    enemyDark: 0xa3193b,
    boss: 0xfff0a3,
    base: 0xff315e,
  }),
});

const MAP_STYLE_IDS = Object.freeze(Object.keys(MAP_STYLES));
const TEAM_COLOR_IDS = Object.freeze(Object.keys(TEAM_COLORS));
const ASSET_STYLE_IDS = Object.freeze(['default', 'hazard', 'armory', 'treasure', 'snow']);

function pick(config, key, fallback, allowed) {
  const value = config && typeof config === 'object' ? config[key] : undefined;
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

export function hexCss(hex) {
  return '#' + Math.max(0, Math.min(0xffffff, hex)).toString(16).padStart(6, '0');
}

export function resolveVariantTheme(config) {
  const mapStyle = pick(config, 'mapStyle', 'default', MAP_STYLE_IDS);
  const teamColor = pick(config, 'teamColor', 'classic', TEAM_COLOR_IDS);
  const assetStyle = pick(config, 'assetStyle', 'default', ASSET_STYLE_IDS);
  const map = MAP_STYLES[mapStyle] || MAP_STYLES.default;
  const teams = TEAM_COLORS[teamColor] || TEAM_COLORS.classic;

  return {
    mapStyle,
    teamColor,
    assetStyle,
    colors: {
      bg: map.bg,
      fog: map.fog,
      road: map.road,
      dash: map.dash,
      cloud: map.cloud,
      gateGood: map.gateGood,
      gateBad: map.gateBad,
      boost: COLORS.green,
      gold: COLORS.gold,
    },
    teams,
    css: {
      overlayBg: map.overlayBg,
      buttonTop: map.buttonTop,
      buttonBottom: map.buttonBottom,
      buttonShadow: map.buttonShadow,
      selectedTop: map.selectedTop,
      selectedBottom: map.selectedBottom,
      selectedShadow: map.selectedShadow,
      glow: map.glow,
      accent: hexCss(map.gateGood),
      danger: hexCss(map.gateBad),
      player: hexCss(teams.player),
      enemy: hexCss(teams.enemy),
      boss: hexCss(teams.boss),
    },
    fog: { color: map.fog, near: FOG.near, far: FOG.far },
    lights: {
      hemi: { ...LIGHTS.hemi },
      dir: { ...LIGHTS.dir },
    },
  };
}

export function applyThemeCss(theme, root = document.documentElement) {
  if (!root || !theme) return;
  root.style.setProperty('--variant-overlay-bg', theme.css.overlayBg);
  root.style.setProperty('--variant-button-top', theme.css.buttonTop);
  root.style.setProperty('--variant-button-bottom', theme.css.buttonBottom);
  root.style.setProperty('--variant-button-shadow', theme.css.buttonShadow);
  root.style.setProperty('--variant-selected-top', theme.css.selectedTop);
  root.style.setProperty('--variant-selected-bottom', theme.css.selectedBottom);
  root.style.setProperty('--variant-selected-shadow', theme.css.selectedShadow);
  root.style.setProperty('--variant-accent', theme.css.accent);
  root.style.setProperty('--variant-danger', theme.css.danger);
  root.style.setProperty('--variant-player', theme.css.player);
  root.style.setProperty('--variant-enemy', theme.css.enemy);
  root.style.setProperty('--variant-boss', theme.css.boss);
  root.style.setProperty('--variant-glow', theme.css.glow);
}
