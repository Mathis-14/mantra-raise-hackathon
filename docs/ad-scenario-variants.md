# Ad-Scenario Variants — récapitulatif du changement

> Système de scénarios/variants publicitaires jouables pour Mob Rush / Mantra.
> Implémente le contrat `AD_SCENARIO_SPEC.md` + `AGENT_AD_VARIANTS_INSTRUCTION.md`.
> **État : implémenté et vérifié, NON commité** (approbation humaine requise — AGENTS.md).

## En une phrase

Un agent transforme une **tendance marché** (+ inspiration visuelle) en **scénario structuré validé par Zod**, puis en **variant de jeu jouable, enregistrable en 9:16, sauvegardable et rejouable** — sans jamais modifier le jeu source.

## Flow

```text
trend + market_context + references/ads-inspo/
  -> compose.ts (agent Gemini, time-boxé) | fallback template déterministe
  -> AdScenarioSpec (brouillon) -> validateScenario (Zod) ─┐ échec = pas de variant
  -> resolveVariantConfig -> VariantConfig (bornée, .strict())
  -> buildVariantHtml(copie du jeu + <script>window.__MOB_VARIANT__=…</script>)
  -> app.js lit __MOB_VARIANT__ au boot (hook additif) -> variant jouable 9:16
  -> generateVariants -> Variant[]  +  VariantSpec (persistable, rejouable)
```

Boucle Mob Rush préservée : `cannon → gates → crowd growth → enemies → base destruction → reward`.

## Fichiers

### Créés — `src/lib/ad-scenarios/` (module isolé, calqué sur `src/lib/tag-generation/`)

| Fichier | Rôle |
|---|---|
| `src/schema.ts` | `AdScenarioSpec` + `AdScenarioSpecSchema` (Zod, verbatim du spec) ; enums motivation/émotion/mécanique ; `AdScenarioError` (stages `validate\|compose\|mutate\|inspiration`) ; `validateScenario` (safeParse → `z.prettifyError`, aucun fallback silencieux) ; `qualitativeChecklist` (les 7 questions du spec) |
| `src/vocabulary.ts` | **Bibliothèque de blocs** que l'agent compose : `loadouts`, `enemyProfiles`, `mapStyles`, `gateLayouts`, `obstacleSets`, `rewardStyles` (gelés `as const`, bornés) + `blocksForMechanic(focus)` |
| `src/mutation.ts` | `VariantConfigSchema` (forme de `window.__MOB_VARIANT__`, `.strict()`, clés optionnelles bornées) ; `resolveVariantConfig(spec)` ; `buildVariantHtml(baseHtml, config)` **pur** (injecte avant `</head>`, ne mute jamais l'original) |
| `src/inspiration.ts` | `loadInspiration('references/ads-inspo')` — lecture seule, tolère dossier vide/absent |
| `src/compose.ts` | Composeur **agent Gemini** (structured output, time-boxé via `AbortSignal`) ; fallback déterministe `composeScenarioFallback` (hash FNV-1a de la tendance → template) |
| `src/templates.ts` | **8 scénarios seed** validés à l'import |
| `src/generator.ts` | `GeneratedVariant` + `generateVariantFromScenario` déterministe (variant + recording_plan + creative_prompt + playtest_checklist + human_summary + dashboard_blurb) |
| `index.ts` | API publique du module |
| `AGENTS.md`, `docs/usage.md` | Scope + « comment créer un nouveau scénario » |
| `tests/schema.test.ts` | 9 tests purs (validation, config, injection HTML, checklist) |

### Créés — divers

- `references/ads-inspo/README.md` — dossier d'inspiration (screens/gifs/vidéos d'ads) indexé par `loadInspiration`. Vide ⇒ génération sur les 8 templates.

### Modifiés

| Fichier | Changement | Note |
|---|---|---|
| `src/nodes/variants.ts` | `generateVariants` rempli (**signature verrouillée conservée**) + export secondaire `generateScenarioVariants` (métadonnées riches) | owner était « TBD » |
| `src/core/app.js` | **Hook additif** : `readVariantConfig` (`window.__MOB_VARIANT__` ou `?variant=<base64>`) + `showAdOverlay` ; applique loadout / startLevel / overlays ; expose `ctx.variant`. Absent ⇒ jeu **strictement inchangé** | fichier jeu, non protégé (`game/` seul protégé) |
| `src/contracts/types.ts` | Ajout `VariantSpec` + `VARIANT_SPEC_STATUSES` (append-only) | **fichier canonique partagé** |
| `supabase/schema.sql` | Ajout table `variant_specs` + RLS + policy read (mirror de `VariantSpec`) | **fichier partagé** |

