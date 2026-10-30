#!/usr/bin/env node
// B7: app chrome uses colour tokens, not raw hex Tailwind classes such as
// `bg-[#1C1C1E]`. Add a named colour in src/index.css (@theme, --color-*)
// and use `bg-ink-750` etc. Deck themes (src/features/slides) carry their own
// colours as data and are not scanned.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN = ["src/desk", "src/components", "src/layouts"];
const PATTERN = /-\[#[0-9a-fA-F]{3,8}\]/;

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (e === "node_modules" || e === "__tests__") continue;
      yield* walk(join(p, e));
    }
  } else if (/\.tsx?$/.test(p)) yield p;
}

const hits = [];
for (const base of SCAN) {
  for (const file of walk(join(ROOT, base))) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (PATTERN.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
}

if (hits.length) {
  console.error(`Raw hex colour classes found; use a colour token from src/index.css:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`  ✓ no raw hex colour classes in ${SCAN.join(", ")}`);
