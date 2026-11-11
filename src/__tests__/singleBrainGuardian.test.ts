import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const BRAIN = path.join("server", "src", "services", "scholarBrain.ts");
const EXEC_FNS = ["callOpenRouterJSON", "callOpenRouterText", "streamOpenRouterJSON"];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isTestFile(rel: string): boolean {
  return /(^|[\\/])__tests__[\\/]/.test(rel) || /\.(test|spec)\.tsx?$/.test(rel);
}

function productionFiles(dirs: string[]): string[] {
  return dirs
    .flatMap((d) => walk(path.join(ROOT, d)))
    .map((f) => path.relative(ROOT, f))
    .filter((rel) => !isTestFile(rel) && rel !== BRAIN);
}

describe("Single-Brain Architecture lock", () => {
  it("only scholarBrain.ts imports from utils/llm (execution functions)", () => {
    const offenders: string[] = [];
    for (const rel of productionFiles(["server/routes", "src"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const importRe = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']*utils\/llm(?:\.ts)?["']/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text))) {
        if (EXEC_FNS.some((fn) => new RegExp(`\\b${fn}\\b`).test(m![1]))) offenders.push(rel);
      }
      if (/import\(\s*["'][^"']*utils\/llm(?:\.ts)?["']\s*\)/.test(text)) offenders.push(`${rel} (dynamic)`);
    }
    expect(offenders).toEqual([]);
  });

  it("no route or service imports utils/llm at all", () => {
    const offenders = productionFiles(["server/routes", "src"]).filter((rel) =>
      /from\s*["'][^"']*utils\/llm(?:\.ts)?["']/.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("src/desk has no hardcoded subject-to-framework lookup tables", () => {
    const banned = [
      /Bilateral Economic Interdependence Model/,
      /Realist Strategic Vulnerability/,
      /Small-State Asymmetric Buffer Theory/,
      /\[\s*\/[^\n]*\/[a-z]*\s*,\s*"[^"\n]*(?:Theory|Framework|Model|Analysis)[^"\n]*"\s*\]/,
    ];
    const offenders: string[] = [];
    for (const rel of productionFiles(["src/desk"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (banned.some((re) => re.test(text))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("permanently bans the Quantum catalog and the Zappos/Schein template in Coursework code", () => {
    const FORBIDDEN = [/quantumComputingCatalog/, /QUANTUM_COMPUTING_CATALOG/, /zappos/i];
    expect(fs.existsSync(path.join(ROOT, "src/desk/assignment/services/catalogs/quantumComputingCatalog.ts"))).toBe(false);
    const offenders: string[] = [];
    for (const rel of productionFiles(["src/desk", "server/routes/project/assignment"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (FORBIDDEN.some((re) => re.test(text))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("OT-22 (Presentation Studio) runs its AI only through scholarBrain", () => {
    for (const rel of ["server/routes/project/presentation.ts", "server/routes/presentations.ts"]) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(text, rel).not.toMatch(/utils\/llm/);
      expect(text, rel).not.toMatch(/callOpenRouter|streamOpenRouter/);
    }
    const route = fs.readFileSync(path.join(ROOT, "server/routes/project/presentation.ts"), "utf8");
    expect(route).toMatch(/scholarBrain\.presentationOutline/);
    expect(route).toMatch(/scholarBrain\.writeSlideBlock/);
    expect(route).toMatch(/scholarBrain\.complete/);
  });

  it("OT-22 client code has no document-banner or course-code title hacks", () => {
    const offenders: string[] = [];
    for (const rel of productionFiles(["src/desk/presentation", "src/features/slides"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (/DEPARTMENT\s+OF\s+COMPUTER/i.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
