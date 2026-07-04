# AdScenarioSpec — contrat de scénarios publicitaires jouables

## Objectif

Ce fichier définit le format standard d’un scénario publicitaire pour Mob Rush / Mantra.

Un scénario n’est pas un prompt libre. C’est un contrat structuré qui permet à un agent de transformer une tendance marketing en variant jouable, enregistrable, comparable et exploitable pour générer des ads personnalisées.

Le scénario doit toujours relier une tendance à une mécanique visible du jeu : canon, portes, foule, champion, boss, comeback, destruction de base ou récompense.

## Principes obligatoires

Un scénario valide doit définir :

1. une tendance de marché ou un angle créatif,
2. une émotion cible chez le viewer,
3. une hypothèse testable,
4. une mutation gameplay limitée,
5. un script vertical de 20 à 30 secondes,
6. un moment de payoff clair,
7. des métadonnées sauvegardables,
8. des critères keep / kill.

Le scénario doit rester cohérent avec la boucle Mob Rush :

```text
cannon -> gates -> crowd growth -> enemies -> base destruction -> reward
```

## TypeScript contract

```ts
export type PlayerMotivation =
  | "power_fantasy"
  | "fail_bait"
  | "optimization"
  | "collection"
  | "revenge"
  | "satisfying_growth"
  | "comeback";

export type TargetEmotion =
  | "curiosity"
  | "satisfaction"
  | "tension"
  | "relief"
  | "dominance"
  | "surprise";

export type MechanicFocus =
  | "gates"
  | "champion"
  | "boss"
  | "loadout"
  | "speed_boost"
  | "danger_comeback"
  | "coin_reward"
  | "base_destruction";

export type AdScenarioSpec = {
  id: string;
  title: string;

  trend: {
    name: string;
    source: string;
    why_it_matters: string;
  };

  audience: {
    player_motivation: PlayerMotivation;
    target_emotion: TargetEmotion;
  };

  hypothesis: {
    statement: string;
    expected_behavior: string;
    metric_to_watch: string;
  };

  creative_angle: {
    hook: string;
    promise: string;
    twist: string;
    cta: string;
  };

  gameplay_mutation: {
    mechanic_focus: MechanicFocus;
    allowed_changes: string[];
    forbidden_changes: string[];
    parameters?: Record<string, number | string | boolean>;
  };

  playable_script: {
    duration_seconds: number;
    opening_0_3s: string;
    middle_3_12s: string;
    climax_12_20s: string;
    end_card_20_25s: string;
  };

  recording_plan: {
    aspect_ratio: "9:16";
    camera_focus: string;
    must_capture_moments: string[];
    overlay_text: string[];
  };

  success_criteria: {
    visual_readability: string;
    fun_signal: string;
    ad_signal: string;
    keep_kill_rule: string;
  };

  metadata: {
    created_by: "agent" | "human";
    source_game_version: string;
    variant_id?: string;
    created_at?: string;
  };
};
```

## Zod schema suggestion

```ts
import { z } from "zod";

export const AdScenarioSpecSchema = z.object({
  id: z.string().min(3),
  title: z.string().min(3),
  trend: z.object({
    name: z.string().min(2),
    source: z.string().min(2),
    why_it_matters: z.string().min(10),
  }),
  audience: z.object({
    player_motivation: z.enum([
      "power_fantasy",
      "fail_bait",
      "optimization",
      "collection",
      "revenge",
      "satisfying_growth",
      "comeback",
    ]),
    target_emotion: z.enum([
      "curiosity",
      "satisfaction",
      "tension",
      "relief",
      "dominance",
      "surprise",
    ]),
  }),
  hypothesis: z.object({
    statement: z.string().min(10),
    expected_behavior: z.string().min(10),
    metric_to_watch: z.string().min(5),
  }),
  creative_angle: z.object({
    hook: z.string().min(3),
    promise: z.string().min(3),
    twist: z.string().min(3),
    cta: z.string().min(3),
  }),
  gameplay_mutation: z.object({
    mechanic_focus: z.enum([
      "gates",
      "champion",
      "boss",
      "loadout",
      "speed_boost",
      "danger_comeback",
      "coin_reward",
      "base_destruction",
    ]),
    allowed_changes: z.array(z.string()).min(1),
    forbidden_changes: z.array(z.string()).min(1),
    parameters: z.record(z.union([z.number(), z.string(), z.boolean()])).optional(),
  }),
  playable_script: z.object({
    duration_seconds: z.number().min(15).max(35),
    opening_0_3s: z.string().min(5),
    middle_3_12s: z.string().min(5),
    climax_12_20s: z.string().min(5),
    end_card_20_25s: z.string().min(5),
  }),
  recording_plan: z.object({
    aspect_ratio: z.literal("9:16"),
    camera_focus: z.string().min(5),
    must_capture_moments: z.array(z.string()).min(2),
    overlay_text: z.array(z.string()).min(1),
  }),
  success_criteria: z.object({
    visual_readability: z.string().min(10),
    fun_signal: z.string().min(10),
    ad_signal: z.string().min(10),
    keep_kill_rule: z.string().min(10),
  }),
  metadata: z.object({
    created_by: z.enum(["agent", "human"]),
    source_game_version: z.string().min(1),
    variant_id: z.string().optional(),
    created_at: z.string().optional(),
  }),
});
```

