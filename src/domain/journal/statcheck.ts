/**
 * Finds APA-style test results in the text (t, F, r, χ², z with a p-value)
 * and recomputes p from the test statistic and degrees of freedom, the way
 * statcheck does. Rounding of the reported statistic is allowed for. A result
 * whose recomputed p would change the conclusion at α = .05 is a "decision
 * error". Pure; no I/O.
 */

// ── Distributions ────────────────────────────────────────────────────────

function lnGamma(x: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betaCf(a: number, b: number, x: number): number {
  const EPS = 1e-14, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(a, b, x)) / a : 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

/** Upper regularized incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

export type TestKind = "t" | "F" | "r" | "chi2" | "z";

/** Two-tailed p for t, r and z; upper-tail p for F and χ². */
export function pValue(test: TestKind, value: number, df1?: number, df2?: number): number {
  const v = Math.abs(value);
  switch (test) {
    case "t":
      return incBeta(df1! / 2, 0.5, df1! / (df1! + v * v));
    case "r": {
      if (v >= 1) return 0;
      const t = v * Math.sqrt(df1! / (1 - v * v));
      return incBeta(df1! / 2, 0.5, df1! / (df1! + t * t));
    }
    case "z":
      return gammaQ(0.5, (v * v) / 2);
    case "F":
      return incBeta(df2! / 2, df1! / 2, df2! / (df2! + df1! * v));
    case "chi2":
      return gammaQ(df1! / 2, v / 2);
  }
}

// ── Finding results in text ──────────────────────────────────────────────

export interface StatResult {
  /** The result as written, e.g. "t(28) = 2.20, p = .036". */
  text: string;
  index: number;
  test: TestKind;
  df1?: number;
  df2?: number;
  value: number;
  op: "=" | "<" | ">";
  reportedP: number;
  /** Recomputed p from the reported statistic (exact value). */
  computedP: number;
  consistent: boolean;
  /** Recomputed p falls on the other side of .05 from what is reported. */
  decisionError: boolean;
  /** Inconsistent as two-tailed, consistent if the test was one-tailed. */
  oneTailedFits: boolean;
}

const NUM = String.raw`-?\d*\.?\d+`;
const P = String.raw`p\s*([=<>≤≥])\s*(0?\.\d+|1(?:\.0+)?)`;
const SEP = String.raw`\s*,\s*`;
const PATTERNS: Array<{ test: TestKind; re: RegExp }> = [
  { test: "t", re: new RegExp(String.raw`\bt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(${NUM})${SEP}${P}`, "g") },
  { test: "F", re: new RegExp(String.raw`\bF\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*=\s*(${NUM})${SEP}${P}`, "g") },
  { test: "r", re: new RegExp(String.raw`\br\s*\(\s*(\d+)\s*\)\s*=\s*(${NUM})${SEP}${P}`, "g") },
  { test: "chi2", re: new RegExp(String.raw`(?:χ2|χ²|chi2|chi-square|X2|Χ2)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:,\s*N\s*=\s*\d+\s*)?\)\s*=\s*(${NUM})${SEP}${P}`, "gi") },
  { test: "z", re: new RegExp(String.raw`\b[zZ]\s*=\s*(${NUM})${SEP}${P}`, "g") },
];

const decimals = (s: string) => (s.includes(".") ? s.split(".")[1].length : 0);

/** Text normalised so the patterns match: minus signs, ≤/≥, italics markers. */
function normalise(text: string): string {
  return text.replace(/[−–—]/g, "-").replace(/\*/g, "").replace(/\s+/g, " ");
}

export function checkStatistics(text: string): StatResult[] {
  const src = normalise(text);
  const out: StatResult[] = [];
  for (const { test, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const g = m.slice(1);
      const [df1, df2, valueStr, opRaw, pStr] =
        test === "F" ? [Number(g[0]), Number(g[1]), g[2], g[3], g[4]] : test === "z" ? [undefined, undefined, g[0], g[1], g[2]] : [Number(g[0]), undefined, g[1], g[2], g[3]];
      const value = Number(valueStr);
      const reportedP = Number(pStr);
      if (!Number.isFinite(value) || !Number.isFinite(reportedP)) continue;
      if (test === "r" && Math.abs(value) > 1) continue;
      const op: StatResult["op"] = opRaw === "<" || opRaw === "≤" ? "<" : opRaw === ">" || opRaw === "≥" ? ">" : "=";

      // The statistic was rounded when reported: p could come from anywhere in that interval.
      const half = 0.5 * Math.pow(10, -decimals(valueStr));
      const lo = Math.max(0, Math.abs(value) - half);
      const hi = Math.abs(value) + half;
      const pAt = (v: number) => pValue(test, v, df1, df2);
      const pMax = pAt(lo), pMin = pAt(hi);
      const computedP = pAt(Math.abs(value));
      const pd = decimals(pStr);
      const round = (p: number) => Number(p.toFixed(pd));

      const fits = (min: number, max: number) =>
        op === "=" ? round(min) <= reportedP && reportedP <= round(max) : op === "<" ? min < reportedP : max > reportedP;
      const consistent = fits(pMin, pMax);
      const oneTailedFits = !consistent && (test === "t" || test === "z" || test === "r") && fits(pMin / 2, pMax / 2);

      const reportedSig = op === ">" ? false : op === "<" ? reportedP <= 0.05 : reportedP < 0.05;
      const decisionError = !consistent && !oneTailedFits && reportedSig !== computedP < 0.05;

      out.push({
        text: m[0],
        index: m.index ?? 0,
        test,
        df1,
        df2,
        value,
        op,
        reportedP,
        computedP,
        consistent,
        decisionError,
        oneTailedFits,
      });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** p as journals print it: "< .001", ".036", ".50". */
export function formatP(p: number): string {
  if (p < 0.001) return "< .001";
  return p.toFixed(3).replace(/^0/, "");
}
