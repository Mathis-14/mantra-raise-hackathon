export const CU_MODEL_PRIMARY = "gemini-3.5-flash";
export const CU_MODEL_FALLBACK = "gemini-2.5-computer-use-preview-10-2025";
export const REPORT_MODEL = "gemini-2.5-flash";
export const PLAYTEST_GEMINI_SERVICE_TIER = "priority";

export const VIEWPORT = { width: 1280, height: 1100 } as const;
export const HEADED_WINDOW_CHROME_HEIGHT_PX = 120;

export const MAX_TURNS = 40;
export const MAX_CALLS_PER_TURN = 4;
export const REPORT_GRACE_S = 30;
export const CU_STEP_TIMEOUT_MS = 60_000;
export const MIN_CU_TURN_REMAINING_MS = 10_000;
export const REPORT_TIMEOUT_MS = 60_000;
export const STORAGE_UPLOAD_TIMEOUT_MS = 5_000;
export const PAGE_GOTO_TIMEOUT_MS = 15_000;
export const PLAYWRIGHT_ACTION_TIMEOUT_MS = 5_000;
export const SLOW_DRAG_MS = 1_500;
export const HOLD_AND_STEER_DEFAULT_Y = 760;
export const HOLD_AND_STEER_DEFAULT_MS = 2_500;
export const HOLD_AND_STEER_STEP_MS = 60;
export const NUDGE_AFTER_REPEATS = 5;
export const POST_WIN_MAX_TURNS = 5;
export const POST_WIN_MAX_MS = 25_000;
export const MIN_TURNS_FOR_REPORT = 3;
export const JPEG_QUALITY = 70;

export const PLAYTEST_MEDIA_BUCKET = "playtest-media";
export const ARTIFACT_ROOT = "playtest-artifacts";

// M0 smoke, 2026-07-04:
// @google/genai 1.52.0 was rejected by the live Interactions API as legacy.
// Updating the existing SDK to 2.10.0 restored the documented steps-based API.
// gemini-3.5-flash returned a browser click in 4185ms; the legacy 2.5 CU model
// returned open_web_browser in 4371ms, so 3.5 Flash is the usable primary.
