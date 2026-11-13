/**
 * Projects saved by older versions can still hold template text that is now
 * banned (keyword-table frameworks, boilerplate "Focus:" guidance). This runs
 * whenever project answers are loaded, so that text is never shown again.
 */

const BANNED_FRAMEWORKS = [
  "Bilateral Economic Interdependence Model",
  "Realist Strategic Vulnerability",
  "Small-State Asymmetric Buffer Theory",
];

const BOILERPLATE_FOCUS =
  /Focus:\s*Analy[sz]e core conceptual mechanisms, theoretical grounding(?:\s*\([^)]*\))?,?\s*and analytical dimensions for:\s*"([^"]*)"\.?/gi;
const BOILERPLATE_TITLES = /\b\d+\.\d+\s+(?:Conceptual Framing and Analysis of|Empirical Evidence and Strategic Evaluation of)\s+/g;

function cleanString(s: string): string {
  let out = s.replace(BOILERPLATE_FOCUS, (_m, q: string) => (q ? `Focus: ${q}` : "")).replace(BOILERPLATE_TITLES, "");
  for (const f of BANNED_FRAMEWORKS) out = out.split(f).join("");
  return out
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/[ \t]{2,}/g, " ");
}

function walk(value: unknown): unknown {
  if (typeof value === "string") {
    const t = value.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return JSON.stringify(walk(JSON.parse(t)));
      } catch {
        // not JSON; clean as text
      }
    }
    return cleanString(value);
  }
  if (Array.isArray(value)) {
    return value
      .filter((v) => !(typeof v === "string" && BANNED_FRAMEWORKS.includes(v.trim())))
      .map(walk);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v);
    return out;
  }
  return value;
}

/** Returns answers with legacy template text removed (same object if nothing changed). */
export function purgeLegacyTemplateText<T extends Record<string, unknown> | null | undefined>(answers: T): T {
  if (!answers || typeof answers !== "object") return answers;
  const before = JSON.stringify(answers);
  if (!BANNED_FRAMEWORKS.some((f) => before.includes(f)) && !/core conceptual mechanisms, theoretical grounding|Conceptual Framing and Analysis of|Empirical Evidence and Strategic Evaluation of/.test(before)) {
    return answers;
  }
  return walk(answers) as T;
}
