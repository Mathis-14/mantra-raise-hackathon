# RÉFÉRENCE — Mob Control (Voodoo / Mambo Studio)

Document de contexte pour l'agent. Synthèse des fonctionnalités du vrai jeu, compilée en juillet 2026 à partir de sources publiques (fiches stores, blog Voodoo, analyses Reverse Nerf / Udonis / Gamesforum, guides joueurs). Objectif : servir de carte du territoire — le clone n'implémente PAS tout ça ; il s'en inspire selon le scope défini dans PLAN.md.

## 1. Fiche d'identité

- Développé par Mambo Studio (studio interne Voodoo, ~12 personnes), sorti le 13 avril 2021 sur iOS/Android. Portages web, Steam (mai 2024) et Switch.
- Premier grand succès hybrid-casual de Voodoo : parti d'un hyper-casual à pub, devenu leur plus gros jeu, avec des revenus IAP en croissance continue (~2-2,5 M$/mois, ~73 M$ cumulés, ~3,6 M de joueurs quotidiens début 2026).
- Crossover Transformers avec Hasbro en 2024. Mises à jour mensuelles (nouvelles saisons, mécaniques, cannons).

## 2. Boucle de gameplay (core loop)

- Le joueur contrôle un canon en bas de l'écran : maintenir pour tirer un flux continu d'unités ("mobs"), glisser pour viser.
- Les mobs traversent des portes qui additionnent, soustraient ou multiplient leur nombre. Le cœur du plaisir : viser les bonnes portes et voir la foule exploser en taille.
- Objectif : atteindre et détruire la/les bases ennemies tout en défendant la sienne contre les vagues adverses. Les mobs opposés s'annihilent au contact.
- Jauge de surcharge à côté du canon : quand elle se remplit, le joueur peut lancer un CHAMPION (unité géante puissante) pour percer les défenses. Le déclenchement est un choix stratégique (timing).
- Éléments de niveau spéciaux : boosts de vitesse, multiplicateurs, portes mobiles, portes surprises, tours à distance (Ranged Tower), obstacles, "death gates" (qui repoussent et blessent les champions au lieu de les tuer, depuis un patch), bases ennemies de formes variées (pyramide…).
- Variantes de combat : Multifaction (1 contre 2 adversaires simultanés), Boss Levels (layouts spéciaux à bonus), niveaux bonus chronométrés (30 s) après un diorama, Castle Raid, Story Mode (campagnes narratives liées aux nouveaux cannons).

## 3. Système de cartes (le cœur de la méta)

Quatre familles de cartes, collectionnées via des booster packs de raretés différentes gagnés en combat, améliorées avec des pièces + doublons dans l'Armory (armurerie) :

- **Cannons** : définissent le style de tir. Exemples connus : Normal, Single-shot, Double, Shotgun, Triple (3 mobs à la fois), Sniper, Flamethrower (brûle les ennemis et booste les mobs), Railshot. Chacun a son propre rythme et sa stratégie.
- **Mobs** : le type d'unité tirée, avec stats propres (PV/force). Exemples : Normie, Paper Bag, Knight (tank), Soldier, Bear, Raccoon (rapide), Giga Chicken.
- **Champions** : la grosse unité de la jauge de surcharge, avec compétence principale + compétence de zone. Exemples : Explodon (Jump & Crush + Final Boom), Nexus, Sirion, Mobzilla.
- **Ultimates** : cartes spéciales déclenchables en combat quand une jauge dédiée se charge (chargée par le temps + les dégâts des champions). Exemples : Rocket Barrage (bombardement), Mass Abduct(ion), Mob Copter.

Le joueur compose un LOADOUT (1 cannon + 1 mob + 1 champion + 1 ultimate). Le matchmaking équilibre selon le niveau des cartes (±7 niveaux). Les cartes ont des chemins d'évolution visuelle au fil des niveaux.

## 4. Progression et méta-systèmes

- **Dioramas / City Builder** : entre les combats, le joueur dépense des briques bleues lootées dans les niveaux pour construire des îles flottantes décoratives (bâtiments, paysages). Système de collection/complétion — c'est la carotte de moyen terme et la signature méta du jeu.
- **Championship Stars & Champions League** : étoiles gagnées en combats/tournois/construction ; classement par ligues jusqu'aux Immortal Tiers (statut d'élite).
- **Shields / Raids** : les victoires donnent des boucliers protégeant la base des attaques d'autres joueurs. Attaque directe possible via les leaderboards (avec cooldown), et mécanique de revanche/contre-attaque.
- **Clans** : avec rôles (leader, co-leaders).
- **Season Pass / Battle Pass** : contenu mensuel, quêtes, ~4,99 $ (réduit avec l'abonnement VIP), avec unités exclusives (une pour les payeurs, une pour les joueurs très engagés qui finissent le pass). Skins saisonniers thématiques (piñata, St Patrick, Pâques…).

## 5. LiveOps (événements récurrents hebdomadaires)

- **Piggy Race** (week-ends) : course à 50 participants (avec bots) par jalons, en lootant/dépensant des briques ; cagnotte commune redistribuée au classement.
- **World Clash** (mar-mer) : affrontement d'équipes mondiales.
- **Loadout Challenge** (2×/sem.) : victoires avec des loadouts imposés — force la variété et pousse à l'upgrade.
- **Collect Challenges** (3 versions/sem.) : missions rapides de collecte d'objets dans les niveaux via des portails ; récompenses étoiles (Stardust), cartes (Card Mayhem) ou pièces (GoldRush).
- Autres : Egg Hunt, Flash Challenges, Mech Hunt, Rewards Week, Welcome Back flow, offres quotidiennes de cartes contre pièces.
- Philosophie : événements low-cost qui recyclent le core gameplay avec de micro-variations, cadence hebdo pour créer l'habitude, récompenses uniques par événement pour pousser à participer à tous.

## 6. Monétisation

- Modèle hybride pubs + IAP : interstitiels/rewarded ads, "Skip'Its" (accélérer sans regarder les pubs), no-ads permanent, Premium Pass, VIP subscription, offres personnalisées, booster packs. Contient des loot boxes.
- Stratégie : IAP bon marché ciblant les frictions des petits payeurs (pass, no-ads) + plafond de dépense élevé pour les gros joueurs via l'upgrade des cartes.

## 7. UX et game feel (à retenir pour le clone)

- Onboarding intégré au premier niveau (apprendre en jouant, pas de tutoriel séparé), prompts interactifs.
- Feedback immédiat et lisible sur chaque action ; UI à faible charge cognitive ; difficulté progressive calibrée.
- La satisfaction "arcade" de voir les nombres grossir est le pilier du jeu ET de ses pubs (300-500 créas/semaine).

## 8. Implications pour le scope du clone

Priorité 1 (déjà dans le prototype) : canon + visée, portes multiplicatrices, annihilation de foules, base à HP, géants, niveaux.
Priorité 2 (différenciant, faisable) : jauge de champion (maintien/charge → lancer un géant bleu), éléments de niveau (boost de vitesse, porte mobile), loadout simplifié (2-3 cannons, 2-3 mobs aux stats différentes), boss level tous les 5 niveaux.
Priorité 3 (méta légère) : pièces → déblocage de skins/cannons dans une armurerie simplifiée, mini-diorama de construction entre les niveaux.
Hors scope raisonnable : PvP/raids, clans, événements LiveOps, battle pass, cartes à rareté/boosters.