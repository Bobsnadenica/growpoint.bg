#!/usr/bin/env node
/**
 * Dark-theme regression guard.
 *
 * The dark theme is applied via per-selector overrides under
 * `:root[data-theme="dark"]`. A new component that hardcodes a light background
 * (white / light gray / light blue) without a matching dark override renders as
 * a "white box" in dark mode — a bug we've hit repeatedly.
 *
 * This script scans src/styles/global.css for container rules with a *light*
 * background (luminance-based, so it catches non-pure-white grays too) that lack
 * a dark override, and fails (exit 1) if any are found. Run it in CI / before a
 * deploy so the regression can't slip in silently.
 *
 *   node scripts/check-theme.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "..", "src", "styles", "global.css");
const css = readFileSync(cssPath, "utf8");

// Selectors that legitimately keep a light/colored background (badges, pills,
// buttons, decorative pseudo-elements, avatars, status chips, etc.).
const SKIP =
  /data-theme="dark"|::(before|after|-webkit|placeholder|marker|selection)|scrollbar|\bbutton\b|__button|-btn|primary-button|ghost-button|\bchip\b|chip--|pill|badge|tab-row|slot-button|theme-toggle|menu-toggle|brand-mark|avatar|::file|:focus|:hover|:active|skip-link|step-pill|rating|star|social-auth|status-badge|panel--success|panel--error|advertisement|lottie/;

function maxLuminance(value) {
  let best = -1;
  for (const m of value.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    best = Math.max(best, 0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (const m of value.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?/g)) {
    const a = m[4] ? Number(m[4]) : 1;
    if (a < 0.5) continue;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    best = Math.max(best, 0.299 * r + 0.587 * g + 0.114 * b);
  }
  return best;
}

const darkSelectors = new Set();
for (const chunk of css.split("}")) {
  if (!chunk.includes("{")) continue;
  const sel = chunk.slice(0, chunk.lastIndexOf("{")).trim();
  if (sel.includes('data-theme="dark"')) {
    for (const part of sel.split(",")) darkSelectors.add(part.trim());
  }
}

const seen = new Set();
const gaps = [];
for (const chunk of css.split("}")) {
  if (!chunk.includes("{")) continue;
  const idx = chunk.lastIndexOf("{");
  const sel = chunk.slice(0, idx).trim();
  const body = chunk.slice(idx + 1);
  if (sel.includes('data-theme="dark"')) continue;
  const bg = /background(?:-color|-image)?:\s*([^;]+);/.exec(body);
  if (!bg || maxLuminance(bg[1]) < 205) continue;
  for (const raw of sel.split(",")) {
    const s = raw.trim().split("\n").pop().trim();
    if (!s || seen.has(s) || s.includes(":root")) continue;
    seen.add(s);
    if (SKIP.test(s)) continue;
    if (css.includes(`:root[data-theme="dark"] ${s}`)) continue;
    gaps.push(s);
  }
}

if (gaps.length) {
  console.error(
    `\n✗ Dark-theme check failed: ${gaps.length} light-background container(s) lack a dark override.\n` +
      `Add a rule under :root[data-theme="dark"] (usually background: var(--surface)/var(--surface-alt)).\n`
  );
  for (const g of gaps.sort()) console.error("  - " + g);
  console.error("");
  process.exit(1);
}

console.log("✓ Dark-theme check passed: no uncovered light-background containers.");
