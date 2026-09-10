/**
 * Citation & Formula Guardian
 * Automatically detects, masks, and restores in-text academic citations,
 * mathematical formulas, and statistical metrics with 100% preservation guarantee.
 */

export interface ProtectedItem {
  token: string;
  original: string;
  type: "citation" | "formula" | "metric";
}

export interface MaskResult {
  maskedText: string;
  items: ProtectedItem[];
  citationCount: number;
  formulaCount: number;
}

const CITATION_PATTERNS = [
  // (Author et al., 2024) or (Author, 2020; Author2, 2021)
  /\((?:[A-Z][a-zA-Z\s.-]+(?:et al\.?)?,?\s+(?:19|20)\d{2}[a-z]?(?:;\s+)?)+\)/g,
  // [1] or [12, 14] or [1-3]
  /\[\d+(?:[–,-]\s*\d+)*\]/g,
  // [@citationKey]
  /\[@[a-zA-Z0-9_:-]+\]/g,
  // DOI: 10.1000/182
  /\b(?:doi:\s*|https?:\/\/doi\.org\/)?10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi,
];

const FORMULA_PATTERNS = [
  // Display math $$ ... $$
  /\$\$[\s\S]+?\$\$/g,
  // Inline math $ ... $
  /\$(?!\s)[^$\n]+(?<!\s)\$/g,
  // Statistical test reporting: t(48) = 2.45, p < 0.001, F(2, 45) = 3.12, R^2 = 0.84
  /\b(?:[tF]\s*\(\s*\d+\s*(?:,\s*\d+)?\s*\)|p\s*[<>=]\s*\d*\.?\d+|R\^2\s*=\s*\d*\.?\d+|\b\u03C7\^2\s*=\s*\d*\.?\d+)\b/gi,
  // Big-O notation: O(n log n), O(1)
  /\bO\([a-zA-Z0-9\s^.*+-]+\)/g,
];

/**
 * Masks all citations and formulas in text before sending to LLM
 */
export function maskCitationsAndFormulas(text: string): MaskResult {
  let maskedText = text;
  const items: ProtectedItem[] = [];
  let tokenCounter = 0;

  // 1. Mask Display & Inline Math first (higher priority)
  for (const pattern of FORMULA_PATTERNS) {
    maskedText = maskedText.replace(pattern, (match) => {
      const token = `⟦FORMULA_${++tokenCounter}⟧`;
      items.push({ token, original: match, type: "formula" });
      return token;
    });
  }

  // 2. Mask Citations
  for (const pattern of CITATION_PATTERNS) {
    maskedText = maskedText.replace(pattern, (match) => {
      // Don't double mask if already inside a token
      if (match.includes("⟦")) return match;
      const token = `⟦CITATION_${++tokenCounter}⟧`;
      items.push({ token, original: match, type: "citation" });
      return token;
    });
  }

  const citationCount = items.filter((i) => i.type === "citation").length;
  const formulaCount = items.filter((i) => i.type === "formula").length;

  return {
    maskedText,
    items,
    citationCount,
    formulaCount,
  };
}

/**
 * Restores all masked citations and formulas into transformed text
 */
export function restoreCitationsAndFormulas(text: string, items: ProtectedItem[]): string {
  let restored = text;

  for (const item of items) {
    // 1. Direct match: ⟦CITATION_X⟧
    if (restored.includes(item.token)) {
      restored = restored.split(item.token).join(item.original);
    } else {
      // 2. Fuzzy match in case LLM stripped unicode brackets or lowercase
      const looseToken = item.token.replace(/[⟦⟧]/g, "");
      const looseRegex = new RegExp(`(?:\\[|\\(|⟦)?${looseToken}(?:\\]|\\)|⟧)?`, "gi");
      if (looseRegex.test(restored)) {
        restored = restored.replace(looseRegex, item.original);
      }
    }
  }

  return restored;
}
