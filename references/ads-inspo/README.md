# references/ads-inspo — inspiration pour la génération de scénarios d'ads

Déposez ici des **références visuelles d'ads hypercasual** (concurrents, tendances marché) qui inspirent
la génération de scénarios publicitaires jouables pour Mob Rush.

## Quoi mettre

- `*.png` / `*.jpg` / `*.webp` — captures d'écran d'ads (hook, choix de porte, foule, boss, récompense).
- `*.gif` / `*.mp4` — courts extraits d'ads virales à imiter (fail-bait, crowd explosion, champion release…).

Nommez les fichiers par angle créatif quand c'est possible, ex. `fail-bait_wrong-gate_competitorX.mp4`,
`crowd-explosion_500mobs.gif`, `reward-jackpot_coins.png`.

## Comment c'est utilisé

`src/lib/ad-scenarios` indexe ce dossier (`loadInspiration()`, lecture seule) et fournit l'inspiration au
générateur agent (`composeScenario`) : l'agent s'appuie sur ces références + le vocabulaire de blocs
gameplay (ennemis, portes, obstacles, style de carte) pour composer des `AdScenarioSpec` variés, puis
validés par Zod avant de produire un variant jouable en 9:16.

Le dossier peut être vide : la génération retombe alors sur les 8 templates seed
(`src/lib/ad-scenarios/src/templates.ts`).

> Dossier de références marché — protégé (voir `AGENTS.md`). Les variants ne modifient jamais le jeu
> source ; ils copient le HTML et injectent une config `window.__MOB_VARIANT__`.