### Non touchés

`game/`, `references/` (hors `ads-inspo/` ajouté), `src/orchestrator/`, `src/app/`, autres nodes.

## Contrat `window.__MOB_VARIANT__` (config de mutation)

Injectée par `buildVariantHtml`, lue au boot. Toutes les clés **optionnelles** et **clampées/validées** (`.strict()`).

| Clé | Type / plage | Consommé par |
|---|---|---|
| `loadout` | `single\|double\|triple` | **app.js (actif)** |
| `startLevel` | int 1..20 | **app.js (actif)** |
| `overlayText` | string[] | **app.js (actif — bannière)** |
| `aspect` | `9:16` | recording |
| `forceBoss` | bool | `ctx.variant` (à câbler) |
| `wavePressure` | 0.4..2.5 | `ctx.variant` (à câbler) |
| `giantProba` | 0..1 | `ctx.variant` (à câbler) |
| `bossScale` / `bossHp` | 1..4 / 8..60 | `ctx.variant` (à câbler) |
| `gatePreset` | `default\|fail_bait\|chain_multiply\|advanced_mix` | `ctx.variant` (à câbler) |
| `trapGateScale` / `goodGateMultiplier` | 1..2 / `x2\|x3` | `ctx.variant` (à câbler) |
| `obstacleSet` / `boostZones` | `none\|saw\|spikes\|mixed\|boost_lane` / bool | `ctx.variant` (à câbler) |
| `coinMultiplier` / `confettiIntensity` | 1..5 / 1..4 | `ctx.variant` (à câbler) |
| `championChargeMult` | 1..4 | `ctx.variant` (à câbler) |
| `gameSpeed` | 0.5..1.2 | `ctx.variant` (à câbler) |
| `mapStyle` | `default\|neon_night\|sunset\|toxic` | `ctx.variant` (à câbler) |
| `autoplay` / `simSeconds` | bool / int 5..120 | recording |

## Décisions

- **Contrat canonique dans le module** (comme `tag-generation`), pas dans `contracts/types.ts` — seule la ligne de **persistance** (`VariantSpec`) y est ajoutée.
- **Variété via agent** (pas de templates figés) : vocabulaire de blocs + inspiration `ads-inspo` → l'agent compose ; templates = seeds + fallback.
- **Base HTML des variants = le jeu live** (`index.html`, servi même origine pour `/src/main.js`), qui lit `__MOB_VARIANT__`. Le prototype autonome `game/mob-control-clone.html` n'est pas la base (ne lit pas la config).
- **Persistance** : nouvelle table `variant_specs` (approuvée) — rejouable via `scenario_id` + spec + config JSON.

## Vérification

- `npm run typecheck` — **0 erreur** (projet entier).
- `npm run build` (Next) — **compilé avec succès**.
- `npx tsx --test src/lib/ad-scenarios/tests/*.test.ts` — **9/9**.
- Smoke e2e (jetable) : 8 templates, `__MOB_VARIANT__` injecté dans une copie de `index.html`, `aspect 9:16`, overlays, base non mutée, recording_plan/creative_prompt/checklist présents.

## Limites honnêtes / prochaines étapes

1. **Leviers profonds non encore consommés par le moteur** : `app.js` applique loadout/startLevel/overlays ; le reste est validé + persisté + sur `ctx.variant` mais nécessite de petites lectures dans `waves/gates/obstacles/base/champion/levels` (non fait pour ne pas déstabiliser le moteur — accord = « petit hook additif »).
2. **Écriture `variant_specs`** non câblée dans l'orchestrateur (côté Tom) : la table + le type existent, l'insertion des lignes reste à brancher.
3. **`compose.ts` (Gemini)** requiert `GEMINI_API_KEY` ; sans clé/réseau, fallback template déterministe.

## Commit — en attente d'approbation (AGENTS.md)

Rien n'est commité. `src/contracts/types.ts` et `supabase/schema.sql` sont **partagés** → annoncer en team chat avant de committer. Proposition : branche `feat/ad-scenario-variants`, Conventional Commits, sans trailer d'attribution.
