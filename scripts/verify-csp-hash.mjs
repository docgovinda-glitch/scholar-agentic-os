#!/usr/bin/env node
/**
 * Verifies server.ts's INLINE_THEME_SCRIPT_CSP_HASH constant still matches
 * index.html's inline theme-flash-prevention <script> content.
 *
 * That script has no nonce, so production's CSP script-src only lets it run
 * via an exact content hash (CSP spec: sha256-<base64 of the script's exact
 * text>). If anyone edits the script's content — even reformatting
 * whitespace — without regenerating this hash, the browser silently drops
 * the script in production with only a console CSP violation to notice by;
 * nothing server-side fails. This check makes that failure loud and
 * pre-merge instead.
 *
 * Run: node scripts/verify-csp-hash.mjs
 * Exits non-zero (and prints the correct hash) on any mismatch. Wired into
 * `npm run lint`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const serverSrc = readFileSync(join(root, "server.ts"), "utf8");

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error("verify-csp-hash: no inline <script> found in index.html — if it was removed, also remove INLINE_THEME_SCRIPT_CSP_HASH from server.ts.");
  process.exit(1);
}

// Quoted to match CSP hash-source syntax — helmet rejects an unquoted value
// outright at startup ("should be quoted"), confirmed by actually starting
// the built production server with the unquoted form.
const actualHash = `'sha256-${createHash("sha256").update(scriptMatch[1], "utf8").digest("base64")}'`;

const constMatch = serverSrc.match(/INLINE_THEME_SCRIPT_CSP_HASH\s*=\s*"([^"]+)"/);
if (!constMatch) {
  console.error("verify-csp-hash: could not find INLINE_THEME_SCRIPT_CSP_HASH in server.ts.");
  process.exit(1);
}

const configuredHash = constMatch[1];

if (actualHash !== configuredHash) {
  console.error(
    `verify-csp-hash: FAILED — index.html's inline <script> content no longer matches server.ts's INLINE_THEME_SCRIPT_CSP_HASH.\n` +
      `  In production this means the script is silently dropped by CSP — no build error, no server error, just a browser console\n` +
      `  violation nobody may notice.\n\n` +
      `  Configured: ${configuredHash}\n` +
      `  Actual:     ${actualHash}\n\n` +
      `  Update INLINE_THEME_SCRIPT_CSP_HASH in server.ts to the "Actual" value above.`
  );
  process.exit(1);
}

console.log(`  ✓ INLINE_THEME_SCRIPT_CSP_HASH matches index.html's inline script (${actualHash})`);
