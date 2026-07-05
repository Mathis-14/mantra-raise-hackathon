import { variantPatchSpecSchema, type VariantPatchSpec } from "./schema";

export function prepareVariantSourceHtml(html: string, sourceUrl: string): string {
  if (/<base\b/i.test(html)) return html;

  const href = sourceBaseHref(sourceUrl);
  if (!href) return html;

  return injectIntoHead(html, `<base data-mantra-source href="${escapeAttribute(href)}">`);
}

export function buildVariantHtml(baseHtml: string, spec: VariantPatchSpec): string {
  const parsedSpec = variantPatchSpecSchema.parse(spec);
  const withStyle = injectIntoHead(baseHtml, buildVariantStyle(parsedSpec));
  return injectBeforeBodyEnd(withStyle, buildVariantRuntime(parsedSpec));
}

function buildVariantStyle(spec: VariantPatchSpec): string {
  const hueRotation = colorHueRotation(spec.accentColor);
  const overlaySide = spec.overlayPosition === "top"
    ? "top:max(12px, env(safe-area-inset-top));"
    : "bottom:max(12px, env(safe-area-inset-bottom));";

  return `<style data-mantra-variant-style>
:root {
  --mantra-variant-accent: ${spec.accentColor};
  --mantra-variant-secondary: ${spec.secondaryColor};
}
html, body {
  background:
    radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--mantra-variant-accent) 35%, transparent), transparent 34%),
    radial-gradient(circle at 82% 72%, color-mix(in srgb, var(--mantra-variant-secondary) 30%, transparent), transparent 36%),
    #070712;
}
canvas, #game canvas {
  filter: saturate(1.22) contrast(1.07) hue-rotate(${hueRotation}deg);
}
.mantra-variant-overlay {
  position: fixed;
  left: 50%;
  ${overlaySide}
  z-index: 2147483646;
  transform: translateX(-50%);
  width: min(88vw, 360px);
  pointer-events: none;
  color: #fff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: center;
  text-shadow: 0 2px 12px rgba(0,0,0,.55);
}
.mantra-variant-card {
  border: 2px solid color-mix(in srgb, var(--mantra-variant-accent) 70%, white);
  border-radius: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(0,0,0,.62), rgba(0,0,0,.28));
  box-shadow: 0 12px 28px rgba(0,0,0,.34), 0 0 26px color-mix(in srgb, var(--mantra-variant-accent) 45%, transparent);
  backdrop-filter: blur(6px);
}
.mantra-variant-kicker {
  display: block;
  color: var(--mantra-variant-secondary);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}
.mantra-variant-title {
  display: block;
  margin-top: 2px;
  font-size: clamp(18px, 6vw, 30px);
  font-weight: 900;
  line-height: 1;
}
.mantra-variant-copy {
  display: block;
  margin-top: 5px;
  font-size: clamp(11px, 3.4vw, 14px);
  font-weight: 750;
  line-height: 1.15;
}
</style>`;
}

function buildVariantRuntime(spec: VariantPatchSpec): string {
  const runtimeSpec = {
    ...spec,
    mobVariant: {
      wavePressure: wavePressureForSpec(spec),
      overlayText: [spec.headline, spec.subheadline],
      mood: spec.mood,
      accentColor: spec.accentColor,
      secondaryColor: spec.secondaryColor,
      aspect: "9:16",
      autoPlay: true,
    },
  };

  return `<script data-mantra-variant-runtime>
(() => {
  const spec = ${safeJsonForScript(runtimeSpec)};
  window.__MANTRA_VARIANT__ = spec;
  window.__MOB_VARIANT__ = spec.mobVariant;

  let pointerDown = false;

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }
    callback();
  }

  function ensureOverlay() {
    if (document.querySelector('.mantra-variant-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'mantra-variant-overlay';
    const card = document.createElement('div');
    card.className = 'mantra-variant-card';

    const kicker = document.createElement('span');
    kicker.className = 'mantra-variant-kicker';
    kicker.textContent = spec.name;

    const title = document.createElement('span');
    title.className = 'mantra-variant-title';
    title.textContent = spec.headline;

    const copy = document.createElement('span');
    copy.className = 'mantra-variant-copy';
    copy.textContent = spec.subheadline;

    card.append(kicker, title, copy);
    overlay.append(card);
    document.body.append(overlay);
  }

  function clickStartButton() {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a'));
    const target = candidates.find((element) => {
      const text = (element.textContent || '').trim().toLowerCase();
      return /play|start|jouer|retry|rejouer|next|suivant/.test(text);
    });
    if (target instanceof HTMLElement) target.click();
  }

  function inputTarget() {
    return document.querySelector('canvas') || document.getElementById('game') || document.body;
  }

  function dispatchPointer(type, x, y) {
    const target = inputTarget();
    if (!target) return;
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
      buttons: type === 'pointerup' ? 0 : 1,
    }));
  }

  function steer() {
    const target = inputTarget();
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const t = Date.now() / 620;
    const x = rect.left + rect.width * (0.5 + Math.sin(t) * 0.32);
    const y = rect.top + rect.height * 0.74;
    if (!pointerDown) {
      pointerDown = true;
      dispatchPointer('pointerdown', x, y);
    }
    dispatchPointer('pointermove', x, y);
  }

  ready(() => {
    ensureOverlay();
    window.setTimeout(clickStartButton, 350);
    window.setInterval(clickStartButton, 2_400);
    window.setInterval(steer, 180);
  });
})();
</script>`;
}

function wavePressureForSpec(spec: VariantPatchSpec): number {
  if (spec.pressure === "chaotic") return 1.35;
  if (spec.pressure === "calm") return 0.85;
  return 1.05;
}

function colorHueRotation(color: string): number {
  const hex = color.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return Math.round(((red * 3 + green * 5 + blue * 7) % 96) - 48);
}

function injectIntoHead(html: string, payload: string): string {
  const headMatch = /<head\b[^>]*>/i.exec(html);
  if (headMatch?.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return `${html.slice(0, insertAt)}\n${payload}\n${html.slice(insertAt)}`;
  }

  const htmlMatch = /<html\b[^>]*>/i.exec(html);
  if (htmlMatch?.index !== undefined) {
    const insertAt = htmlMatch.index + htmlMatch[0].length;
    return `${html.slice(0, insertAt)}\n<head>${payload}</head>\n${html.slice(insertAt)}`;
  }

  return `<head>${payload}</head>\n${html}`;
}

function injectBeforeBodyEnd(html: string, payload: string): string {
  const bodyEndMatch = /<\/body\s*>/i.exec(html);
  if (bodyEndMatch?.index !== undefined) {
    return `${html.slice(0, bodyEndMatch.index)}\n${payload}\n${html.slice(bodyEndMatch.index)}`;
  }

  return `${html}\n${payload}`;
}

function sourceBaseHref(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") {
      return null;
    }
    return new URL(".", url).toString();
  } catch {
    return null;
  }
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