## Scénarios standards

| Scenario | Hook | Mutation gameplay | Payoff à enregistrer |
|---|---|---|---|
| `fail_bait_gate` | “Only 1% choose the right gate” | Mauvaise porte très visible, bonne porte plus difficile | Le joueur évite le piège au dernier moment |
| `crowd_explosion` | “Can you reach 500 mobs?” | Plus de portes x2 / x3, densité de foule augmentée | La foule grossit brutalement après une porte |
| `champion_release` | “Release the giant now?” | Jauge champion accélérée, spawn plus spectaculaire | Champion qui nettoie les ennemis |
| `boss_crush` | “This boss looks impossible” | Boss plus massif, HP élevé, montée progressive de foule | Boss détruit après une rafale finale |
| `danger_comeback` | “I almost lost…” | Ennemis proches de la ligne, comeback possible | Vignette danger puis victoire |
| `speed_boost` | “Fastest army wins” | Bande de boost vitesse sur la piste | Les mobs débordent l’ennemi |
| `loadout_comparison` | “Which cannon is better?” | Deux canons ou mobs comparés | Résultat A/B évident |
| `reward_dopamine` | “Destroy base, get rich” | Pièces, étoiles et confettis amplifiés | Explosion finale + compteur qui roule |

## Structure créative obligatoire

```text
0-3s: problème visuel immédiat
3-8s: choix ou tension
8-15s: amplification de foule ou pouvoir
15-22s: payoff spectaculaire
22-25s: CTA simple
```

## Exemple complet

```json
{
  "id": "trend_fail_bait_wrong_gate_001",
  "title": "Only 1% Avoid The Red Gate",
  "trend": {
    "name": "fail bait / impossible choice",
    "source": "market trend input",
    "why_it_matters": "Creates curiosity and makes the viewer want to correct the player."
  },
  "audience": {
    "player_motivation": "fail_bait",
    "target_emotion": "tension"
  },
  "hypothesis": {
    "statement": "A near-miss gate choice will increase watch time because viewers want to see whether the player recovers.",
    "expected_behavior": "The viewer understands the trap immediately and waits for the payoff.",
    "metric_to_watch": "3-second hold rate, completion rate, click-through rate"
  },
  "creative_angle": {
    "hook": "Only 1% choose right",
    "promise": "Multiply your army before the enemy reaches you",
    "twist": "The obvious gate is a trap",
    "cta": "Can you beat this level?"
  },
  "gameplay_mutation": {
    "mechanic_focus": "gates",
    "allowed_changes": [
      "Change gate layout",
      "Add red trap gate",
      "Add floating hook text",
      "Increase final crowd payoff"
    ],
    "forbidden_changes": [
      "Do not change the core cannon control",
      "Do not remove enemy waves",
      "Do not edit source game directly"
    ],
    "parameters": {
      "trap_gate_scale": 1.25,
      "good_gate_multiplier": "x3",
      "enemy_wave_pressure": 1.15,
      "final_coin_multiplier": 1.5
    }
  },
  "playable_script": {
    "duration_seconds": 25,
    "opening_0_3s": "Show two gates: a huge red trap and a smaller blue x3 gate.",
    "middle_3_12s": "Player barely steers into the correct gate while enemies approach.",
    "climax_12_20s": "Crowd multiplies and overwhelms the enemy base.",
    "end_card_20_25s": "Show victory, coins and CTA."
  },
  "recording_plan": {
    "aspect_ratio": "9:16",
    "camera_focus": "Keep cannon, gates and crowd visible at all times.",
    "must_capture_moments": [
      "near miss on trap gate",
      "crowd multiplication",
      "base destruction",
      "coin reward"
    ],
    "overlay_text": [
      "Only 1% choose right",
      "Don’t hit red!",
      "Try now"
    ]
  },
  "success_criteria": {
    "visual_readability": "The viewer understands the good and bad gate in under 2 seconds.",
    "fun_signal": "The playtest agent reacts positively to the crowd growth and final destruction.",
    "ad_signal": "The hook creates a clear reason to keep watching.",
    "keep_kill_rule": "Keep if watch-time and completion beat baseline scenario by at least 10%."
  },
  "metadata": {
    "created_by": "agent",
    "source_game_version": "base_game_current"
  }
}
```

## Validation qualitative

Avant génération vidéo, l’agent doit répondre à ces questions :

- Est-ce que le hook est compréhensible en moins de 3 secondes ?
- Est-ce que la mutation est visible sans lire le code ?
- Est-ce que le gameplay reste jouable ?
- Est-ce que le payoff est satisfaisant même sans son ?
- Est-ce que la vidéo fonctionne en 9:16 ?
- Est-ce que le scénario teste une seule hypothèse ?
- Est-ce que les changements sont sauvegardables et rejouables ?

## Règles anti-mauvais scénarios

Interdit :

- reskin cosmétique sans changement de mécanique visible,
- scénario sans payoff,
- texte overlay qui explique une mécanique illisible,
- ajout d’un système méta profond juste pour une ad,
- modification directe du jeu source protégé,
- variant non rejouable,
- scénario qui mélange trop d’hypothèses à la fois.
