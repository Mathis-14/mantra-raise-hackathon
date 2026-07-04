# Instruction agent — génération de variants publicitaires jouables

## Mission

Lis `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `PLAN.md` et `mob-juice.md` avant toute modification.

Tu dois rendre le jeu facile à modifier, sauvegarder, rejouer et enregistrer par un agent afin de générer des ads personnalisées à partir de tendances marché.

Ne génère pas des variantes aléatoires. Implémente un système formel de scénarios qui transforme une tendance marketing en variant jouable et enregistrable.

## Contexte produit

La boucle produit cible est :

```text
base HTML game + market/trend context
-> playtest
-> scenario-based variants
-> video creatives
-> deploy stub
-> seeded metrics
-> keep/kill recommendation
```

Le cœur du produit est la capacité de l’agent à jouer au jeu comme un vrai joueur, puis à générer des variants et des creatives sur la base de ce qu’il observe.

## Contraintes fortes

- Ne modifie jamais directement le jeu source dans `game/`.
- Les variants doivent copier ou dériver de `game_html`.
- Garde la boucle Mob Rush lisible : canon, portes, croissance de foule, ennemis, destruction de base, récompense.
- Préserve la direction artistique hypercasual low-poly : couleurs plates, silhouettes lisibles, feedback immédiat.
- Chaque variant doit rester jouable.
- Chaque variant doit être enregistrable en vertical `9:16`.
- Chaque scénario doit tester une seule hypothèse créative.
- Chaque scénario doit produire des métadonnées structurées, sauvegardables et comparables.
- Toute entrée venant d’un agent, LLM ou fichier externe doit être validée avec Zod avant d’entrer dans la logique.

## À implémenter

### 1. Contrat `AdScenarioSpec`

Créer un contrat canonique `AdScenarioSpec` qui décrit :

- l’id du scénario,
- le titre,
- la tendance ciblée,
- l’émotion viewer recherchée,
- l’hypothèse testée,
- l’angle créatif,
- les mutations gameplay autorisées,
- les mutations interdites,
- le script jouable,
- le plan de recording,
- les critères de succès,
- les métadonnées de génération.

Ce contrat doit être partagé entre le générateur de variants, le playtest, la génération de creatives et le module de décision.

### 2. Validation Zod

Créer un schema Zod correspondant au contrat.

Règle : un scénario généré par un LLM est un brouillon tant qu’il n’a pas été validé par Zod.

En cas d’échec :

- ne pas générer de variant,
- enregistrer un event structuré,
- retourner une erreur lisible,
- ne jamais fallback silencieusement vers un scénario incomplet.

### 3. Bibliothèque de templates

Créer une première bibliothèque de templates avec au moins ces scénarios :

1. `fail_bait_gate`
2. `crowd_explosion`
3. `champion_release`
4. `boss_crush`
5. `danger_comeback`
6. `speed_boost`
7. `loadout_comparison`
8. `reward_dopamine`

Chaque template doit préciser :

- la motivation joueur,
- l’émotion viewer,
- la mécanique principale,
- les paramètres modifiables,
- le payoff attendu,
- les moments à enregistrer.

### 4. Générateur de variants

Créer un générateur qui prend un `AdScenarioSpec` validé et produit :

- un variant jouable,
- des métadonnées de variant,
- un plan d’enregistrement,
- un prompt de creative vidéo,
- une checklist de playtest,
- une description courte pour le dashboard.

Le générateur doit privilégier les changements paramétriques avant les changements structurels :

1. layout des portes,
2. timing des vagues,
3. HP boss/base,
4. multiplicateurs,
5. jauge champion,
6. intensité de feedback visuel,
7. overlays texte,
8. cadrage recording,
9. couleur seulement si elle sert l’angle créatif.

### 5. Sauvegarde des variants

Chaque variant généré doit être sauvegardé avec :

- `scenario_id`,
- `variant_id`,
- `source_trend`,
- `hypothesis`,
- `mechanic_focus`,
- `changed_parameters`,
- `recording_plan`,
- `creative_prompt`,
- `playtest_checklist`,
- `status`,
- `created_at`,
- `updated_at`.

La sauvegarde doit permettre de rejouer exactement le même scénario plus tard.

### 6. Script de recording

Chaque scénario doit générer un script vertical court :

```text
0-3s: hook visuel immédiat
3-8s: choix, tension ou erreur probable
8-15s: amplification de foule, pouvoir ou comeback
15-22s: payoff spectaculaire
22-25s: CTA simple
```

Le script doit être concret et enregistrable. Pas de descriptions abstraites.

Mauvais :

```text
Make the game more exciting.
```

Bon :

```text
Show a red x0 trap gate larger than the blue x3 gate. The player almost hits the trap, then narrowly steers into x3 and triples the crowd before the enemies reach the line.
```

## Règles créatives

### Hook

Le hook doit être compréhensible visuellement en moins de 3 secondes.

Exemples :

- “Only 1% choose right”
- “Don’t hit red!”
- “Release the giant?”
- “This boss looks impossible”
- “I almost lost…”

### Payoff

Chaque scénario doit contenir un payoff unique et évident :

- foule qui explose en taille,
- champion géant qui nettoie la piste,
- boss qui s’effondre,
- base qui explose,
- comeback après danger,
- fontaine de pièces,
- comparaison A/B avec vainqueur évident.

### Lisibilité

L’agent doit préférer la clarté à la richesse.

- Une idée principale par ad.
- Peu de texte.
- Contraste fort entre bon choix et mauvais choix.
- Cadrage vertical qui montre toujours le canon, la menace et le payoff.

### Juice

Chaque action importante doit recevoir au moins trois feedbacks simultanés :

- visuel,
- son,
- mouvement.

Exemples :

- passage de porte : flash panneau + punch texte + ding pitch croissant,
- destruction base : slow-mo + chunks + confettis + jingle,
- danger : vignette rouge + shake + alarme descendante,
- récompense : pièces volantes + tick sonore + punch compteur.

## Scénarios initiaux à créer

### 1. Fail-bait gate

Hypothèse : un choix presque raté augmente la rétention parce que le viewer veut corriger le joueur.

Mutation :

- grosse porte rouge piège très visible,
- bonne porte bleue plus petite,
- mouvement de visée proche de l’erreur,
- payoff de multiplication important.

Recording :

- near miss sur la porte rouge,
- passage dans la bonne porte,
- foule qui grossit,
- base détruite.

### 2. Crowd explosion

Hypothèse : la croissance massive de foule est le signal le plus satisfaisant du jeu.

Mutation :

- plusieurs portes multiplicatrices,
- cadence de tir légèrement accélérée,
- ennemis nombreux mais lisibles,
- base finale plus fragile pour garantir le payoff.

Recording :

- petite foule au départ,
- passage x2 / x3,
- masse énorme,
- destruction finale.

### 3. Champion release

Hypothèse : le moment de libération du champion crée un pic de puissance très partageable.

Mutation :

- jauge champion plus rapide,
- prompt “RELEASE!” très visible,
- champion plus grand ou plus lumineux,
- ligne ennemie dense pour montrer l’impact.

Recording :

- jauge qui se remplit,
- release,
- colonne de lumière,
- champion qui écrase les ennemis.

### 4. Boss crush

Hypothèse : un boss impossible au départ rend le payoff final plus fort.

Mutation :

- boss plus gros,
- HP visible,
- foule qui monte progressivement,
- dernier assaut très lisible.

Recording :

- boss dominant au début,
- croissance de l’armée,
- HP qui descend,
- boss qui explose.

### 5. Danger comeback

Hypothèse : le danger proche de la défaite crée de la tension et augmente la complétion.

Mutation :

- ennemis proches de la ligne,
- vignette rouge,
- sauvetage possible par porte ou champion,
- victoire après quasi-défaite.

Recording :

- danger imminent,
- décision du joueur,
- comeback,
- soulagement final.

### 6. Speed boost

Hypothèse : la vitesse donne une sensation immédiate de puissance et de chaos contrôlé.

Mutation :

- bande boost sur la piste,
- mobs accélérés,
- micro-trails,
- ennemis débordés.

Recording :

- foule normale,
- passage sur boost,
- accélération visible,
- base submergée.

### 7. Loadout comparison

Hypothèse : une comparaison simple A/B pousse le viewer à choisir mentalement un camp.

Mutation :

- deux canons ou mobs comparés,
- mêmes ennemis,
- résultat évident,
- overlay “Which one wins?”

Recording :

- option A,
- option B,
- résultat comparatif,
- CTA.

### 8. Reward dopamine

Hypothèse : la récompense visuelle finale augmente la satisfaction et rend l’ad plus mémorable.

Mutation :

- coins amplifiés,
- étoiles séquentielles,
- compteur qui roule,
- confettis renforcés.

Recording :

- destruction base,
- explosion pièces,
- compteur qui monte,
- bouton CTA.

## Format de sortie attendu pour chaque scénario

Pour chaque scénario généré, retourner :

```json
{
  "scenario": {},
  "human_summary": {
    "trend_targeted": "",
    "gameplay_changed": "",
    "why_it_should_work": "",
    "recording_moment": "",
    "keep_kill_metric": ""
  }
}
```

## Critères d’acceptation

La tâche est terminée seulement si :

- `AdScenarioSpec` existe et est typé,
- un schema Zod valide les scénarios,
- au moins 8 templates existent,
- un générateur produit un variant à partir d’un scénario,
- chaque variant est sauvegardable et rejouable,
- chaque variant inclut un recording plan 9:16,
- chaque scénario inclut une hypothèse testable,
- aucun fichier protégé dans `game/` ou `references/` n’est modifié,
- le flow de démo reste runnable,
- `npm run typecheck` passe.

## Ce qu’il ne faut pas faire

Ne fais pas :

- des reskins cosmétiques sans changement gameplay,
- des prompts libres non validés,
- des variants non sauvegardables,
- des scénarios qui mélangent plusieurs hypothèses,
- des modifications destructives,
- des changements directs dans `game/`,
- des systèmes méta lourds hors scope,
- des ads impossibles à comprendre sans lire le texte.

## Résultat attendu

À la fin, un humain doit pouvoir donner à l’agent une tendance comme :

```text
Fail-bait ads with impossible choices are trending.
```

Et l’agent doit produire automatiquement :

1. un scénario structuré,
2. un variant jouable,
3. un plan de recording,
4. un prompt de creative vidéo,
5. un playtest checklist,
6. des métadonnées pour comparer le résultat.
