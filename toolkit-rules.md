# toolkit-rules.md — Toolkit de variants & niveaux (agent-ready)

> Comment un agent (ou un humain) crée des **niveaux et variantes** du jeu de base Mob Rush,
> influencés par le dossier **`references/ads-inspo/`**, puis **enregistre un gameplay 9:16**
> — sans jamais toucher au jeu source.
>
> Code : `src/lib/ad-scenarios/` (toolkit TS) + hook côté jeu (`src/core/app.js`).
> État : implémenté et vérifié e2e (vidéo réelle produite), **non commité**.

---

## 1. Le flow en une ligne

```text
references/ads-inspo/ (+ tendance)  →  create (compose + Zod)  →  variant JSON rejouable
        →  URL jouable (?variant=<base64>)  →  record Playwright  →  <id>.webm vertical 9:16
```

## 2. Commandes

```bash
npm run game                                              # prérequis : le jeu sur :5173
npm run variant -- list                                   # catalogue des blocs (skins, murs, bornes)
npm run variant -- create --trend "ice maze fail bait"    # compose + sauvegarde un variant
npm run variant -- url generated-variants/<id>.json      # affiche l'URL jouable
npm run variant -- record generated-variants/<id>.json --seconds 25   # → <id>.webm 9:16
```

- `create` : lit `references/ads-inspo/` (`loadInspiration` — images/gifs/vidéos cataloguées,
  notes `.md`/`.txt` lues), compose un `AdScenarioSpec` via **Gemini** (structured output, si
  `GEMINI_API_KEY` présent) sinon **fallback template déterministe** (routage par mots-clés du
  trend), traduit en `VariantConfig`, valide, sauvegarde.
- `record` : Playwright chromium headless, viewport **405×720 (9:16)**, ouvre la playUrl en
  `autoplay` (bot : tir continu + visée oscillante), enregistre N secondes, dépose le `.webm`
  à côté du JSON. **Ne démarre pas le serveur** — erreur claire si :5173 est down.

## 3. Le contrat `VariantConfig` (= `window.__MOB_VARIANT__`)

Injecté dans une **copie** du HTML (`buildVariantHtml`) ou passé en `?variant=<base64(JSON)>`.
Toutes les clés optionnelles, `.strict()` (clé inconnue = rejet), bornes **identiques côté jeu** :

| Clé | Type / bornes | Effet |
|---|---|---|
| `startLevel` | int 1..50 | niveau de départ |
| `loadout` | `single\|double\|triple` | canon 1x/2x/3x (fûts + cadence + HUD) |
| `skin` | `canyon\|dusk\|snow` | **thème intégral** : ciel/fog/sol/piste, falaises & végétation jumelles, assets des murs, teinte des mottes |
| `layout.walls[]` | ≤10 · x −4..4 · z −18..14 · halfW 0.4..2.6 · halfD 0.4..5 · `kind: crates\|mound` · `axis: x\|z` | murs bloquants (axe `z` = séparateurs de couloirs) |
| `layout.hazards[]` | ≤6 · `saw\|spikes\|spikesLarge` | pièges létaux — **flancs uniquement, jamais au centre d'un passage** |
| `layout.lanesX` | 2..4 valeurs −3.6..3.6 | couloirs de spawn ennemi (flots séparés) |
| `layout.hordeMult` | 0.5..4 | marée (≥2 = tapis en rangées denses) |
| `wavePressure` | 0.4..2.5 | multiplicateur de vagues (se cumule avec hordeMult) |
| `overlayText` | string[] | bannière de hook affichée en jeu (« Only 1% choose right ») |
| `autoplay` | bool | bot de jeu (obligatoire pour le record sans humain) |
| `aspect` | littéral `"9:16"` | toujours posé par le toolkit |

## 4. Garanties côté jeu (le variant ne peut pas casser la partie)

- **Assainissement** (`setLayoutOverride`, `src/levels/layouts.js`) : toute valeur est clampée
  aux bornes ci-dessus ; clés inconnues ignorées ; ≤10 murs / ≤6 hazards.
