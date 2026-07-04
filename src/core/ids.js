// MOB RUSH — compteur d'id global monotone, PARTAGÉ par toutes les équipes.
// CONTRACT §3 : `id` est un « compteur global monotone (unique toutes équipes) ».
// Utilisé par crowd (bleus) ET waves (rouges) pour garantir des ids uniques,
// nécessaires notamment au binding visuel des héros par id.
//
// Module-librairie pur : aucune dépendance, aucun effet de bord à l'import
// (la variable module-level n'est mutée que lors d'un appel à nextId()).

let _next = 1;

/** @returns {number} un nouvel id unique, strictement croissant. */
export function nextId() {
  return _next++;
}

/** Réinitialise le compteur (optionnel — non appelé par crowd/waves.reset()). */
export function resetIds() {
  _next = 1;
}
