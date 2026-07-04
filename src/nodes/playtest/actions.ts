import type { Page } from "playwright";
import { z } from "zod";

import {
  HOLD_AND_STEER_DEFAULT_MS,
  HOLD_AND_STEER_DEFAULT_Y,
  HOLD_AND_STEER_STEP_MS,
  SLOW_DRAG_MS,
  VIEWPORT,
} from "./config";
import type { FunctionCallStep } from "./types";

const coordinate = z.number().min(0).max(999);
const optionalIntent = z.string().optional();

const clickSchema = z.object({ x: coordinate, y: coordinate, intent: optionalIntent });
const clickAtSchema = z.object({ x: coordinate, y: coordinate, intent: optionalIntent });
const moveSchema = z.object({ x: coordinate, y: coordinate, intent: optionalIntent });
const mouseSchema = z.object({ x: coordinate.optional(), y: coordinate.optional(), intent: optionalIntent });
const typeSchema = z.object({ text: z.string(), press_enter: z.boolean().optional(), intent: optionalIntent });
const typeTextAtSchema = z.object({
  x: coordinate,
  y: coordinate,
  text: z.string(),
  press_enter: z.boolean().optional(),
  intent: optionalIntent,
});
const dragSchema = z.object({
  x: coordinate.optional(),
  y: coordinate.optional(),
  start_x: coordinate.optional(),
  start_y: coordinate.optional(),
  destination_x: coordinate.optional(),
  destination_y: coordinate.optional(),
  end_x: coordinate.optional(),
  end_y: coordinate.optional(),
  duration_ms: z.number().min(100).max(5_000).optional(),
  intent: optionalIntent,
});
const waitSchema = z.object({
  seconds: z.number().min(0).max(10).optional(),
  duration_ms: z.number().min(0).max(10_000).optional(),
  intent: optionalIntent,
});
const keySchema = z.object({ key: z.string().min(1), intent: optionalIntent });
const hotkeySchema = z.object({
  keys: z.array(z.string().min(1)).min(1).optional(),
  key: z.string().min(1).optional(),
  intent: optionalIntent,
});
const scrollSchema = z.object({
  x: coordinate.optional(),
  y: coordinate.optional(),
  delta_x: z.number().optional(),
  delta_y: z.number().optional(),
  magnitude_in_pixels: z.number().min(0).max(5_000).optional(),
  direction: z.enum(["up", "down", "left", "right"]).optional(),
  intent: optionalIntent,
});
const holdAndSteerSchema = z.object({
  x_path: z.array(coordinate).min(1).max(6),
  y: coordinate.min(550).max(900).default(HOLD_AND_STEER_DEFAULT_Y),
  duration_ms: z.number().int().min(500).max(4_500).default(HOLD_AND_STEER_DEFAULT_MS),
  release: z.boolean().default(false),
  intent: optionalIntent,
});
const navigateSchema = z.object({ url: z.string().min(1), intent: optionalIntent });
const noArgsSchema = z.object({ intent: optionalIntent }).passthrough();

export interface ActionResult {
  message: string;
  isError: boolean;
  intent: string | null;
}

interface LatchState {
  held: boolean;
}

export function createActionExecutor(page: Page) {
  const latch: LatchState = { held: false };

  return {
    async execute(call: FunctionCallStep): Promise<ActionResult> {
      const safetyAcknowledged = hasSafetyConfirmation(call);
      try {
        const result = await executeParsed(page, latch, call);
        if (!safetyAcknowledged) return result;

        return {
          ...result,
          message: addSafetyAcknowledgement(result.message),
        };
      } catch (error) {
        await releaseLatch(page, latch);
        return {
          message: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            url: page.url(),
          }),
          isError: true,
          intent: readIntent(call.arguments),
        };
      }
    },

    async release(): Promise<void> {
      if (!latch.held) return;
      await safeMouseUp(page);
      latch.held = false;
    },
  };
}

