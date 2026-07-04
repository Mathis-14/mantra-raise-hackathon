// Read-only index of ad-inspiration assets. Lists reference media so the
// composer can mention it in a prompt. NEVER writes — references/ is protected.

import { readdirSync } from "node:fs";
import { extname, join } from "node:path";

export type InspirationKind = "image" | "animation" | "video";

export interface InspirationItem {
  path: string;
  kind: InspirationKind;
}

export interface InspirationIndex {
  items: InspirationItem[];
  note: string;
}

const KIND_BY_EXT: Record<string, InspirationKind> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "animation",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
};

/**
 * Lists inspiration media in `dir` (default references/ads-inspo), read-only.
 * Tolerates a missing or empty directory (returns items: []). Never writes.
 */
export function loadInspiration(dir = "references/ads-inspo"): InspirationIndex {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { items: [], note: `no inspiration directory at ${dir}` };
  }

  const items: InspirationItem[] = [];
  for (const name of entries) {
    const kind = KIND_BY_EXT[extname(name).toLowerCase()];
    if (kind) items.push({ path: join(dir, name), kind });
  }

  const note =
    items.length === 0
      ? `no recognized inspiration media in ${dir}`
      : `${items.length} inspiration asset(s) indexed from ${dir}`;
  return { items, note };
}
