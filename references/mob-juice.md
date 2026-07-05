# MRUSH — Spécification des assets & plan de juice

## 0. Direction artistique globale (à respecter pour TOUT asset)

Avant la liste, le cadre. Un jeu hyper-casual tient sur la cohérence, pas sur la richesse.

- **Style** : low-poly à facettes, couleurs plates (vertex colors ou palette-texture 64×64, PAS de textures détaillées), silhouettes rondes et lisibles.
- **Palette** (6 couleurs max à l'écran) :
  - Bleu joueur `#38B6FF` + accent `#2D7DFF`
  - Rouge ennemi `#FF4D6D` + accent `#D63354`
  - Piste neutre `#EDE7FF`, environnement `#7C5CFF` / `#2B1D6B`
  - Récompense `#FFD54A` (pièces, étoiles — réservé au feedback positif)
- **Éclairage** : 1 directionnelle + 1 hémisphérique, ombres optionnelles (une seule shadow map basse résolution ou faux blob shadows en quad).
- **Budget** : < 800 tris par personnage, < 1500 par bâtiment, scène totale < 50k tris.
- **Format** : GLB (GLTF binaire), animations embarquées, échelle 1 unité = 1 m.

---

## 1. Assets 3D — élément par élément

### 1.1 Unité de foule (bleue)
- **Style** : humanoïde chibi (grosse tête ~40% du corps), bras courts, pas de doigts, visage minimal (2 yeux). Proportions type Fall Guys / Crowd City.
- **Specs** : 400–700 tris, riggé (squelette ≤ 20 bones), animations : `Run` (loop, ~0.6 s), `Attack` (punch court), `Death` (optionnelle — un pop de particules la remplace bien).
- **Source** : Quaternius "Ultimate Animated Character Pack" (CC0) — recolorer en bleu via material.
- **Note technique** : une seule AnimationClip partagée, offset temporel aléatoire par instance.

### 1.2 Unité géante (bleue chargée / rouge boss)
- **Style** : LE MÊME modèle scalé ×2.2 + un accessoire distinctif (casque, épaulières) pour justifier la puissance. La réutilisation est une feature, pas une triche.
- **Specs** : +150 tris max pour l'accessoire, animation `Run` ralentie à 0.7× (le poids se lit dans le rythme).

### 1.3 Canon du joueur
- **Style** : trapu, canon court et large (bouche évasée type "party cannon"), 2 meshes séparés impérativement : socle + fût (le fût recule au tir).
- **Specs** : 300–600 tris, pivot du fût à sa base arrière.
- **Source** : Kenney "Tower Defense Kit" ou modélisation maison en 20 min dans Blockbench.

### 1.4 Base ennemie (tour)
- **Style** : tour de château cartoon, large en bas, drapeau rouge animable au sommet.
- **Specs** : 800–1500 tris, **3 états de dégâts** en meshes séparés ou morph : intact / fissuré / en ruine (swap à 66% et 33% HP) + version "débris" (6–10 chunks) pour l'explosion finale.
- **Source** : Kenney "Castle Kit" (CC0) — contient déjà des variantes détruites.

### 1.5 Portes multiplicatrices
- **Style** : cadre 3D (2 poteaux + linteau) + panneau translucide émissif. Le texte reste procédural (CanvasTexture) : c'est plus net et localisable.
- **Specs** : cadre 100 tris, matériau émissif cyan (positif) / rouge (piège), le panneau pulse en opacité.
- **Source** : procédural (déjà fait dans le proto), habiller juste les poteaux.

### 1.6 Piste et environnement
- **Style** : piste modulaire en tuiles 4×4 m, bordures arrondies. Hors-piste : "îles" flottantes ou plaine stylisée avec dégradé vers le fog.
- **Props** (5–6 suffisent) : rocher ×2 variantes, arbre boule, nuage low-poly (flotte dans le ciel), buisson, cristal décoratif. 100–300 tris chacun.
- **Source** : Quaternius "Ultimate Nature Pack", Kenney "Nature Kit" (CC0).

### 1.7 Projectiles / pièces
- **Pièce** : cylindre aplati doré 60 tris, rotation Y constante — c'est tout.
- **Étoiles de victoire** : star 2D extrudée, 50 tris.

---

## 2. Assets VFX (sprites de particules)

Toutes en PNG 128×128, **blanches sur fond transparent** (teintées par code), additive blending.

| Sprite | Usage |
|---|---|
| Cercle flou (soft glow) | pops de mort, muzzle flash |
| Étoile 4 branches | impacts, ramassage pièce |
| Anneau fin | onde de choc porte / explosion base |
| Confetti (rectangle simple) | victoire — instancié en 3D, pas en sprite |
| Trait/spark allongé | traînées de tir |

**Source** : Kenney "Particle Pack" (CC0) couvre tout. Lib recommandée : `three.quarks` ou système InstancedMesh maison (déjà amorcé dans le proto).

---

## 3. Assets UI — élément par élément

Le look UI hyper-casual = "candy" : tout est rond, épais, avec une ombre portée dure en bas (effet bonbon 3D). Réalisable à 100% en HTML/CSS — ne télécharge des sprites que si tu veux aller vite.

### 3.1 Typographie
- **Display** (titres, gros chiffres) : **Baloo 2** ExtraBold ou **Fredoka** SemiBold (Google Fonts, OFL).
- **Utilitaire** (compteurs, labels) : la même en Medium — UNE famille, deux graisses, c'est le standard du genre.
- Contour sombre ou text-shadow dure sous tous les textes posés sur le jeu.

### 3.2 Boutons
- **Style** : pilule ou rectangle radius 24px, dégradé vertical 2 tons, **ombre dure 6px en bas** (le fameux `box-shadow: 0 6px 0`), qui s'écrase à 2px au press.
- Variantes : primaire (bleu), succès (vert `#4CD964`), danger (rouge), secondaire (violet sombre translucide).
- **Source** : CSS pur (déjà dans le proto) ou Kenney "UI Pack" si tu préfères des sprites 9-slice.

### 3.3 Icônes
- **Style** : flat, 2 tons + outline sombre 2px, coins ronds. Set nécessaire : pièce 🪙, bouclier/cœur, étoile, engrenage (réglages), haut-parleur on/off, flèche replay, cadenas (skins bloqués), coche.
- **Specs** : SVG (scalable) ou PNG @2x 96px.
- **Source** : Kenney "Game Icons" (CC0), ou icônes emoji système en prototypage (ce que fait le proto).

### 3.4 Barres de progression
- HP base ennemie : barre horizontale radius plein, fond sombre translucide, remplissage dégradé rouge→rose, **liseré blanc 2px**, et un "ghost fill" jaune qui suit avec retard (voir juice).
- Progression de niveau (optionnel) : rail de points entre "NIV 4 → NIV 5" en haut d'écran.

### 3.5 Panneaux / popups
- **Style** : carte radius 32px, fond violet sombre, **ruban de titre** qui déborde en haut (trapèze jaune ou rouge avec le texte "VICTOIRE"), 3 étoiles au-dessus.
- **Source** : CSS ou Kenney "UI Pack — Adventure".

### 3.6 HUD in-game
- Pilules translucides (backdrop-blur) pour niveau et pièces — déjà en place.
- Texte flottant de dégâts / multiplicateurs : rendu en sprites 3D (CanvasTexture) dans la scène, PAS en HTML (ils doivent suivre les objets).

---

## 4. Assets audio — liste de courses précise

Format : OGG + fallback M4A, mono, < 100 ko chacun. Sources : Kenney (Interface/Impact/Digital Audio packs, CC0), jsfxr (sfxr.me) pour générer, Freesound (filtre CC0).

| Son | Style | Note |
|---|---|---|
| Tir unité | "pop" court bouché (bouchon de champagne soft) | ±10% de pitch aléatoire, indispensable |
| Passage porte positive | "ding" cristallin | **pitch qui monte à chaque passage rapproché** (combo) |
| Passage piège ✕ | buzz court étouffé | |
| Collision unité/unité | pop de bulle grave | limiter à ~10 déclenchements/s max |
| Impact sur base | thud sourd + petit crack | |
| État de dégâts base | craquement de pierre | aux paliers 66% / 33% |
| Explosion finale | boom + gravats | + slow-mo, voir juice |
| Rouge franchit ta ligne | alarme descendante courte | |
| Gain de pièces | tick-tick-tick métallique | un tick par pièce comptée |
| Bouton UI | clic mou "bulle" | |
| Victoire | jingle 3 notes montantes | |
| Défaite | 2 notes descendantes molles | |
| Musique | loop 60–90 s, ukulélé/marimba léger, ~110 BPM | volume -12 dB sous les SFX |

---

## 5. PLAN DE JUICE — par moment de jeu, priorisé

Principe : chaque action du joueur reçoit ≥ 3 feedbacks simultanés (visuel + son + mouvement). Implémentation générique : springs/lerp, camera shake par "trauma" (valeur 0–1 qui décroît, shake = trauma², recette Squirrel Eiserloh), hit-stop via timescale.

### 5.1 Le tir (le geste répété 500 fois par partie — priorité absolue)
1. **Recul du fût** : translation arrière 0.3 u + retour spring (déjà amorcé via scale).
2. **Muzzle flash** : sprite glow 2 frames à la bouche.
3. **Squash & stretch au spawn** : l'unité naît écrasée (1.3, 0.6, 1.3) et rebondit vers (1, 1, 1) en 150 ms.
4. **Son** pop avec pitch aléatoire ±10%.
5. **Micro-tremblement** du canon uniquement (pas de camera shake — trop fréquent).

### 5.2 La foule en mouvement
1. Bobbing vertical désynchronisé par unité (fait) + légère inclinaison avant.
2. Offsets d'animation de course aléatoires quand tu passeras aux modèles animés.
3. Densité sonore : un léger "patter" de pas dont le volume suit `min(1, count/100)`.

### 5.3 Le passage de porte (le moment dopamine)
1. **Flash** du panneau (opacité ×2, 100 ms) + **punch scale** du texte (1 → 1.3 → 1).
2. Texte flottant "+1" / "+2" qui monte et fade au-dessus de la porte.
3. Anneau de particules au sol.
4. **Ding à pitch croissant** : chaque passage dans les 300 ms suivant le précédent monte d'un demi-ton (reset après une pause). C'est LE son signature du genre.
5. Les clones jaillissent avec un petit saut latéral, pas une apparition sèche.

### 5.4 Combats et impacts
1. Pop de mort : scale-out + 4 particules étoile teintées couleur de l'équipe (fait en version simple).
2. **Hit-stop 40 ms** (timescale 0.05) uniquement quand un géant meurt.
3. Le géant clignote blanc (matériau émissif flashé) à chaque coup encaissé + chiffre de dégâts flottant.
4. Camera shake trauma +0.15 par mort de géant, +0.05 par pop normal plafonné.

### 5.5 La base ennemie
1. Squash à chaque impact (fait) + chiffre "-1" flottant rouge.
2. **Ghost fill** sur la barre de HP : la barre jaune fantôme rattrape la vraie valeur avec 400 ms de retard — rend les rafales de dégâts lisibles et satisfaisantes.
3. Fissures visuelles aux paliers 66% / 33% (swap de mesh) + craquement sonore + shake 0.3.
4. **Destruction finale** : timescale 0.25 pendant 600 ms → explosion en chunks physiques (vélocités radiales + gravité simple) → confettis → jingle. C'est le climax, dépense ton budget ici.

### 5.6 Danger et défaite
1. Rouge qui approche de ta ligne (< 6 u) : pulsation d'une vignette rouge aux bords de l'écran + battement grave.
2. Franchissement : shake 0.4, flash rouge plein écran 80 ms, **haptics** `navigator.vibrate(80)` sur mobile.
3. Défaite : désaturation progressive (post-process ou lerp des couleurs), caméra qui s'affaisse de 1 u, boutons qui arrivent avec 300 ms de retard (laisser encaisser).

### 5.7 Victoire et méta (la boucle hybrid-casual)
1. Slow-mo → confettis 3D (150 quads instanciés, rotations aléatoires, gravité).
2. Popup : les **3 étoiles claquent une par une** (scale spring + son) à 200 ms d'intervalle.
3. **Compteur de pièces qui roule** : les pièces volent physiquement du centre vers le compteur HUD (courbe de Bézier), chaque arrivée = tick sonore + punch scale du compteur. Le feedback méta le plus rentable du genre.
4. Bouton "NIVEAU SUIVANT" qui pulse doucement (scale 1 → 1.05, 1.2 s loop).

### 5.8 Ambiance permanente (juice passif)
1. Nuages low-poly qui driftent lentement.
2. Drapeau de la base qui ondule (shader vertex simple ou rotation sinusoïdale).
3. Dégradé du ciel légèrement animé + fog assorti.
4. Le canon "respire" à l'idle (scale Y ±2%, 2 s).

---

## 6. Priorisation — si tu n'as que 2 jours

1. **Squash & stretch spawn + recul canon + pitchs aléatoires** (30 min, transforme le feeling du tir)
2. **Ding à pitch croissant sur les portes + punch du texte** (1 h, le cœur dopaminique)
3. **Ghost fill + fissures + destruction finale en slow-mo** (3–4 h, le climax)
4. **Pièces qui volent vers le compteur** (2 h, vend la méta)
5. **Camera shake trauma-based centralisé** (1 h, profite à tout le reste)

Modèles animés Quaternius, musique et haptics viennent APRÈS ces cinq points : le juice procédural rapporte plus que les assets au début.