async function executeParsed(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  switch (call.name) {
    case "open_web_browser":
    case "open_app":
      return noOp(call, "browser is already open");
    case "click":
    case "click_at":
      return click(page, latch, call, clickSchema.or(clickAtSchema), "click");
    case "double_click":
      return click(page, latch, call, clickSchema, "double_click");
    case "triple_click":
      return click(page, latch, call, clickSchema, "triple_click");
    case "middle_click":
      return click(page, latch, call, clickSchema, "middle_click");
    case "right_click":
      return click(page, latch, call, clickSchema, "right_click");
    case "long_press":
      return longPress(page, latch, call);
    case "move":
    case "hover_at":
      return move(page, call);
    case "mouse_down":
      return mouseDown(page, latch, call);
    case "mouse_up":
      return mouseUp(page, latch, call);
    case "type":
      return typeText(page, latch, call);
    case "type_text_at":
      return typeTextAt(page, latch, call);
    case "drag_and_drop":
      return dragAndDrop(page, latch, call);
    case "hold_and_steer":
      return holdAndSteer(page, latch, call);
    case "wait":
    case "wait_5_seconds":
      return wait(page, latch, call);
    case "press_key":
      return pressKey(page, latch, call);
    case "key_down":
      return keyDown(page, latch, call);
    case "key_up":
      return keyUp(page, latch, call);
    case "hotkey":
    case "key_combination":
      return hotkey(page, latch, call);
    case "scroll":
    case "scroll_document":
    case "scroll_at":
      return scroll(page, latch, call);
    case "navigate":
      return navigate(page, latch, call);
    case "go_back":
      return goBack(page, latch, call);
    case "go_forward":
      return goForward(page, latch, call);
    case "take_screenshot":
      return noOp(call, "screenshot will be returned");
    default:
      return {
        message: JSON.stringify({ skipped: true, reason: `unsupported action ${call.name}`, url: page.url() }),
        isError: false,
        intent: readIntent(call.arguments),
      };
  }
}

async function click(
  page: Page,
  latch: LatchState,
  call: FunctionCallStep,
  schema: z.ZodType<{ x: number; y: number; intent?: string }>,
  mode: "click" | "double_click" | "triple_click" | "middle_click" | "right_click",
): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = schema.parse(call.arguments);
  const point = denormalize(parsed.x, parsed.y);
  if (mode === "double_click") await page.mouse.dblclick(point.x, point.y);
  else if (mode === "triple_click") {
    await page.mouse.click(point.x, point.y, { clickCount: 3 });
  } else if (mode === "right_click") await page.mouse.click(point.x, point.y, { button: "right" });
  else if (mode === "middle_click") await page.mouse.click(point.x, point.y, { button: "middle" });
  else await page.mouse.click(point.x, point.y);
  return ok(page, parsed.intent, `${mode} ${point.x},${point.y}`);
}

