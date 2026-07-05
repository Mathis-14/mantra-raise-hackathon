# PLAN.md — MOB RUSH : plan d'intégration (Phase 1, Fable)

> Artefact de handoff Fable → Opus, conformément à AGENT.md.
> Sources lues intégralement, dans l'ordre : `references/CONTEXT.md`, `references/mob-juice.md` (spec contractuelle),
> `game/assets/` (inventaire + inspection GLB), `game/mob-control-clone.html` (prototype), + les 5 GIFs de
> `references/mob-control-gifs/` (référence visuelle du jeu original).
> Opus ne modifie pas ce plan : tout blocage → `BLOCKERS.md` + retour à Fable.

---

## 0. Constats et arbitrages de planification (à lire avant tout)

**C1 — Emplacements des sources.** AGENT.md référence `./assets/` et `./prototype/mob-control-clone.html` ;
les chemins réels sont `game/assets/` et `game/mob-control-clone.html` (candidats uniques, non ambigus).
La spec a été fournie sous `references/mob-juice.md` (et non `mob-rush-assets-et-juice.md`).

**C2 — Prototype « v2 ».** AGENT.md décrit un prototype contenant déjà ding à pitch croissant, ghost fill,
états de dégâts, destruction en chunks + slow-mo, confettis, camera shake trauma, hit-stop, pièces volantes,
vignette de danger. **Le fichier réel ne les contient pas** (audio = beeps simples ; juice = squash de la base,
punch du fût, pops instanciés, flash de niveau). Ces items figurent tous dans la spec §5, qui est contractuelle :
ils restent donc **exigés**, mais leur référence d'implémentation est la spec, pas le prototype. La checklist de
parité (§5 de ce plan) est établie ligne par ligne sur le **fichier réel** ; le plan de juice (§6) couvre le reste.
Aucune exigence n'est perdue.

**C3 — Plafond d'unités bleues.** Prototype : `MAX_BLUE = 380` (sphères). AGENT.md impose « ≤ 170 unités
bleues » pour le produit final (personnages animés). **170 retenu** : directive explicite d'AGENT.md, la
mécanique (refus de spawn au-delà du cap) est inchangée ; en partie normale le simultané dépasse rarement ce
seuil. `MAX_RED = 160` conservé du prototype.

**C4 — Palette.** La palette du prototype coïncide déjà avec la spec §0 (fond `#2B1D6B`, piste `#EDE7FF`,
rails `#7C5CFF`, bleu `#38B6FF`/`#2D7DFF`, rouge `#FF4D6D`/`#D63354`, or `#FFD54A`). Les assets Kenney
(colormap orange/vert/violet) seront **recolorés** pour s'y conformer (voir pipeline §3.3).

**C5 — Doutes notés (règle AGENT.md).**
- Pas de « boom » d'explosion ni de musique dans les packs audio → synthèse WebAudio (explicitement autorisée
  par AGENT.md pour l'AudioManager).
- Pas de Castle Kit (base château de la spec §1.4) → base composite en pièces platformer-kit (repli documenté §2).
- Vu dans les GIFs mais **non retenu** (ni spec ni prototype, scope discipline) : compteur HP numérique affiché
  sur la base (la spec §3.4 impose une barre HUD), portes additives « +1 » en chaîne, portail violet de spawn
  des rouges. Notés comme extensions futures possibles, à ne pas entreprendre en Phase 2.
- Budget « scène totale < 50k tris » (spec §0) vs foule : 170 personnages × 723 tris ≈ 123k tris **rendus** en
  pointe. Arbitrage : le 50k s'applique au décor/assets statiques ; pour la foule, ce sont les budgets
  spécifiques d'AGENT.md qui prévalent (≤ 170 unités, ≤ 25 draw calls, 60 fps mobile). Mesures réelles
  (`renderer.info.render.triangles`) à consigner dans INTEGRATION.md.

**C6 — Enseignements des 5 GIFs + 3 captures marketing** (`references/mob-control-gifs/`, informatif) :
jauge de champion = **pilule verticale à côté du canon** + prompt « RELEASE! » (GIF 1 & 5) ; champion = géant
avec accessoire distinctif + **colonne de lumière au spawn** ; vignette rouge pulsée aux bords en danger
(GIF 1) ; victoire = fontaine de pièces + compteur qui roule (GIF 5) ; portes = panneaux à cadre lisibles ;
foules = masses denses monochromes par équipe (valide la recoloration flat §3.3). Les captures webp
(gameplay1/2/3) confirment : portes « +1 » en chaîne et compteurs numériques sur les bases, récurrents dans le
jeu original mais **non retenus** (cf. C5) ; champions à silhouette très distinctive (validant l'accessoire +
échelle ×2.2 du design P2).

