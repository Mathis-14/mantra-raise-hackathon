// The 8 seed scenarios as AdScenarioSpec, VALIDATED at import: if any template
// is malformed the module throws on load. They are the fallback library the
// composer draws from and the anchor examples for the qualitative rules.

import { validateScenario, type AdScenarioSpec } from "./schema";

const GAME_VERSION = "mob_rush_base_current";

// Each raw is authored by hand from AD_SCENARIO_SPEC.md + the instruction, then
// run through validateScenario so TEMPLATES only ever holds valid specs.
const RAW: Record<string, unknown> = {
  fail_bait_gate: {
    id: "tpl_fail_bait_gate",
    title: "Only 1% Avoid The Red Gate",
    trend: {
      name: "fail bait / impossible choice",
      source: "market trend input",
      why_it_matters: "Creates curiosity and makes the viewer want to correct the player.",
    },
    audience: { player_motivation: "fail_bait", target_emotion: "tension" },
    hypothesis: {
      statement: "A near-miss gate choice increases watch time because viewers want to see the recovery.",
      expected_behavior: "The viewer spots the trap immediately and waits for the payoff.",
      metric_to_watch: "3-second hold rate, completion rate",
    },
    creative_angle: {
      hook: "Only 1% choose right",
      promise: "Multiply your army before the enemy arrives",
      twist: "The obvious gate is a trap",
      cta: "Can you beat this level?",
    },
    gameplay_mutation: {
      mechanic_focus: "gates",
      allowed_changes: ["Show a big red trap gate", "Make the good x3 gate smaller", "Add hook overlay"],
      forbidden_changes: ["Do not change cannon control", "Do not remove enemy waves", "Do not edit source game"],
      parameters: { trap_gate_scale: 1.5, good_gate_multiplier: "x3", enemy_wave_pressure: 1.15 },
    },
    playable_script: {
      duration_seconds: 25,
      opening_0_3s: "Show a huge red trap gate next to a smaller blue x3 gate.",
      middle_3_12s: "Player barely steers away from the trap while enemies approach.",
      climax_12_20s: "Crowd multiplies through x3 and overwhelms the enemy base.",
      end_card_20_25s: "Show victory, coins and the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Keep cannon, both gates and crowd visible at all times.",
      must_capture_moments: ["near miss on trap gate", "crowd multiplication", "base destruction"],
      overlay_text: ["Only 1% choose right", "Don't hit red!", "Try now"],
    },
    success_criteria: {
      visual_readability: "The viewer reads the good and bad gate in under 2 seconds.",
      fun_signal: "The playtest agent reacts positively to the crowd growth and destruction.",
      ad_signal: "The trap hook gives a clear reason to keep watching.",
      keep_kill_rule: "Keep if watch-time and completion beat baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  crowd_explosion: {
    id: "tpl_crowd_explosion",
    title: "Can You Reach 500 Mobs?",
    trend: {
      name: "massive crowd growth",
      source: "market trend input",
      why_it_matters: "Explosive crowd scaling is the most satisfying signal of the core loop.",
    },
    audience: { player_motivation: "satisfying_growth", target_emotion: "satisfaction" },
    hypothesis: {
      statement: "Massive crowd growth is the strongest satisfaction driver in the game loop.",
      expected_behavior: "The viewer keeps watching to see how large the crowd gets.",
      metric_to_watch: "watch-time, completion rate",
    },
    creative_angle: {
      hook: "Can you reach 500 mobs?",
      promise: "Snowball a tiny squad into an army",
      twist: "One chained gate doubles everything",
      cta: "How big is your army?",
    },
    gameplay_mutation: {
      mechanic_focus: "gates",
      allowed_changes: ["Add multiple multiplier gates", "Slightly faster fire", "Fragile final base"],
      forbidden_changes: ["Do not change cannon control", "Do not hide the crowd", "Do not edit source game"],
      parameters: { good_gate_multiplier: "x3", enemy_wave_pressure: 1.2, final_coin_multiplier: 2 },
    },
    playable_script: {
      duration_seconds: 24,
      opening_0_3s: "Start with a tiny handful of mobs behind the cannon.",
      middle_3_12s: "Squad passes chained x2 and x3 gates, doubling each time.",
      climax_12_20s: "A huge mass of mobs floods the enemy base.",
      end_card_20_25s: "Freeze on the giant crowd with the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Frame the growing crowd from cannon to base.",
      must_capture_moments: ["tiny starting squad", "x3 multiplication", "base flooded"],
      overlay_text: ["Can you reach 500?", "x2… x3…", "How big is yours?"],
    },
    success_criteria: {
      visual_readability: "Crowd size change is obvious frame to frame.",
      fun_signal: "The playtest agent enjoys the snowball growth.",
      ad_signal: "The number hook invites a mental challenge.",
      keep_kill_rule: "Keep if watch-time beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  champion_release: {
    id: "tpl_champion_release",
    title: "Release The Giant Now?",
    trend: {
      name: "power-spike release moment",
      source: "market trend input",
      why_it_matters: "The champion release is a highly shareable peak-power moment.",
    },
    audience: { player_motivation: "power_fantasy", target_emotion: "dominance" },
    hypothesis: {
      statement: "The champion release moment creates a peak-power spike worth watching for.",
      expected_behavior: "The viewer waits for the gauge to fill and the release.",
      metric_to_watch: "watch-time to the release moment, completion",
    },
    creative_angle: {
      hook: "Release the giant?",
      promise: "One champion clears the whole line",
      twist: "You choose the perfect moment",
      cta: "Release now!",
    },
    gameplay_mutation: {
      mechanic_focus: "champion",
      allowed_changes: ["Faster champion charge", "Bright RELEASE prompt", "Dense enemy line"],
      forbidden_changes: ["Do not remove enemy waves", "Do not change cannon control", "Do not edit source game"],
      parameters: { champion_charge_mult: 3, enemy_wave_pressure: 1.3, giant_proba: 0.3 },
    },
    playable_script: {
      duration_seconds: 24,
      opening_0_3s: "Show the champion gauge filling fast under a dense enemy line.",
      middle_3_12s: "Gauge reaches full and a RELEASE prompt flashes.",
      climax_12_20s: "A column of light drops the champion, sweeping the enemies.",
      end_card_20_25s: "Hold on the cleared line with the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Keep the gauge, champion and enemy line in frame.",
      must_capture_moments: ["gauge filling", "release", "champion sweep"],
      overlay_text: ["Release the giant?", "RELEASE!", "Your turn"],
    },
    success_criteria: {
      visual_readability: "The release moment is unmistakable without sound.",
      fun_signal: "The playtest agent feels the power spike.",
      ad_signal: "The decision hook creates anticipation.",
      keep_kill_rule: "Keep if hold-rate at the release beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  boss_crush: {
    id: "tpl_boss_crush",
    title: "This Boss Looks Impossible",
    trend: {
      name: "impossible-looking boss",
      source: "market trend input",
      why_it_matters: "A boss that looks unbeatable makes the final payoff feel earned.",
    },
    audience: { player_motivation: "power_fantasy", target_emotion: "surprise" },
    hypothesis: {
      statement: "An impossible-looking boss makes the final crush more satisfying and rewatchable.",
      expected_behavior: "The viewer doubts a win, then is surprised by the crush.",
      metric_to_watch: "completion rate, replays",
    },
    creative_angle: {
      hook: "This boss looks impossible",
      promise: "Grow big enough to crush anything",
      twist: "The tiny army wins",
      cta: "Beat the boss?",
    },
    gameplay_mutation: {
      mechanic_focus: "boss",
      allowed_changes: ["Bigger boss", "Higher visible HP", "Gradual crowd build"],
      forbidden_changes: ["Do not remove enemy waves", "Do not change cannon control", "Do not edit source game"],
      parameters: { boss_scale: 3.5, boss_hp: 55, enemy_wave_pressure: 1.2 },
    },
    playable_script: {
      duration_seconds: 26,
      opening_0_3s: "Reveal a massive boss dominating the frame.",
      middle_3_12s: "The army grows steadily while the boss HP bar looms.",
      climax_12_20s: "A final burst drains the HP and the boss explodes.",
      end_card_20_25s: "Hold on the debris with the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Keep the boss and its HP bar in frame with the army.",
      must_capture_moments: ["boss reveal", "HP draining", "boss explodes"],
      overlay_text: ["Impossible?", "HP dropping…", "Beat it?"],
    },
    success_criteria: {
      visual_readability: "The boss and its HP are legible at a glance.",
      fun_signal: "The playtest agent feels tension then relief.",
      ad_signal: "The impossible framing baits a watch to the end.",
      keep_kill_rule: "Keep if completion beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  danger_comeback: {
    id: "tpl_danger_comeback",
    title: "I Almost Lost…",
    trend: {
      name: "near-loss comeback",
      source: "market trend input",
      why_it_matters: "Near-defeat tension drives completion as viewers wait for the save.",
    },
    audience: { player_motivation: "comeback", target_emotion: "relief" },
    hypothesis: {
      statement: "A near-defeat moment creates tension that increases completion rate.",
      expected_behavior: "The viewer holds on to see whether the player recovers.",
      metric_to_watch: "completion rate, watch-time",
    },
    creative_angle: {
      hook: "I almost lost",
      promise: "Turn a losing line into a win",
      twist: "One gate saves the run",
      cta: "Could you save it?",
    },
    gameplay_mutation: {
      mechanic_focus: "danger_comeback",
      allowed_changes: ["Enemies near the line", "Red danger vignette", "Rescue via chained gate"],
      forbidden_changes: ["Do not remove the danger", "Do not change cannon control", "Do not edit source game"],
      parameters: { enemy_wave_pressure: 2.0, giant_proba: 0.5, good_gate_multiplier: "x3" },
    },
    playable_script: {
      duration_seconds: 25,
      opening_0_3s: "Enemies press right up to the defense line with a red vignette.",
      middle_3_12s: "The player steers into a chained x3 gate to rebuild the army.",
      climax_12_20s: "The rebuilt crowd pushes the enemies back and wins.",
      end_card_20_25s: "Relief beat, then the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Frame the danger line, the rescue gate and the recovery.",
      must_capture_moments: ["danger vignette", "rescue gate", "comeback win"],
      overlay_text: ["I almost lost…", "Save it!", "Could you?"],
    },
    success_criteria: {
      visual_readability: "The danger and the comeback are both obvious.",
      fun_signal: "The playtest agent feels the tension and relief.",
      ad_signal: "The near-loss hook drives watch to the resolution.",
      keep_kill_rule: "Keep if completion beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  speed_boost: {
    id: "tpl_speed_boost",
    title: "Fastest Army Wins",
    trend: {
      name: "speed / controlled chaos",
      source: "market trend input",
      why_it_matters: "Speed reads as instant power and controlled chaos.",
    },
    audience: { player_motivation: "power_fantasy", target_emotion: "dominance" },
    hypothesis: {
      statement: "A speed boost gives an immediate sensation of power that lifts watch-time.",
      expected_behavior: "The viewer reacts to the sudden acceleration and stays.",
      metric_to_watch: "3-second hold rate, watch-time",
    },
    creative_angle: {
      hook: "Fastest army wins",
      promise: "Blitz the enemy base",
      twist: "Boost lanes double your speed",
      cta: "Go fast?",
    },
    gameplay_mutation: {
      mechanic_focus: "speed_boost",
      allowed_changes: ["Add a boost lane", "Accelerated mobs", "Motion trails"],
      forbidden_changes: ["Do not remove enemies", "Do not change cannon control", "Do not edit source game"],
      parameters: { boost_zones: true, game_speed: 1.15, enemy_wave_pressure: 1.1 },
    },
    playable_script: {
      duration_seconds: 22,
      opening_0_3s: "A normal-paced crowd advances down the track.",
      middle_3_12s: "The crowd hits a glowing boost lane and accelerates hard.",
      climax_12_20s: "The sped-up army overruns the enemy base.",
      end_card_20_25s: "Snap to the win with the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Keep the boost lane and crowd speed change in frame.",
      must_capture_moments: ["normal pace", "boost acceleration", "base overrun"],
      overlay_text: ["Fastest wins", "BOOST!", "Go fast?"],
    },
    success_criteria: {
      visual_readability: "The speed change is obvious without sound.",
      fun_signal: "The playtest agent feels the acceleration rush.",
      ad_signal: "The speed hook stops the scroll early.",
      keep_kill_rule: "Keep if 3-second hold beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  loadout_comparison: {
    id: "tpl_loadout_comparison",
    title: "Which Cannon Is Better?",
    trend: {
      name: "A/B comparison",
      source: "market trend input",
      why_it_matters: "A simple A/B makes viewers pick a side and watch for the winner.",
    },
    audience: { player_motivation: "optimization", target_emotion: "curiosity" },
    hypothesis: {
      statement: "A clear A/B loadout comparison pushes the viewer to pick a side and watch on.",
      expected_behavior: "The viewer mentally bets on one cannon and waits for the result.",
      metric_to_watch: "watch-time, completion rate",
    },
    creative_angle: {
      hook: "Which cannon wins?",
      promise: "Pick the better loadout",
      twist: "The result is obvious",
      cta: "Which would you pick?",
    },
    gameplay_mutation: {
      mechanic_focus: "loadout",
      allowed_changes: ["Show a triple cannon run", "Same enemy waves", "Clear result overlay"],
      forbidden_changes: ["Do not change enemy waves between runs", "Do not edit source game", "Do not hide the result"],
      parameters: { loadout: "triple", enemy_wave_pressure: 1.1 },
    },
    playable_script: {
      duration_seconds: 24,
      opening_0_3s: "Label the run as cannon option A versus B.",
      middle_3_12s: "The triple cannon shreds through the identical enemy wave.",
      climax_12_20s: "One side clearly wins the crowd count.",
      end_card_20_25s: "Show the winner and the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Keep both loadout labels and the crowd counts visible.",
      must_capture_moments: ["option A", "option B result", "clear winner"],
      overlay_text: ["Which wins?", "A vs B", "You pick?"],
    },
    success_criteria: {
      visual_readability: "The winning loadout is obvious at a glance.",
      fun_signal: "The playtest agent finds the comparison satisfying.",
      ad_signal: "The A/B hook invites a mental choice.",
      keep_kill_rule: "Keep if watch-time beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },

  reward_dopamine: {
    id: "tpl_reward_dopamine",
    title: "Destroy Base, Get Rich",
    trend: {
      name: "reward dopamine",
      source: "market trend input",
      why_it_matters: "A loud visual reward makes the ad memorable and satisfying.",
    },
    audience: { player_motivation: "collection", target_emotion: "satisfaction" },
    hypothesis: {
      statement: "An amplified final reward increases satisfaction and makes the ad more memorable.",
      expected_behavior: "The viewer watches through to the coin explosion.",
      metric_to_watch: "completion rate, recall",
    },
    creative_angle: {
      hook: "Destroy base, get rich",
      promise: "Turn a win into a coin fountain",
      twist: "The counter never stops",
      cta: "Cash in?",
    },
    gameplay_mutation: {
      mechanic_focus: "coin_reward",
      allowed_changes: ["Amplified coins", "Sequential stars", "Rolling counter", "Extra confetti"],
      forbidden_changes: ["Do not remove the base destruction", "Do not change cannon control", "Do not edit source game"],
      parameters: { final_coin_multiplier: 4, confetti_intensity: 4 },
    },
    playable_script: {
      duration_seconds: 23,
      opening_0_3s: "The army reaches the enemy base ready to destroy it.",
      middle_3_12s: "The base explodes into a shower of coins and stars.",
      climax_12_20s: "The coin counter rolls up fast with confetti.",
      end_card_20_25s: "Freeze on the big number with the CTA.",
    },
    recording_plan: {
      aspect_ratio: "9:16",
      camera_focus: "Keep the base, the coin fountain and the counter in frame.",
      must_capture_moments: ["base destruction", "coin explosion", "counter rolling"],
      overlay_text: ["Get rich", "+coins!", "Cash in?"],
    },
    success_criteria: {
      visual_readability: "The reward explosion is obvious without sound.",
      fun_signal: "The playtest agent enjoys the payoff burst.",
      ad_signal: "The reward hook makes the ending memorable.",
      keep_kill_rule: "Keep if completion beats baseline by at least 10%.",
    },
    metadata: { created_by: "agent", source_game_version: GAME_VERSION },
  },
};

// Validate every template at import — a bad seed must fail loudly, now.
export const TEMPLATES: Record<string, AdScenarioSpec> = Object.fromEntries(
  Object.entries(RAW).map(([key, raw]) => [key, validateScenario(raw)]),
);

export function listTemplates(): AdScenarioSpec[] {
  return Object.values(TEMPLATES);
}