async function longPress(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = clickSchema.parse(call.arguments);
  const point = denormalize(parsed.x, parsed.y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  return ok(page, parsed.intent, `long_press ${point.x},${point.y}`);
}

async function move(page: Page, call: FunctionCallStep): Promise<ActionResult> {
  const parsed = moveSchema.parse(call.arguments);
  const point = denormalize(parsed.x, parsed.y);
  await page.mouse.move(point.x, point.y);
  return ok(page, parsed.intent, `move ${point.x},${point.y}`);
}

async function mouseDown(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  const parsed = mouseSchema.parse(call.arguments);
  if (parsed.x !== undefined && parsed.y !== undefined) {
    const point = denormalize(parsed.x, parsed.y);
    await page.mouse.move(point.x, point.y);
  }
  if (!latch.held) await page.mouse.down();
  latch.held = true;
  return ok(page, parsed.intent, "mouse_down");
}

async function mouseUp(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  const parsed = mouseSchema.parse(call.arguments);
  if (parsed.x !== undefined && parsed.y !== undefined) {
    const point = denormalize(parsed.x, parsed.y);
    await page.mouse.move(point.x, point.y);
  }
  await releaseLatch(page, latch);
  return ok(page, parsed.intent, "mouse_up");
}

async function typeText(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = typeSchema.parse(call.arguments);
  await page.keyboard.type(parsed.text);
  if (parsed.press_enter) await page.keyboard.press("Enter");
  return ok(page, parsed.intent, "type");
}

async function typeTextAt(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = typeTextAtSchema.parse(call.arguments);
  const point = denormalize(parsed.x, parsed.y);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.type(parsed.text);
  if (parsed.press_enter) await page.keyboard.press("Enter");
  return ok(page, parsed.intent, `type_text_at ${point.x},${point.y}`);
}

async function dragAndDrop(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = dragSchema.parse(call.arguments);
  const startX = parsed.x ?? parsed.start_x;
  const startY = parsed.y ?? parsed.start_y;
  const destinationX = parsed.destination_x ?? parsed.end_x;
  const destinationY = parsed.destination_y ?? parsed.end_y;
  if (startX === undefined || startY === undefined) {
    throw new Error("drag_and_drop missing start");
  }
  if (destinationX === undefined || destinationY === undefined) {
    throw new Error("drag_and_drop missing destination");
  }

  const start = denormalize(startX, startY);
  const end = denormalize(destinationX, destinationY);
  const durationMs = parsed.duration_ms ?? SLOW_DRAG_MS;
  const steps = Math.max(5, Math.ceil(durationMs / 75));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await page.mouse.move(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
    await page.waitForTimeout(durationMs / steps);
  }
  await page.mouse.up();
  return ok(page, parsed.intent, `drag_and_drop ${start.x},${start.y} -> ${end.x},${end.y}`);
}

async function holdAndSteer(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  const parsed = holdAndSteerSchema.parse(call.arguments);
  const points = parsed.x_path.map((x) => denormalize(x, parsed.y));
  const first = points[0];
  if (!first) throw new Error("hold_and_steer missing path");

  try {
    await page.mouse.move(first.x, first.y);
    if (!latch.held) {
      await page.mouse.down();
      latch.held = true;
    }

    const segmentCount = Math.max(1, points.length - 1);
    const segmentMs = parsed.duration_ms / segmentCount;
    if (points.length === 1) {
      await page.waitForTimeout(parsed.duration_ms);
    } else {
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!from || !to) continue;
        const steps = Math.max(1, Math.ceil(segmentMs / HOLD_AND_STEER_STEP_MS));
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          await page.mouse.move(
            from.x + (to.x - from.x) * progress,
            from.y + (to.y - from.y) * progress,
          );
          await page.waitForTimeout(segmentMs / steps);
        }
      }
    }

    if (parsed.release) await releaseLatch(page, latch);
    return {
      message: JSON.stringify({
        ok: true,
        action: "hold_and_steer",
        x_path: parsed.x_path,
        y: parsed.y,
        duration_ms: parsed.duration_ms,
        release: parsed.release,
        url: page.url(),
      }),
      isError: false,
      intent: parsed.intent ?? null,
    };
  } catch (error) {
    await releaseLatch(page, latch);
    throw error;
  }
}

async function wait(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed: { seconds?: number; duration_ms?: number; intent?: string } =
    call.name === "wait_5_seconds"
      ? { seconds: 5, intent: readIntent(call.arguments) ?? undefined }
      : waitSchema.parse(call.arguments);
  const durationMs = parsed.duration_ms ?? (parsed.seconds ?? 1) * 1_000;
  await page.waitForTimeout(durationMs);
  return ok(page, parsed.intent, `wait ${durationMs}ms`);
}

async function pressKey(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = keySchema.parse(call.arguments);
  await page.keyboard.press(parsed.key);
  return ok(page, parsed.intent, `press_key ${parsed.key}`);
}

async function keyDown(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = keySchema.parse(call.arguments);
  await page.keyboard.down(parsed.key);
  return ok(page, parsed.intent, `key_down ${parsed.key}`);
}

