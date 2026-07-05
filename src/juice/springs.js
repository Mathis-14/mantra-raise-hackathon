// MRUSH — helpers de spring/lerp. Module-librairie PUR (CONTRACT §5.4).
// Aucun état, aucun effet de bord, aucun import de GameState/ctx. Opère sur les arguments fournis.

/**
 * Lerp « parité prototype » : approche fraction min(1, dt*k) par frame.
 * ⚠ PARITÉ : à utiliser pour le canon, le fût et le squash de base (formules du proto).
 */
export function protoLerp(current, target, dt, k) {
  return current + (target - current) * Math.min(1, dt * k);
}

/** Amortissement exponentiel (frame-rate indépendant) : approche `target` au taux `lambda`. */
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** dampVec3 in-place (jamais de réassignation de .position/.rotation) : mute `vec` via .set(). Retourne `vec`. */
export function dampVec3(vec, tx, ty, tz, lambda, dt) {
  const f = 1 - Math.exp(-lambda * dt);
  vec.set(
    vec.x + (tx - vec.x) * f,
    vec.y + (ty - vec.y) * f,
    vec.z + (tz - vec.z) * f,
  );
  return vec;
}

/**
 * Spring amorti (semi-implicite Euler). `s = { x, v }` muté IN-PLACE (recul du fût, spec 5.1).
 * accélération = stiffness*(target - x) - damping*v. Retourne `s`.
 */
export function spring(s, target, stiffness, damping, dt) {
  const accel = (target - s.x) * stiffness - s.v * damping;
  s.v += accel * dt;
  s.x += s.v * dt;
  return s;
}

/** Borne `v` dans [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

/** Borne `v` dans [0, 1]. */
export function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/** Interpolation linéaire non clampée. */
export function lerp(a, b, u) {
  return a + (b - a) * u;
}

/** easeOutBack (dépassement doux) — pour les punchs d'échelle (texte de porte, étoiles). */
export function easeOutBack(u) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const p = u - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}