- **Anti-softlock** : murs bornés (halfW ≤ 2.6 sur piste de 9 u), les unités **glissent** sur
  les flancs (déviation, jamais d'arrêt ni de mort sur un mur) ; le **champion fracasse** les
  murs (débris physiques). Un variant est toujours finissable.
- **Pureté thématique** : le `skin` pilote TOUT (environnement, murs `crates` = caisses en
  canyon / briques améthyste en dusk / **blocs de neige** en snow ; mottes teintées assorties).
- **Config absente ⇒ jeu de base strictement inchangé.**

## 5. Mapping `mechanic_focus` → config (fallback déterministe)

| focus | startLevel | layout | pression | intention créative |
|---|---|---|---|---|
| `fail_bait` | 2 | murs-pièges étroits + scies de flanc | 1.2 | le mauvais choix évité de justesse |
| `crowd_explosion` | 2 | terrain quasi vide, horde 0.6 | 0.8 | la foule qui enfle, lisible |
| `boss_crush` | 3 | mottes + pointes, dense | 1.6 | payoff d'écrasement du boss |
| `danger_comeback` | 2 | murs épars + hazards | 1.8 | quasi-défaite → comeback |
| `speed_boost` | 1 | un petit mur, zéro hazard | 0.7 | vitesse sans friction |
| `maze_navigation` | 2 | murs longitudinaux (`axis:z`) + lanesX | 1.0 | slalom dans le labyrinthe |
| `close_call` | 2 | hazards de flanc | 1.4 | esquives répétées |

L'`intensity` du scénario module pression/horde (clampées) ; `skin`/`loadout` explicites du
spec priment sur les défauts du focus ; `autoplay:true` + `aspect:"9:16"` toujours posés.

## 6. Artefacts (rejouables & comparables)

`generated-variants/<id>.json` (gitignoré) :

```json
{ "id", "name", "created_at", "trend", "hypothesis",
  "scenario": { …AdScenarioSpec validé… },
  "config":   { …VariantConfig validé… },
  "playUrl":  "http://localhost:5173/?variant=<base64>",
  "recording": { "url", "seconds": 25, "aspect": "9:16" } }
```

Rejouer = rouvrir `playUrl`. Enregistrer = `record <fichier>`. La vidéo `<id>.webm` atterrit à côté.

## 7. Règles (à respecter par tout agent)

1. **Jamais** modifier `game/` ni `references/` (lecture seule ; `ads-inspo/` se lit, ne s'écrit
   que par l'humain qui dépose ses références).
2. Toute config issue d'un LLM est un **brouillon** tant que Zod ne l'a pas validée — échec =
   erreur lisible, **aucun fallback silencieux** vers une config partielle.
3. **Une hypothèse créative par variant** (pas de mélange) ; hook lisible < 3 s ; payoff clair.
4. Hazards **jamais au centre d'un passage** ; ne pas contourner l'assainisseur.
5. Le record exige le serveur (`npm run game`) et `autoplay:true` dans la config.
6. Rien n'est commité sans approbation humaine (AGENTS.md).

## 8. Dossier d'inspiration

`references/ads-inspo/` : déposez captures/gifs/vidéos d'ads (nommage par angle :
`fail-bait_wrong-gate.mp4`, `crowd-explosion_500mobs.gif`) + notes `.md` libres.
`create` les catalogue et en nourrit la composition. Dossier vide ⇒ fallback templates.

## 9. Vérifié (2026-07-05)

- Typecheck 0 erreur (module), tests **17/17**.
- E2E réel : `create --trend "snow horde choose wisely"` → JSON + playUrl →
  `record --seconds 10` → **`.webm` 1,2 MB, 404×720**, frame contrôlée (hook « x1000 crowd? »,
  canon triple, foule, murs).
- Hook jeu contrôlé en capture (variant « ICE MAZE » : skin neige + layout custom + 2x +
  couloirs + bannière appliqués).