async function keyUp(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  const parsed = keySchema.parse(call.arguments);
  await page.keyboard.up(parsed.key);
  return ok(page, parsed.intent, `key_up ${parsed.key}`);
}

async function hotkey(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = hotkeySchema.parse(call.arguments);
  const keys = parsed.keys ?? parsed.key?.split("+").map((key) => key.trim()).filter(Boolean);
  if (!keys || keys.length === 0) throw new Error("hotkey missing keys");
  for (const key of keys) await page.keyboard.down(key);
  for (const key of keys.toReversed()) await page.keyboard.up(key);
  return ok(page, parsed.intent, `hotkey ${keys.join("+")}`);
}

async function scroll(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = scrollSchema.parse(call.arguments);
  if (parsed.x !== undefined && parsed.y !== undefined) {
    const point = denormalize(parsed.x, parsed.y);
    await page.mouse.move(point.x, point.y);
  }
  const directionalDelta = directionToDelta(parsed.direction);
  const magnitude = parsed.magnitude_in_pixels ?? 600;
  await page.mouse.wheel(
    parsed.delta_x ?? scaleDelta(directionalDelta.x, magnitude),
    parsed.delta_y ?? scaleDelta(directionalDelta.y, magnitude),
  );
  return ok(page, parsed.intent, "scroll");
}

async function navigate(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = navigateSchema.parse(call.arguments);
  await page.goto(parsed.url);
  return ok(page, parsed.intent, `navigate ${parsed.url}`);
}

function scaleDelta(delta: number, magnitude: number): number {
  if (delta === 0) return 0;
  return delta > 0 ? magnitude : -magnitude;
}

async function goBack(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = noArgsSchema.parse(call.arguments);
  await page.goBack();
  return ok(page, parsed.intent, "go_back");
}

async function goForward(page: Page, latch: LatchState, call: FunctionCallStep): Promise<ActionResult> {
  await releaseLatch(page, latch);
  const parsed = noArgsSchema.parse(call.arguments);
  await page.goForward();
  return ok(page, parsed.intent, "go_forward");
}

function noOp(call: FunctionCallStep, message: string): ActionResult {
  return { message: JSON.stringify({ ok: true, message }), isError: false, intent: readIntent(call.arguments) };
}

async function releaseLatch(page: Page, latch: LatchState): Promise<void> {
  if (!latch.held) return;
  await safeMouseUp(page);
  latch.held = false;
}

async function safeMouseUp(page: Page): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.mouse.up();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Target page, context or browser has been closed")) {
      return;
    }
    throw error;
  }
}

function ok(page: Page, intent: string | undefined, action: string): ActionResult {
  return {
    message: JSON.stringify({ ok: true, action, url: page.url() }),
    isError: false,
    intent: intent ?? null,
  };
}

function denormalize(x: number, y: number) {
  return {
    x: Math.floor((x / 1_000) * VIEWPORT.width),
    y: Math.floor((y / 1_000) * VIEWPORT.height),
  };
}

function directionToDelta(direction: "up" | "down" | "left" | "right" | undefined) {
  switch (direction) {
    case "up":
      return { x: 0, y: -600 };
    case "left":
      return { x: -600, y: 0 };
    case "right":
      return { x: 600, y: 0 };
    case "down":
    default:
      return { x: 0, y: 600 };
  }
}

function hasSafetyConfirmation(call: FunctionCallStep): boolean {
  const decision = z
    .object({ safety_decision: z.object({ decision: z.literal("require_confirmation") }) })
    .safeParse(call.arguments);
  return decision.success;
}

function readIntent(args: Record<string, unknown>): string | null {
  const parsed = z.object({ intent: z.string() }).safeParse(args);
  return parsed.success ? parsed.data.intent : null;
}

function addSafetyAcknowledgement(message: string): string {
  const parsed = z.record(z.string(), z.unknown()).safeParse(parseJson(message));
  if (!parsed.success) {
    return JSON.stringify({ output: message, safety_acknowledgement: true });
  }
  return JSON.stringify({ ...parsed.data, safety_acknowledgement: true });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
