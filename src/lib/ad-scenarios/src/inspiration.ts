// Reads an inspiration folder (references/ads-inspo by default): visual assets
// (images/gifs/videos) are catalogued by name; text notes (.md/.txt) have their
// contents read so the composer can lean on them. Read-only — never writes to
// the referenced directory (protected path).

import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { AdScenarioError } from "./schema";

const VISUAL_EXT = new Set([".gif", ".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".webm"]);
const TEXT_EXT = new Set([".md", ".txt"]);
const MAX_NOTE_CHARS = 8_000;

export interface InspirationAsset {
  file: string;
  kind: "image" | "gif" | "video";
}

export interface InspirationNote {
  file: string;
  content: string;
}

export interface Inspiration {
  dir: string;
  assets: InspirationAsset[];
  notes: InspirationNote[];
}

function classify(ext: string): InspirationAsset["kind"] | null {
  if (ext === ".gif") return "gif";
  if (ext === ".mp4" || ext === ".mov" || ext === ".webm") return "video";
  if (VISUAL_EXT.has(ext)) return "image";
  return null;
}

/**
 * Loads the inspiration folder. Missing/empty folder is not an error — it
 * returns empty lists so composition can fall back to templates. Only I/O
 * failures on an existing entry throw AdScenarioError.
 */
export async function loadInspiration(dir: string): Promise<Inspiration> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { dir, assets: [], notes: [] };
  }

  const assets: InspirationAsset[] = [];
  const notes: InspirationNote[] = [];

  for (const name of entries.sort()) {
    const ext = extname(name).toLowerCase();
    const full = join(dir, name);
    let isFile: boolean;
    try {
      isFile = (await stat(full)).isFile();
    } catch (error) {
      throw new AdScenarioError("compose", `cannot stat inspiration entry ${full}`, {
        cause: error,
      });
    }
    if (!isFile) continue;

    const kind = classify(ext);
    if (kind) {
      assets.push({ file: name, kind });
      continue;
    }
    if (TEXT_EXT.has(ext)) {
      try {
        const raw = await readFile(full, "utf8");
        notes.push({ file: name, content: raw.slice(0, MAX_NOTE_CHARS) });
      } catch (error) {
        throw new AdScenarioError("compose", `cannot read inspiration note ${full}`, {
          cause: error,
        });
      }
    }
  }

  return { dir, assets, notes };
}

/** Compact text digest of an inspiration folder for prompts / fallback seeding. */
export function summarizeInspiration(inspiration: Inspiration): string {
  const assetLine =
    inspiration.assets.length > 0
      ? `Visual references (${inspiration.assets.length}): ${inspiration.assets
          .map((a) => `${a.file} [${a.kind}]`)
          .join(", ")}`
      : "No visual references found.";
  const noteBlock =
    inspiration.notes.length > 0
      ? inspiration.notes.map((n) => `--- ${n.file} ---\n${n.content}`).join("\n\n")
      : "No text notes found.";
  return `${assetLine}\n\n${noteBlock}`;
}
