#!/usr/bin/env node
// B7: no pure #000000 in app source. Use the ink token (#171717 /
// var(--text-primary)); Tailwind's `black` is mapped to #171717 in index.css.
// Translucent shadows (#0000001a, rgba(0,0,0,.1)) are fine.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN = ["src", "index.html"];
// The deck theme adapter maps legacy #000000 to #171717, so it names the value.
const ALLOW = new Set(["src/features/slides/gamma/theme.ts"]);
const PATTERN = /#000000(?![0-9a-fA-F])|#000(?![0-9a-fA-F])/g;

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (e === "node_modules" || e === "__tests__") continue;
      yield* walk(join(p, e));
    }
  } else if (/\.(tsx?|css|html)$/.test(p)) yield p;
}

const hits = [];
for (const base of SCAN) {
  for (const file of walk(join(ROOT, base))) {
    const rel = relative(ROOT, file);
    if (ALLOW.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (PATTERN.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        PATTERN.lastIndex = 0;
      });
  }
}

if (hits.length) {
  console.error(`Pure black (#000000) found; use #171717 or a token:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("  ✓ no pure #000000 in app source");
