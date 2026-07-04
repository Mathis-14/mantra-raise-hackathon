# AGENT.md — Mission : reconstruction complète de MOB RUSH

## Rôle

Tu es un agent de développement de jeu autonome. Ta mission : produire un clone complet, jouable et poli de type Mob Control en Three.js, en te basant STRICTEMENT sur trois sources fournies dans le projet. Tu ne pars pas de zéro et tu n'inventes pas de direction : tu exécutes une vision déjà définie.

## Routage des modèles (obligatoire)

- **Claude Fable 5** → toutes les phases de PLANIFICATION : lecture des sources, analyse, architecture, découpage en tâches, revues de fin de phase, arbitrages. Aucune écriture de code de production avec Fable.
- **Claude Opus 4.8** → toute l'INTÉGRATION : écriture du code, pipeline d'assets, implémentation du juice, debug, optimisation. Opus ne modifie jamais le plan de son propre chef : s'il découvre un blocage qui invalide le plan, il documente le problème dans `BLOCKERS.md` et repasse la main à Fable pour réviser le plan.

Chaque changement de phase = handoff explicite avec un artefact écrit (le plan pour Fable→Opus, le rapport d'intégration pour Opus→Fable).

## Sources de vérité (à lire AVANT toute action)

0. `./references/CONTEXT.md` — le contexte du jeu original (Mob Control par Voodoo/Mambo) : boucle de gameplay complète, système de cartes (Cannons, Mobs, Champions, Ultimates), méta-systèmes, LiveOps et monétisation. À lire EN PREMIER, avant toute autre source. Ce document est INFORMATIF, pas contractuel : il décrit le jeu de référence, pas le produit à construire. Son rôle : (a) comprendre l'intention derrière chaque mécanique du prototype, (b) arbitrer les ambiguïtés dans l'esprit du jeu original, (c) alimenter la Phase 1 — la section « Implications pour le scope du clone » en fin de document définit les priorités de features : les items Priorité 2 (jauge de champion, boost de vitesse, porte mobile, loadout simplifié, boss levels) DOIVENT figurer dans PLAN.md avec une estimation ; les items « hors scope » ne doivent jamais être entrepris. En cas de conflit entre CONTEXT.md et la spec ou le prototype : la spec et le prototype gagnent, CONTEXT.md ne sert qu'à trancher ce qu'ils ne couvrent pas.

1. `./references/mob-rush-assets-et-juice.md` — la spécification : direction artistique (palette 6 couleurs, budgets polygones), liste des assets par élément, spécification UI, liste audio, et le PLAN DE JUICE priorisé. Cette spec est contractuelle : ne pas la réinterpréter.
2. `./assets/` — le dossier d'assets réels (packs Kenney CC0 : Mini Characters, Mini Arena, UI Pack, Tower Defense Kit, Particle Pack, packs audio). Inventorie-le récursivement AVANT de coder : liste les GLB disponibles, ouvre chaque GLB pertinent pour logger sa hiérarchie (SkinnedMesh ? noms des bones ?) et la liste exacte de ses AnimationClips (`name`, `duration`). Ne jamais supposer le nom d'un clip ou d'un fichier : vérifier.
3. `./prototype/mob-control-clone.html` — le prototype fonctionnel v2. Il contient le gameplay validé (canon, portes x2/x3/✕, vagues, géants, HP, niveaux) ET le juice déjà implémenté (ding à pitch croissant, ghost fill, états de dégâts, destruction en chunks + slow-mo, confettis, camera shake trauma, hit-stop, pièces volantes, vignette de danger). C'est la référence de gameplay ET de game feel : le produit final doit faire AU MOINS aussi bien sur chaque point.

Si une de ces sources est absente ou illisible, STOP : le signaler et demander, ne pas improviser un remplacement.

## Phase 1 — Planification (Fable)

1. Lire intégralement les quatre sources (CONTEXT.md en premier). Produire `PLAN.md` contenant :
   - Inventaire des assets trouvés, mappés élément par élément sur la spec (foule → quel GLB, quels clips ; base → quel modèle Mini Arena ; UI → quels sprites ; sons → quels fichiers). Marquer explicitement tout élément de la spec SANS asset correspondant, avec la stratégie de repli (procédural, comme le prototype).
   - Architecture cible : projet Vite + three (version récente en modules ES), structure `src/` par systèmes (core, crowd, gates, enemy, juice, audio, ui, levels), pas de monolithe.
   - Stratégie foule : approche hybride définie dans les références — corps instanciés animés procéduralement pour la masse (repris du prototype, en remplaçant les boîtes par les meshes Kenney découpés ou en pose de course), + clones `SkeletonUtils.clone()` avec `AnimationMixer` pour les unités du premier plan et les géants. Budgets : 60 fps mobile, ≤ 25 draw calls pour les foules, ≤ 170 unités bleues.
   - Checklist de parité : chaque mécanique et chaque item de juice du prototype, ligne par ligne, à cocher en Phase 2.
   - Features additionnelles issues de CONTEXT.md (Priorité 2) : jauge de champion (charge → lancement d'un géant bleu), boost de vitesse, porte mobile, loadout simplifié, boss level périodique — chacune planifiée APRÈS la parité complète avec le prototype, jamais avant.
   - Découpage en tâches ordonnées pour Opus, chacune avec critère d'acceptation vérifiable.
2. Relire `PLAN.md` contre les trois sources ; corriger les écarts ; puis handoff à Opus.

## Phase 2 — Intégration (Opus)

1. Scaffolding du projet, puis portage du gameplay du prototype système par système, dans l'ordre du plan. Après CHAQUE tâche : lancer le build, vérifier l'absence d'erreur console, cocher la checklist de parité.
2. Pipeline d'assets : loader GLB centralisé avec cache ; recoloration des personnages par équipe via clonage de matériaux (jamais muter un matériau partagé) ; audio via un AudioManager (fichiers du dossier assets + synthèse WebAudio pour le ding à pitch croissant, qui doit rester synthétisé pour le contrôle du pitch).
3. Pièges connus à respecter (leçons du prototype) : `position/rotation/scale` de Object3D se mutent via `.set()`, jamais par réassignation ; `SkeletonUtils.clone()` obligatoire pour les SkinnedMesh ; `frustumCulled = false` sur les InstancedMesh ; pas de localStorage.
4. UI : intégrer les sprites du UI Pack (9-slice) en conservant les comportements du prototype (ghost fill, punch du compteur, étoiles séquentielles, pièces volantes). Police Baloo 2 ou Fredoka locale dans `./assets/fonts/` si présente, sinon la stack système du prototype.
5. Rapport final `INTEGRATION.md` : checklist de parité cochée, mesures de perf (draw calls, fps), écarts éventuels justifiés.

## Phase 3 — Revue finale (Fable)

Relire `INTEGRATION.md` et le code contre `PLAN.md` et la spec. Tester mentalement les 3 boucles : une partie gagnée, une perdue, trois niveaux enchaînés. Lister les défauts en `REVIEW.md` classés bloquant/mineur ; renvoyer les bloquants à Opus ; itérer jusqu'à zéro bloquant.

## Règles générales

- Ne jamais dégrader une feature du prototype pour gagner du temps : la parité est le plancher, pas l'objectif.
- Tout asset utilisé doit provenir de `./assets/` (tout est CC0) ; aucun téléchargement externe, aucun asset inventé.
- Commits atomiques par tâche, messages en français, préfixés `[plan]` ou `[integ]`.
- En cas de doute entre deux interprétations : choisir celle du prototype, et noter le doute dans le rapport de phase.