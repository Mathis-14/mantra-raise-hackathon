// MOB RUSH — read helpers for window.__MOB_VARIANT__ config.
// The generator validates config before injection; these helpers still clamp at
// the engine boundary so query-string configs cannot destabilize gameplay.

function config(ctx) {
  const value = ctx && ctx.variant;
  return value && typeof value === 'object' ? value : {};
}

export function variantNumber(ctx, key, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const value = config(ctx)[key];
  if (!Number.isFinite(value)) return fallback;
  const next = integer ? Math.round(value) : value;
  return Math.min(max, Math.max(min, next));
}

export function variantBoolean(ctx, key, fallback = false) {
  const value = config(ctx)[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function variantString(ctx, key, fallback, allowed) {
  const value = config(ctx)[key];
  if (typeof value !== 'string') return fallback;
  return allowed && !allowed.includes(value) ? fallback : value;
}

export function variantStringArray(ctx, key) {
  const value = config(ctx)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}