---

## 1. Inventaire des assets, mappé sur la spec

Inspection outillée des **219 GLB** (hiérarchie, skins, clips exacts — script `glb-inspect.js`, résultats
complets dans le scratchpad de session). Tout est CC0 (licences vérifiées dans chaque pack).

### 1.1 Unité de foule bleue (spec §1.1)

| Spec | Réalité assets | Verdict |
|---|---|---|
| Humanoïde chibi, 400–700 tris, riggé ≤ 20 bones | `game/assets/models/mini-characters/Models/GLB format/character-{male,female}-{a..f}.glb` — 12 modèles, **690–876 tris**, 2 SkinnedMesh (`body-mesh` + `head-mesh`), 2 skins de **7 joints** identiques (`root`, `leg-left`, `leg-right`, `torso`, `arm-left`, `arm-right`, `head`), 1 matériau `colormap` (palette-texture partagée) | ✅ (female-a à 876 tris : légèrement au-dessus, acceptable — prendre male-a/b/d/e pour la masse) |
| Clips `Run` (~0.6 s), `Attack`, `Death` | **Les clips ne portent PAS ces noms.** 32 clips par modèle, noms exacts utiles : **`sprint` (0.5 s)**, **`walk` (0.667 s)**, **`attack-melee-right` (0.417 s)**, **`die` (0.333 s)**, `idle` (1.333 s), `static` (0.1 s) | ✅ mapping : Run→`sprint`, Attack→`attack-melee-right`, Death→`die` (+ pop de particules) |
| Une seule clip partagée, offset aléatoire par instance | Pour la masse instanciée : pose de course **cuite** (bake, §3.3) + bobbing procédural déphasé (repris du proto). Pour héros/géants : `AnimationMixer` avec `time` offsetté | ✅ |

### 1.2 Unité géante (spec §1.2)

| Spec | Réalité assets | Verdict |
|---|---|---|
| Même modèle ×2.2 + accessoire (+150 tris max), `Run` à 0.7× | Clone `SkeletonUtils.clone()` d'un mini-character, `sprint` avec `timeScale 0.7`. Accessoire : **`aid-sunglasses.glb` (62 tris)** attaché au bone `head` (pas de casque/épaulières dans les packs — repli le plus lisible) | ✅ (repli accessoire documenté) |
| Boss visuellement distinct (P2) | `platformer-kit/character-oozi.glb` ou `character-oobi.glb` (918–1096 tris, riggés 6 bones, mêmes noms de clips sans `wheelchair-*`) | ✅ option boss P2 |

### 1.3 Canon du joueur (spec §1.3)

| Spec | Réalité assets | Verdict |
|---|---|---|
| Trapu, bouche évasée « party cannon », 300–600 tris, 2 meshes socle+fût | **`blaster-kit/.../blaster-b.glb` (368 tris)** : boxy, énorme bouche ronde évasée — choix validé sur planche de previews. Alternatives : `blaster-l` (450), `blaster-n` (410). Socle : **procédural** (box + cylindre pivot, comme le proto) ; le blaster est le fût, pivot reculé à sa base | ✅ (socle procédural = repli conforme spec « modélisation maison ») |
| Fût recule au tir | Blaster = mesh séparé → translation arrière 0.3 u + spring (spec 5.1) | ✅ |

### 1.4 Base ennemie (spec §1.4) — **SANS asset direct, repli composite**

| Spec | Réalité assets | Verdict |
|---|---|---|
| Tour château cartoon 800–1500 tris, drapeau animable | **Pas de Castle Kit.** Repli : composite platformer-kit recoloré rouge — 2×2 `block-grass-large-tall` empilés + `block-grass-low-large` en couronne + `flag.glb` (110 tris) au sommet (ondulation sinusoïdale). Total ≈ 900 tris | ⚠️ repli documenté |
| 3 états de dégâts (intact / fissuré / ruine, swap à 66 % / 33 %) | Pas de variantes fissurées dans les packs. Repli : état 2 = blocs légèrement désaxés (rotations/tilts) + decals de fissures (CanvasTexture) + assombrissement ; état 3 = couronne retirée, drapeau incliné, `brick.glb`/`stones.glb` éboulés au pied | ⚠️ repli documenté |
| Version débris 6–10 chunks | `brick.glb` (188 tris) ×4 + `stones.glb` (120) ×2 + `rocks.glb` (100) ×2 + blocs de la tour éjectés = 8–10 chunks physiques | ✅ |

