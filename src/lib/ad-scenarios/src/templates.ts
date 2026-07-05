// Deterministic AdScenarioSpec templates — one per mechanic_focus. Used as the
// fallback when no Gemini key is available, and as the round-trip fixture set
// for tests. Every template must satisfy adScenarioSpecSchema by construction.

import type { AdScenarioSpec, MechanicFocus } from "./schema";
import { FOCUS_DEFAULT_LOADOUT, FOCUS_DEFAULT_SKIN } from "./vocabulary";

function spec(
  focus: MechanicFocus,
  hook: string,
  hypothesis: string,
  intensity: number,
  overlayText: string[],
): AdScenarioSpec {
  return {
    hook,
    mechanicFocus: focus,
    hypothesis,
    skin: FOCUS_DEFAULT_SKIN[focus],
    loadout: FOCUS_DEFAULT_LOADOUT[focus],
    intensity,
    overlayText,
  };
}

export const SCENARIO_TEMPLATES: Record<MechanicFocus, AdScenarioSpec> = {
  fail_bait: spec(
    "fail_bait",
    "99% of players pick the wrong gate",
    "A visible trap wall baits a wrong turn, and the near-fail hook drives curiosity taps.",
    0.55,
    ["Don't pick the wrong side", "99% fail here"],
  ),
  crowd_explosion: spec(
    "crowd_explosion",
    "Watch the crowd explode",
    "An open early level with light waves lets the crowd swell dramatically — the satisfying core.",
    0.35,
    ["x1000 crowd?", "Keep them coming"],
  ),
  boss_crush: spec(
    "boss_crush",
    "Can you crush the boss?",
    "A boss-cadence start with heavier waves promises a big power fantasy payoff.",
    0.7,
    ["Crush the boss", "Bring everything"],
  ),
  danger_comeback: spec(
    "danger_comeback",
    "So close to losing…",
    "High wave pressure manufactures a near-loss, then the comeback swell rewards the viewer.",
    0.8,
    ["Almost lost it", "Comeback time"],
  ),
  speed_boost: spec(
    "speed_boost",
    "Pure speed, zero friction",
    "A near-empty field and light waves make the run feel fast and effortless.",
    0.3,
    ["Fast run", "No brakes"],
  ),
  maze_navigation: spec(
    "maze_navigation",
    "Thread the maze",
    "Lane-carving walls force navigation choices, adding tension without extra combat.",
    0.5,
    ["Find the path", "Thread it"],
  ),
  close_call: spec(
    "close_call",
    "One wrong move and it's over",
    "Flanking hazards create repeated close-call dodges that read as high-stakes.",
    0.65,
    ["Dodge the saws", "Too close"],
  ),
};

// Keyword → focus routing for the deterministic composer. First match wins;
// order matters (more specific phrases first).
const TREND_KEYWORDS: { focus: MechanicFocus; words: string[] }[] = [
  { focus: "fail_bait", words: ["fail", "bait", "wrong", "trap", "99%", "trick"] },
  { focus: "danger_comeback", words: ["comeback", "danger", "almost", "clutch", "near loss", "save"] },
  { focus: "close_call", words: ["close call", "dodge", "saw", "spike", "hazard", "narrow"] },
  { focus: "boss_crush", words: ["boss", "crush", "raid", "castle", "smash"] },
  { focus: "maze_navigation", words: ["maze", "labyrinth", "path", "navigate", "lane", "corridor", "ice"] },
  { focus: "speed_boost", words: ["speed", "fast", "rush", "boost", "quick"] },
  { focus: "crowd_explosion", words: ["crowd", "explode", "multiply", "swarm", "horde", "big army"] },
];

/** Deterministic focus pick from a free-text trend; defaults to crowd_explosion. */
export function focusForTrend(trend: string | null): MechanicFocus {
  if (!trend) return "crowd_explosion";
  const lower = trend.toLowerCase();
  for (const { focus, words } of TREND_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return focus;
  }
  return "crowd_explosion";
}

/** Deterministic template for a trend, with the trend woven into the first overlay line. */
export function templateForTrend(trend: string | null): AdScenarioSpec {
  const focus = focusForTrend(trend);
  const base = SCENARIO_TEMPLATES[focus];
  if (!trend) return base;
  return { ...base, hook: `${base.hook} — ${trend}`.slice(0, 120) };
}
