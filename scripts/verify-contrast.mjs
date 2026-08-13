#!/usr/bin/env node
/**
 * WCAG contrast verification for the Scholar OS token system.
 *
 * Authority: docs/06-decisions/60-DESIGN-DIRECTION.md
 *
 * The design direction this replaced recorded its contrast ratios in CSS
 * comments, computed by hand at the time each token was written. Several of
 * those comments documented failures that were never fixed, and at least one
 * (the h2/h4 colour override) was only caught by live browser inspection
 * months later. Comments do not fail a build; this does.
 *
 * Parses the real token values out of src/index.css — it does not keep its
 * own copy, so it cannot drift from what ships — and checks every text/surface
 * and border/surface pairing the design actually uses, in both themes.
 *
 * Run: node scripts/verify-contrast.mjs
 * Exits non-zero on any failure. Wired into `npm run lint:contrast` and CI.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

/* --- WCAG 2.1 relative luminance and contrast ------------------------------ */

function srgbToLinear(channel8bit) {
  const c = channel8bit / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const int = parseInt(m[1], 16);
  const r = srgbToLinear((int >> 16) & 0xff);
  const g = srgbToLinear((int >> 8) & 0xff);
  const b = srgbToLinear(int & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* --- Token extraction -----------------------------------------------------
 * Light lives in the first `:root {` block; dark in `:root[data-theme="dark"]`.
 * Only literal hex values are collected — aliases (`var(...)`) are skipped,
 * since a pairing between two aliases resolves to the same literals already
 * under test.
 * ------------------------------------------------------------------------ */

function extractBlock(startPattern) {
  const start = css.search(startPattern);
  if (start === -1) throw new Error(`Block not found: ${startPattern}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`Unterminated block: ${startPattern}`);
}

function parseTokens(block) {
  const tokens = {};
  for (const [, name, value] of block.matchAll(
    /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g
  )) {
    tokens[name] = value;
  }
  return tokens;
}

const light = parseTokens(extractBlock(/:root \{\n\s*color-scheme: light/));
const dark = parseTokens(extractBlock(/:root\[data-theme="dark"\] \{/));

/* --- The pairings the design actually uses -------------------------------- */

const SURFACES = ['--surface-canvas', '--surface-raised', '--surface-inset'];

/** [foreground, backgrounds, minimum ratio, why] */
const CHECKS = [
  ['--text-primary', SURFACES, 4.5, 'body text'],
  ['--text-secondary', SURFACES, 4.5, 'labels and secondary copy'],
  ['--text-muted', SURFACES, 4.5, 'hints and metadata'],
  ['--accent', SURFACES, 4.5, 'links, active nav, interactive icons'],
  ['--accent-hover', SURFACES, 4.5, 'hover state of the above'],
  ['--state-success', SURFACES, 4.5, 'success text'],
  ['--state-warning', SURFACES, 4.5, 'warning text'],
  ['--state-danger', SURFACES, 4.5, 'error text'],
  ['--state-info', SURFACES, 4.5, 'informational text'],

  // 1.4.11 non-text contrast: 3:1 for anything that identifies a UI component
  // or its state. Control edges qualify; decorative panel dividers
  // (--border-subtle / --border-default) do not, and are deliberately not
  // checked here — see the borders block in src/index.css for that split.
  ['--border-control', SURFACES, 3, 'input and button edges'],
  ['--border-strong', SURFACES, 3, 'emphasis and hover on a control'],

  // Text sitting on a filled accent (primary buttons).
  ['--text-inverse', ['--accent-solid'], 4.5, 'label on a primary button'],

  // Text on the tinted subtle fills (selected chips, callouts).
  ['--text-primary', ['--accent-subtle'], 4.5, 'text on a selected chip'],
  ['--state-success', ['--state-success-subtle'], 4.5, 'success callout text'],
  ['--state-warning', ['--state-warning-subtle'], 4.5, 'warning callout text'],
  ['--state-danger', ['--state-danger-subtle'], 4.5, 'error callout text'],
  ['--state-info', ['--state-info-subtle'], 4.5, 'info callout text'],
  // AuthNotice (auth confirmations — "check your email", "reset link sent")
  // uses the brand accent tint rather than --state-info-subtle's blue, so it
  // reads as Scholar Core rather than a generic info-blue callout.
  ['--accent', ['--accent-subtle'], 4.5, 'AuthNotice callout text'],
];

/* --- Run ------------------------------------------------------------------ */

let failures = 0;
let checked = 0;

for (const [themeName, tokens] of [['light', light], ['dark', dark]]) {
  console.log(`\n  ${themeName.toUpperCase()}`);

  for (const [fgName, bgNames, floor, purpose] of CHECKS) {
    const fg = tokens[fgName];
    if (!fg) {
      console.log(`  ✗ ${fgName} is not defined in the ${themeName} theme`);
      failures++;
      continue;
    }

    for (const bgName of bgNames) {
      const bg = tokens[bgName];
      if (!bg) {
        console.log(`  ✗ ${bgName} is not defined in the ${themeName} theme`);
        failures++;
        continue;
      }

      const ratio = contrast(fg, bg);
      const pass = ratio >= floor;
      checked++;
      if (!pass) failures++;

      const label = `${fgName} on ${bgName}`.padEnd(46);
      console.log(
        `  ${pass ? '✓' : '✗'} ${label} ${ratio.toFixed(2)}:1  ` +
          `(needs ${floor}:1 — ${purpose})`
      );
    }
  }
}

/* Elevation sanity check.
 *
 * The reason the previous navy scale needed a glowing border on every panel
 * was that its surfaces were tonally indistinguishable — at most 1.18:1
 * between adjacent steps. This asserts the replacement does not repeat that:
 * adjacent surfaces must differ enough to read as separate planes without a
 * border doing the work. 1.05:1 is a deliberately low bar — surfaces should
 * be *distinguishable*, not high-contrast against each other.
 */
console.log('\n  ELEVATION (surfaces must separate without a border)');
for (const [themeName, tokens] of [['light', light], ['dark', dark]]) {
  const ratio = contrast(tokens['--surface-canvas'], tokens['--surface-raised']);
  const pass = ratio >= 1.05;
  checked++;
  if (!pass) failures++;
  console.log(
    `  ${pass ? '✓' : '✗'} ${themeName}: canvas vs raised`.padEnd(50) +
      ` ${ratio.toFixed(3)}:1  (needs 1.05:1)`
  );
}

console.log(
  `\n  ${checked} pairings checked, ${failures} failing.\n`
);

if (failures > 0) {
  console.error(
    `  Contrast verification FAILED — ${failures} pairing(s) below floor.\n` +
      `  Fix the token values in src/index.css; do not lower a floor here.\n`
  );
  process.exit(1);
}

console.log('  Contrast verification passed.\n');
