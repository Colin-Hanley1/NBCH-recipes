// build.mjs — compiles recipes/*.md into dist/recipes.json and copies the app in.
// Zero dependencies. Runs on Node 18+ (Cloudflare Pages default) or locally.
//
//   node build.mjs
//
// Output: dist/index.html + dist/recipes.json  (this is what Cloudflare serves)

import { readdir, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(ROOT, "recipes");
const DIST = join(ROOT, "dist");

/* ---------- tiny frontmatter + markdown parser ---------- */

// Split a file into {front, body}. Frontmatter is the block between the first
// pair of `---` lines at the very top.
function splitFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { front: {}, body: text.trim() };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { front: {}, body: text.trim() };
  const front = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n+/, "");
  return { front: parseFront(front), body: body.trim() };
}

// Minimal YAML: `key: value` lines, plus inline `[a, b]` lists and `- item` lists.
function parseFront(block) {
  const out = {};
  let currentKey = null;
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      (out[currentKey] ||= []).push(unquote(listItem[1].trim()));
      continue;
    }
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    currentKey = key;
    if (val === "") {
      // value is on following `- ` lines
      out[key] = [];
    } else if (val.startsWith("[") && val.endsWith("]")) {
      out[key] = val.slice(1, -1).split(",").map((s) => unquote(s.trim())).filter(Boolean);
    } else {
      out[key] = coerce(unquote(val));
    }
  }
  return out;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
function coerce(s) {
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if (s === "true") return true;
  if (s === "false") return false;
  return s;
}

// Pull `## ingredients` (a bullet list) and `## steps` (freeform text) out of the body.
function parseBody(body) {
  const sections = {};
  let current = null;
  const buf = [];
  const flush = () => {
    if (current) sections[current] = buf.join("\n").trim();
    buf.length = 0;
  };
  for (const line of body.split("\n")) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flush();
      current = h[1].trim().toLowerCase();
    } else if (current) {
      buf.push(line);
    }
  }
  flush();

  const ingredients = (sections.ingredients || "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);

  // steps: strip a leading "1. " / "- " if the author used a list, keep line breaks.
  const steps = (sections.steps || sections.method || sections.directions || "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+\.\s+|[-*]\s+)/, "").trim())
    .filter(Boolean)
    .join("\n");

  return { ingredients, steps };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* ---------- build ---------- */

async function build() {
  let files = [];
  try {
    files = (await readdir(RECIPES_DIR)).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    console.warn("no recipes/ directory found — building with an empty catalogue.");
  }

  const recipes = [];
  for (const file of files) {
    const raw = await readFile(join(RECIPES_DIR, file), "utf8");
    const { front, body } = splitFrontmatter(raw);
    const bodyParts = parseBody(body);

    const name = String(front.name || file.replace(/\.md$/i, "")).trim();
    const meal = String(front.meal || "dinner").trim().toLowerCase();
    const time = Number.isFinite(front.time) ? front.time : parseInt(front.time, 10) || 30;
    const ingredients =
      (Array.isArray(front.ingredients) && front.ingredients.length
        ? front.ingredients
        : bodyParts.ingredients) || [];
    const steps = bodyParts.steps || String(front.steps || "").trim();
    const tags = Array.isArray(front.tags) ? front.tags : [];

    if (!ingredients.length) {
      console.warn(`⚠  ${file}: no ingredients found (need a "## ingredients" list).`);
    }

    recipes.push({
      id: slugify(name) || slugify(file),
      name,
      meal,
      time,
      ingredients,
      steps,
      tags,
    });
  }

  recipes.sort((a, b) => a.name.localeCompare(b.name));

  await mkdir(DIST, { recursive: true });
  await copyFile(join(ROOT, "index.html"), join(DIST, "index.html"));
  await writeFile(join(DIST, "recipes.json"), JSON.stringify(recipes, null, 2));

  console.log(`✓ built ${recipes.length} recipe${recipes.length === 1 ? "" : "s"} → dist/`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
