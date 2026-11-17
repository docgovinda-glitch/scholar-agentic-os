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

  it("permanently bans the Quantum catalog and the Zappos/Schein template anywhere in app or server code", () => {
    // All of src/ and server/: a canned case once hid in src/features (brief sanitizer,
    // scope classifier, slide generator) where a Coursework-only scan did not look.
    const FORBIDDEN = [/quantumComputingCatalog/, /QUANTUM_COMPUTING_CATALOG/, /zappos/i, /Schein's 3 Levels/i];
    expect(fs.existsSync(path.join(ROOT, "src/desk/assignment/services/catalogs/quantumComputingCatalog.ts"))).toBe(false);
    const offenders: string[] = [];
    for (const rel of [...productionFiles(["src", "server"]), "server.ts"]) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (FORBIDDEN.some((re) => re.test(text))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("permanently bans subject literature catalogs and keyword-to-theory engines", () => {
    // Sources come only from live discovery, the vault or uploads; frameworks only from AI or the student.
    for (const gone of [
      "src/desk/assignment/services/scholarlyDiscoveryService.ts",
      "src/desk/assignment/services/catalogs",
      "src/features/sources/services/citationValidationService.ts",
    ]) {
      expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
    }
    const FORBIDDEN = [
      /UN_PEACE_SECURITY_CATALOG/,
      /IR_CHINA_GEOPOLITICS_CATALOG/,
      /ORGANIZATIONAL_CULTURE_CATALOG/,
      /APPROVED_ORGANIZATIONAL_CULTURE_LITERATURE/,
      /CORE_SCHOLARLY_CATALOG/,
      /"Structural Realism & Neorealism"/,
    ];
    const offenders: string[] = [];
    for (const rel of productionFiles(["src", "server/routes", "server/src"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (FORBIDDEN.some((re) => re.test(text))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("Coursework routes, domain and UI hold no prompt text: prompts live in scholarBrain.courseworkPrompts", () => {
    const offenders: string[] = [];
    for (const rel of productionFiles(["server/routes/project/assignment", "src/domain/assignment", "src/desk/assignment"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (/You are (the|a|an) /.test(text) || /Return ONLY valid JSON|Respond with ONLY JSON/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    expect(fs.readFileSync(path.join(ROOT, "server/src/services/scholarBrain.ts"), "utf8")).toMatch(/courseworkPrompts/);
  });

  it("no HTTP route holds prompt text: every workspace's prompts live in server/src/services/prompts, reached through scholarBrain", () => {
    const offenders: string[] = [];
    for (const rel of productionFiles(["server/routes"])) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (/You are (the|a|an) /.test(text) || /Return ONLY valid JSON|Respond with ONLY JSON/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    const brain = fs.readFileSync(path.join(ROOT, "server/src/services/scholarBrain.ts"), "utf8");
    for (const name of ["courseworkPrompts", "journalPrompts", "thesisPrompts", "proposalPrompts", "presentationPrompts"]) {
      expect(brain, name).toMatch(new RegExp(`\\b${name},`));
    }
  });

  it("Coursework routes reach the AI only through scholarBrain's logged wrappers, never routerBridge directly", () => {
    const offenders = productionFiles(["server/routes/project/assignment"]).filter((rel) =>
      /ai\/routerBridge/.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("no route or server module takes routedCompletion straight from routerBridge: every completion goes through scholarBrain", () => {
    // routerBridge's other exports (keyring, availability, the response decorator) are plumbing, not completions.
    const offenders: string[] = [];
    for (const rel of [...productionFiles(["server/routes", "server/src"]), "server.ts"]) {
      if (rel === path.join("server", "src", "ai", "routerBridge.ts")) continue;
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const importRe = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']*ai\/routerBridge(?:\.ts)?["']/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text))) {
        if (/\brouted(Completion|Text)\b/.test(m[1])) offenders.push(rel);
      }
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
