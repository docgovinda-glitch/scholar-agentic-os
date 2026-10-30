#!/usr/bin/env node
// Fails the build when any client JavaScript chunk exceeds the size budget
// (B7: every chunk < 500 kB). Run after `vite build`.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUDGET_KB = Number(process.env.CHUNK_BUDGET_KB || 500);
const dir = join(process.cwd(), "dist", "assets");

let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`verify-chunk-budget: ${dir} not found; run vite build first.`);
  process.exit(1);
}

const sizes = files
  .map((f) => ({ f, kb: statSync(join(dir, f)).size / 1024 }))
  .sort((a, b) => b.kb - a.kb);
const over = sizes.filter((s) => s.kb > BUDGET_KB);

console.log(`Largest chunks (budget ${BUDGET_KB} kB):`);
for (const s of sizes.slice(0, 5)) console.log(`  ${s.kb.toFixed(1).padStart(8)} kB  ${s.f}`);

if (over.length > 0) {
  console.error(`\n${over.length} chunk(s) over ${BUDGET_KB} kB: ${over.map((s) => s.f).join(", ")}`);
  console.error("Lazy-load the heavy module or split it in vite.config.ts manualChunks.");
  process.exit(1);
}
console.log(`  ✓ all ${sizes.length} chunks within ${BUDGET_KB} kB`);