### 1.5 Portes (spec §1.5) — procédurales (déjà tranché par la spec)

Cadre : poteaux du proto habillés (`CylinderGeometry` + chapiteaux) ; panneau translucide émissif pulsant ;
texte en `CanvasTexture` (net, localisable). Ops du prototype : `x2`, `x3`, `✕`. Aucun asset requis. ✅

### 1.6 Piste et environnement (spec §1.6)

| Spec | Réalité assets | Verdict |
|---|---|---|
| Piste modulaire, bordures | Piste/rails/pointillés **procéduraux du proto** (dimensions exactes conservées) — les blocs platformer sont disponibles pour habiller les bords | ✅ |
| Rocher ×2, arbre boule, nuage, buisson, cristal | `rocks.glb` (100) + `stones.glb` (120) ; `tree.glb` (408, boule) + `tree-pine.glb` (204) ; **nuage : ABSENT → procédural** (3 sphères fusionnées, flat) ; `hedge.glb` (72) ; `jewel.glb` (12) | ✅ (nuage en repli procédural) |

### 1.7 Projectiles / pièces (spec §1.7)

`platformer-kit/coin-gold.glb` (124 tris, rotation Y) ; étoiles : `star.glb` (30 tris) pour la 3D +
sprites `ui-pack/PNG/Yellow/Default/star.png` / `star_outline_depth.png` pour la popup. ✅

### 2. VFX (spec §2) — **pas de Particle Pack → repli procédural intégral**

Sprites blancs teintés par code, générés en `CanvasTexture` au boot (zéro téléchargement) : cercle flou
(gradient radial), étoile 4 branches (path), anneau fin (arc), spark allongé (capsule). Confettis : quads
`InstancedMesh` 3D (spec l'impose déjà). Bonus disponible : `blaster-kit/smoke.glb` (380 tris) pour la bouffée
de muzzle. Système : InstancedMesh maison (amorcé dans le proto — `popMesh`), généralisé en `ParticleSystem`
(pool, vélocités, gravité, teinte par équipe). ⚠️ repli documenté, conforme à l'esprit spec (« blanches,
teintées par code »).

### 3. UI (spec §3)

| Élément spec | Réalité assets | Verdict |
|---|---|---|
| Typo Baloo 2 / Fredoka dans `assets/fonts/` | **ABSENTES** (seules fontes : `ui-pack/Font/Kenney Future*.ttf`, style non conforme « candy ») → règle AGENT.md : **stack système arrondie du prototype** (`Arial Rounded MT Bold`, …). Kenney Future non utilisée | ⚠️ repli imposé par AGENT.md |
| Boutons pilule, ombre dure 6 px → 2 px au press | `ui-pack/PNG/{Blue,Green,Red,Yellow,Grey}/Default/button_*_depth_*.png` en **9-slice** (`border-image` CSS) — les variantes `depth` ont l'ombre dure intégrée ; comportement press du proto conservé | ✅ |
| Icônes (pièce, bouclier, étoile, engrenage, replay…) | UI Pack ne couvre que : `star.png`, `icon_checkmark/cross`, flèches, `Extra/icon_play`, `icon_repeat`. Reste → **emoji système** (explicitement autorisé spec §3.3, c'est ce que fait le proto) | ✅ mixte |
| Barres (HP + ghost fill) | CSS pur (spec §3 dit « réalisable à 100 % en HTML/CSS ») ; ghost fill = 2e div jaune retardée 400 ms | ✅ |
| Panneaux/popups (ruban, 3 étoiles) | CSS + sprites star du pack ; ruban en trapèze CSS | ✅ |
| Textes flottants in-scene | Sprites 3D `CanvasTexture` (jamais en HTML) — conforme spec §3.6 | ✅ |

### 4. Audio (spec §4) — mapping fichier par fichier

Packs réels : `sounds/interface-sounds/Audio/*.ogg` (100 fichiers) + `ui/ui-pack/Sounds/*.ogg` (6).
Pas de M4A : OGG seul (couverture navigateurs modernes OK — écart mineur vs spec noté ici).

| Son spec | Fichier retenu | Repli/note |
|---|---|---|
| Tir « pop » (±10 % pitch) | `pluck_001.ogg` / `pluck_002.ogg` alternés | `playbackRate` aléatoire ±10 % |
| Ding porte positive | **SYNTHÈSE WebAudio obligatoire** (AGENT.md) | pitch croissant par demi-ton, fenêtre 300 ms, reset après pause |
| Piège ✕ | `error_004.ogg` | buzz court |
| Alarme ligne franchie | **synthèse : sweep descendant** (~400→150 Hz, 0.25 s) | la spec exige « descendante » — remplace le beep fixe 120 Hz du proto (même événement, son amélioré) |
| Collision unité/unité | `drop_002.ogg` | throttle ≤ 10/s (spec) |
| Impact sur base | `bong_001.ogg` | + léger crack `scratch_001` |
| Craquement paliers 66/33 | `scratch_002.ogg` / `scratch_003.ogg` | |
| Explosion finale | **ABSENT → synthèse** (burst de bruit filtré + sub) | + `scratch_004` en couche gravats |
| Tick pièces | `tick_001.ogg` / `tick_002.ogg` / `tick_004.ogg` en rotation | un tick par pièce |
| Clic bouton | `ui-pack/Sounds/click-a.ogg` (+ `click-b` au release) | |
| Victoire | jingle 3 notes synthé du proto (parité) | alt : `confirmation_002.ogg` |
| Défaite | 2 notes descendantes synthé (parité proto) | alt : `back_002.ogg` |
| Musique loop | **ABSENTE → séquenceur WebAudio léger** (sine+decay type marimba, ~110 BPM, pentatonique), −12 dB sous les SFX | priorité basse (spec §6 : après le juice) |
| Patter de pas foule | **ABSENT → boucle de bruit filtré** WebAudio, volume `min(1, count/100)` | |

---

## 2. Architecture cible

**Projet Vite + three (dernière version stable en modules ES) à la racine du dépôt.**
Pas de monolithe : un système = un module. Pas de TypeScript exigé (rester JS comme le proto, cohérence).

```
/ (racine)
├── index.html               # coquille : #game + HUD + overlays (structure du proto)
├── vite.config.js           # publicDir: 'game/assets' → sert /models, /sounds, /ui sans copie
├── package.json             # three, vite
├── PLAN.md / AGENT.md / BLOCKERS.md / INTEGRATION.md
└── src/
    ├── main.js              # bootstrap : crée App, démarre la boucle
    ├── core/
    │   ├── constants.js     # TOUTES les constantes gameplay du proto (voir §4, valeurs exactes)
    │   ├── time.js          # dt clampé 0.05, timescale global (hit-stop, slow-mo), elapsed
    │   ├── camera-rig.js    # fitCamera du proto (formule exacte) + trauma shake (shake = trauma², décroissance)
    │   └── app.js           # scène, renderer, lumières, resize, boucle update ordonnée des systèmes
    ├── assets/
    │   ├── loader.js        # GLTFLoader + cache par URL (une seule requête par GLB)
    │   ├── recolor.js       # matériaux d'équipe : flat (masse) + colormap recolorée via canvas (héros/canon/base)
    │   └── bake-pose.js     # SkinnedMesh → BufferGeometry statique posée (sample du clip `sprint` à ~50 %)
    ├── crowd/
    │   ├── crowd.js         # InstancedMesh bleu (≤170) : avance, wobble, bobbing, spawn, cap
    │   └── heroes.js        # 4–6 clones SkeletonUtils animés (premier plan, près du canon)
    ├── gates/gates.js       # génération par niveau, ops x2/x3/✕, détection de franchissement, juice porte
    ├── enemy/
    │   ├── waves.js         # vagues rouges (formules proto), InstancedMesh rouge (≤160)
    │   ├── giants.js        # géants clones animés (rouges + champion bleu P2), HP, flash blanc
    │   └── base.js          # tour composite, états de dégâts, chunks, HP
    ├── juice/
    │   ├── springs.js       # utilitaires spring/lerp génériques
    │   ├── particles.js     # ParticleSystem InstancedMesh (pops, anneaux, sparks, muzzle)
    │   ├── confetti.js      # 150 quads instanciés, gravité, rotations
    │   ├── floating-text.js # sprites CanvasTexture in-scene (+1, -1, dégâts)
    │   └── vignette.js      # vignette rouge de danger (DOM overlay animé)
    ├── audio/
    │   ├── audio-manager.js # chargement OGG, pools, throttles, volumes, mute (en mémoire)
    │   └── synth.js         # ding pitch croissant, explosion, jingles, musique séquencée, patter
    ├── ui/
    │   ├── hud.js           # pills, barres (ghost fill), hint, flash niveau, punch compteur
    │   ├── overlays.js      # start/win/lose, boutons 9-slice, étoiles séquentielles
    │   └── flying-coins.js  # pièces DOM/3D en Bézier vers le compteur + ticks
    └── levels/
        ├── levels.js        # config par niveau (HP base, cadence vagues, layout portes), enchaînement
        └── boss.js          # (P2) boss level tous les 5 niveaux
```

**Ordre d'update par frame** (déterminisme des interactions, calqué sur le proto) :
input → canon/tir → vagues → mouvements bleus + portes → impacts base → mouvements rouges + ligne de défaite
→ collisions bleu/rouge → géants → juice (springs, particules, shake, timescale) → rendu instances → render.

**Règles de code** (pièges AGENT.md + découvertes d'inspection) :
- `position/rotation/scale` : toujours `.set()` / mutation, jamais de réassignation.
- `SkeletonUtils.clone()` obligatoire pour tout SkinnedMesh (12 personnages = 2 SkinnedMesh chacun !).
- `frustumCulled = false` sur **tous** les InstancedMesh.
- **Jamais muter un matériau partagé** : le matériau `colormap` est commun aux 219 GLB → cloner avant teinte.
- Pas de `localStorage` (pièces/mute en mémoire de session).
- `AudioContext` créé au premier geste utilisateur (comme le proto).
- Échelle : normaliser les personnages à ~0.9 u de haut au chargement (mesure de bounding box, PAS de
  constante devinée) pour préserver les rayons de collision du proto (0.7 / 1.1 géant).
- Noms de clips : utiliser **exactement** `sprint`, `walk`, `attack-melee-right`, `die`, `idle` (vérifiés).

---

## 3. Stratégie foule (hybride, budgets chiffrés)

**Masse (le gros des unités)** — repris du proto, habillé Kenney :
1. Au chargement : `bake-pose.js` échantillonne le clip `sprint` à mi-foulée sur `character-male-a`,
   applique le skinning CPU une fois, fusionne `body-mesh` + `head-mesh` → **une BufferGeometry statique**
   (~723 tris).
2. Deux `InstancedMesh` : bleu (cap **170**) et rouge (cap **160**), matériaux d'équipe **flat**
   (`MeshLambertMaterial` bleu/rouge — lisibilité des GIFs, palette spec).
3. Animation procédurale par instance (parité proto) : bobbing y `|sin(t·10+wob)|·0.15`, wobble x,
   squash & stretch au spawn, inclinaison avant légère (spec 5.2) + **déphasage `wob` aléatoire**.

**Premier plan (les « héros »)** — 4 à 6 clones `SkeletonUtils.clone()` avec `AnimationMixer` (`sprint`,
offsets de `time` aléatoires), recolorés via colormap recolorée (détail visible de près). Ils suivent les
premières unités logiques de la foule (miroir visuel, zéro logique gameplay propre).

**Géants** — clones animés `sprint` à `timeScale 0.7`, scale ×2.1 (valeur proto), accessoire sunglasses,
flash émissif aux dégâts, `die` + hit-stop à la mort.

**Budget draw calls foules** (plafond AGENT.md : ≤ 25) :
masse bleue 1 + masse rouge 1 + pops 1 + confettis 1 + héros 6×2 (body+head) = 12 + géants ≤3×2 = 6
→ **22 ≤ 25** ✓ (si dépassement : réduire héros à 4 → 18). Objectif global : 60 fps mobile ; décor statique
< 50k tris (spec §0) ; tris rendus de la foule : voir arbitrage C5, mesures dans INTEGRATION.md.

---

## 4. Constantes de parité (valeurs EXACTES du prototype)

`src/core/constants.js` reprend, sans arrondir : `LANE_HALF=4.5`, `PLAYER_Z=20`, `BASE_Z=-24`,
`BLUE_HIT_Z=-22.4`, `RED_WIN_Z=20.5`, `MAX_RED=160`, `BLUE_SPEED=9`, `FIRE_DELAY=0.14`,
**`MAX_BLUE=170`** (arbitrage C3), HP joueur `10`, HP base `40 + 15·niveau`, gain `25 + 5·niveau`,
vagues : période `max(1.1, 2.4 − 0.12·niveau)`, taille `2 + ⌊1.3·niveau⌋`, géant rouge : `niveau ≥ 2`,
proba 0.35, HP 5, vitesse 2.2, dégâts ligne 3 ; rouges : vitesse `3.6 + 0.12·niveau` ; portes : rangées
`z = 7` et `z = −5`, ✕ : `niveau ≥ 3` proba 0.4 par rangée, largeur `LANE_HALF − 0.3` ; caméra :
`fov 55`, `pos(0, 17+k·10, 30+k·12)` avec `k = max(0, 1/aspect − 0.55)`, `lookAt(0, 0, −3)` ;
fog `(0x2B1D6B, 55, 90)` ; `dt ≤ 0.05` ; `pixelRatio ≤ 2` ; bobbing bleu `|sin(t·10+wob)|·0.15`
(squash vertical ×1.35), bobbing rouge `|sin(t·8+wob)|·0.12`, wobble rouge `sin(t·5+wob)·dt·0.5` ;
géant rouge : spawn `x ±(LANE_HALF−1)`, `z = BASE_Z+2`, sans wobble ; pops : vie 0.3 s, scale `0.5+4t`, pool 60.

## 5. Checklist de parité prototype (à cocher UNE PAR UNE en Phase 2)

### Mécaniques
- [ ] Visée : raycast plan sol, clamp `±(LANE_HALF−0.8)`, canon lerp `dt·14`, tilt `rotation.z = (target−x)·0.08`
- [ ] Tir : maintien, cadence 0.14 s, jitter x ±0.25, spawn à `PLAYER_Z−1.2`, cap unités
- [ ] Bleus : avance z −9·dt, wobble x `sin(t·7+wob)·dt·0.4`, clamp piste au spawn
- [ ] Portes : franchissement (pz > gz ≥ z, |Δx| < halfW), x2 → +1 clone, x3 → +2 clones (jitter x ±0.6, z −0..0.5)
- [ ] Porte ✕ : destruction de l'unité + pop + son
- [ ] Génération portes : 2 rangées, paires x2/x3 mélangées, règle ✕ (niv ≥ 3, 40 %)
- [ ] Impact base : HP−1, pop, squash base (1.08, 0.94, 1.08) + retour lerp `dt·8`, victoire à 0
- [ ] Vagues rouges : formules exactes (§4), spawn `z ∈ [BASE_Z+2, BASE_Z+3.5]`, jitter x ±(LANE_HALF−0.6)
- [ ] Géant rouge : conditions/HP/vitesse/scale 2.1, trajectoire droite
- [ ] Rouges : vitesse `3.6+0.12·niv`, wobble, franchissement ligne → HP joueur −1 (−3 géant), défaite à 0
- [ ] Collisions : rejet rapide |Δz| > rad, dist² < rad² (0.7 / 1.1), bleu consommé, HP rouge décrémenté
- [ ] Niveaux : HP base `40+15·niv`, gain `25+5·niv`, enchaînement next/retry, état reset complet
- [ ] HUD : pills NIV/🪙, barre HP base (gradient), HP joueur 🛡️, hint bobbing, flash « NIVEAU N » (1.4 s)
- [ ] Overlays start/win/lose : contenus, boutons, +N 🪙
- [ ] Caméra responsive : formule exacte, resize
- [ ] Scène : fond/fog/lumières/piste/rails/pointillés aux valeurs du proto
- [ ] Audio : sons sur tir / ✕ / impact base / franchissement rouge / mort rouge / victoire (3 notes) / défaite
- [ ] AudioContext après premier geste ; `dt` clampé ; pixelRatio ≤ 2 ; `frustumCulled=false`
- [ ] Bobbing/pulse : unités (y, déphasées), squash vertical ×1.35, pops qui grossissent et disparaissent (0.3 s)
- [ ] Punch du fût au tir (scale 1.25 → lerp 1)

### Juice spec §5 (chaque item, dans l'ordre de priorité spec §6)
- [ ] 5.1 Tir : recul fût 0.3 u spring, muzzle flash 2 frames, squash & stretch spawn (1.3, 0.6, 1.3)→(1,1,1) 150 ms, pop ±10 %, micro-tremblement canon (jamais de camera shake au tir)
- [ ] 5.2 Foule : bobbing désync (proto) + inclinaison avant, offsets d'anim (héros), patter volume `min(1, n/100)`
- [ ] 5.3 Porte : flash panneau ×2 100 ms, punch texte 1→1.3→1, « +1/+2 » flottant, anneau au sol, **ding synthé pitch croissant** (+½ ton si < 300 ms, reset sinon), clones en saut latéral
- [ ] 5.4 Combat : pop scale-out + 4 étoiles teintées, **hit-stop 40 ms (timescale 0.05) uniquement mort de géant**, flash blanc émissif + chiffres de dégâts sur géant, trauma +0.15/mort géant, +0.05/pop (plafonné)
- [ ] 5.5 Base : squash (proto) + « −1 » rouge flottant, **ghost fill 400 ms**, fissures + craquement + shake 0.3 aux paliers 66/33, **destruction finale : timescale 0.25 pendant 600 ms → 8–10 chunks physiques (vélocités radiales + gravité) → confettis → jingle**
- [ ] 5.6 Danger : vignette rouge pulsée + battement grave si rouge < 6 u de la ligne ; franchissement : shake 0.4 + flash rouge 80 ms + `navigator.vibrate(80)` ; défaite : désaturation, caméra −1 u, boutons +300 ms
- [ ] 5.7 Victoire : slow-mo → confettis 150 quads, 3 étoiles en spring séquentiel (200 ms + son), **pièces volantes en Bézier vers le compteur (tick + punch par arrivée)**, bouton pulse 1→1.05 (1.2 s)
- [ ] 5.8 Ambiance : nuages driftants, drapeau ondulant, ciel/fog animés, canon qui « respire » (±2 %, 2 s)

## 6. Features additionnelles P2 (CONTEXT.md §8) — APRÈS parité complète, jamais avant

| Feature | Design (dans l'esprit du jeu original, réf. GIFs) | Estimation |
|---|---|---|
| **Jauge de champion** | Pilule verticale à côté du canon (réf. GIF 1/5), charge : +par mort de rouge et +lente au temps ; pleine → prompt « RELEASE! » ; tap → **géant bleu** (clone animé ×2.2, accessoire, colonne de lumière, trauma 0.1), HP 8, écrase les rouges (annihilation 1 pour 1 sans mourir jusqu'à épuisement HP), gros dégâts base (−5) | 3–4 h |
| **Boost de vitesse** | Bande `conveyor-belt.glb` recolorée sur la piste (1 niveau sur 3) : bleus ×1.6 pendant 1.5 s + micro-trails + son sweep | 1–2 h |
| **Porte mobile** | Une des 4 portes oscille en x (`sin`, amplitude `LANE_HALF/2`, ~0.4 Hz), mêmes règles de franchissement (niv ≥ 4) | 1 h |
| **Loadout simplifié** | Écran pré-partie : 2 canons (Normal 0.14 s / Double 0.22 s ×2 unités en V) × 2 mobs (Normie : proto ; Knight : HP 2, vitesse 7.5, personnage différent) ; déblocage par progression (niv 3 / niv 5), en mémoire | 3–4 h |
| **Boss level (tous les 5 niveaux)** | Layout dédié : pas de vagues, **boss unique** `character-oozi` ×3 (HP 40, vitesse 1.6, spawn 3 rouges/2 s), barre HP boss dédiée, récompense ×2, flash « BOSS » | 2–3 h |

Hors scope (interdits, CONTEXT.md) : PvP/raids, clans, LiveOps, battle pass, cartes/raretés/boosters.
P3 (non planifié en Phase 2) : armurerie/skins, mini-diorama.

## 7. Découpage en tâches pour Opus (ordre strict, critère d'acceptation par tâche)

> Après CHAQUE tâche : build OK, **zéro erreur console**, cocher les lignes de parité couvertes,
> commit atomique `[integ] T<n> — <résumé>`.

- **T0 — Scaffolding.** Vite + three à la racine, `publicDir: 'game/assets'`, structure `src/` du §2, page
  affichant une scène vide (fond `#2B1D6B`).
  *Acceptation : `npm run dev` sert la page sans erreur ; `npm run build` passe.*
- **T1 — Core.** `time.js` (dt clamp, timescale), `camera-rig.js` (formule proto + trauma², decay), `app.js`
  (renderer, lumières proto, resize).
  *Acceptation : caméra identique proto sur 3 aspect ratios (portrait/carré/paysage) ; shake déclenchable en debug.*
- **T2 — Décor.** Piste/rails/pointillés/fog aux valeurs §4 + props platformer recolorés hors piste + nuages
  procéduraux statiques (drift en T12).
  *Acceptation : visuel superposable au proto ; `renderer.info` loggué.*
- **T3 — Pipeline assets.** `loader.js` (cache), `recolor.js` (flat équipe + colormap canvas), `bake-pose.js`
  (sprint mi-foulée, merge body+head, normalisation ~0.9 u par bbox) + page/flag debug qui **loggue hiérarchie
  et clips réels** des GLB chargés.
  *Acceptation : log conforme à l'inventaire §1.1 ; 1 perso baked bleu + 1 clone animé `sprint` affichés côte à côte.*
- **T4 — Canon + tir.** Socle procédural + `blaster-b` bleu, visée/lerp/tilt (parité), cadence/jitter/cap,
  juice 5.1 complet (recul spring, muzzle flash, squash spawn, pop ±10 % via `pluck_00x`, micro-tremble).
  *Acceptation : lignes parité « visée/tir » + 5.1 cochées ; tir au doigt et à la souris.*
- **T5 — Foule bleue.** `crowd.js` instancié (cap 170), mouvements/bobbing parité, squash spawn, héros
  premier plan (4–6 clones).
  *Acceptation : lignes « bleus » cochées ; draw calls foule ≤ budget ; 170 unités à 60 fps sur desktop.*
- **T6 — Portes.** Génération niveau (parité), franchissement/clonage/✕ (parité), juice 5.3 complet dont
  **ding synthé** pitch croissant.
  *Acceptation : lignes portes + 5.3 cochées ; test manuel x2/x3/✕ aux 2 rangées.*
- **T7 — Rouges, géants, combat.** `waves.js` (formules), géants clones animés (sunglasses), collisions
  parité, juice 5.4 (hit-stop mort géant, flash blanc, dégâts flottants, trauma quotas).
  *Acceptation : lignes vagues/géant/collisions + 5.4 cochées.*
- **T8 — Base ennemie.** Tour composite + drapeau, impacts (parité squash), barre + **ghost fill**, paliers
  66/33 (fissures/craquement/shake 0.3), destruction finale complète (slow-mo 0.25×600 ms, chunks
  brick/stones/rocks, confettis, jingle).
  *Acceptation : lignes base + 5.5 cochées ; séquence de victoire filmable en une prise.*
- **T9 — Défense & défaite.** Ligne rouge (parité HP), vignette danger + battement, franchissement (shake 0.4,
  flash, vibrate), défaite (désaturation, caméra −1 u, boutons +300 ms).
  *Acceptation : lignes rouges/défaite + 5.6 cochées.*
- **T10 — UI complète.** HUD (pills punch, barres), overlays 9-slice UI Pack, étoiles séquentielles,
  **pièces volantes** Bézier + ticks, bouton pulse, hint, flash niveau.
  *Acceptation : lignes HUD/overlays + 5.7 cochées ; press states 6 px → 2 px.*
- **T11 — AudioManager.** Table de mapping §1.4-audio intégrale, pools + throttle collisions (≤ 10/s),
  synthés (ding, explosion, jingles, alarme), patter foule, musique séquencée −12 dB, mute.
  *Acceptation : chaque événement de la table joue le bon fichier ; aucun fetch hors `game/assets`.*
- **T12 — Ambiance.** Drift nuages, drapeau sinusoïdal, ciel/fog animés, respiration canon.
  *Acceptation : 5.8 coché.*
- **T13 — Niveaux & boucle.** `levels.js` (formules §4, seed portes), enchaînements win/lose/next/retry,
  3 niveaux d'affilée sans reload.
  *Acceptation : partie gagnée, partie perdue, 3 niveaux enchaînés — zéro erreur console.*
- **T14 — GATE DE PARITÉ.** Toute la checklist §5 cochée + mesures (`renderer.info` draw calls, fps desktop
  + mobile si dispo) consignées dans `INTEGRATION.md`. **Aucune tâche P2 avant ce gate.**
- **T15 — P2 Jauge de champion** (design §6). *Acceptation : charge visible, RELEASE, géant bleu efficace, juice.*
- **T16 — P2 Boost de vitesse + porte mobile.** *Acceptation : niveaux 3k+1 avec conveyor ; porte oscillante niv ≥ 4.*
- **T17 — P2 Loadout simplifié.** *Acceptation : 2×2 choix, stats effectives, déblocages, écran pré-partie.*
- **T18 — P2 Boss level.** *Acceptation : tous les 5 niveaux, boss oozi, barre dédiée, récompense ×2.*
- **T19 — Rapport final.** `INTEGRATION.md` : checklist cochée, mesures perf, écarts justifiés, mode d'emploi.
  *Acceptation : document complet, prêt pour la revue Fable (Phase 3).*

## 8. Ce qu'Opus ne doit PAS faire

Modifier ce plan (→ `BLOCKERS.md` + retour Fable) ; télécharger quoi que ce soit ; inventer un asset ;
utiliser `localStorage` ; muter un matériau partagé ; supposer un nom de clip ou de fichier (tout est
listé §1) ; dégrader une valeur de parité §4 ; entreprendre P2 avant le gate T14 ; toucher aux items
« hors scope » ; utiliser Kenney Future (règle typo AGENT.md).
