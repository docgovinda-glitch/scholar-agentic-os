/** Author-name parsing shared by every Coursework citation path. Pure. */

export interface ParsedPersonName {
  family: string;
  given: string;
  /** "F. M." */
  initials: string;
  /** The source string said "et al." */
  etAl: boolean;
}

/**
 * Parse one author string from any index: "Family, Given" (Crossref),
 * "Given Family" (OpenAlex), "Family, G.H." (Harvard) or "Arute et al.".
 * Never treats "et al." as a name and never swaps family and given names.
 */
export function parsePersonName(raw: string): ParsedPersonName {
  let t = (raw || "").replace(/\s+/g, " ").trim();
  const etAl = /\bet\.?\s*al\.?/i.test(t);
  t = t.replace(/,?\s*\bet\.?\s*al\.?/i, "").trim();
  let family = t;
  let given = "";
  if (t.includes(",")) {
    [family, given] = [t.slice(0, t.indexOf(",")).trim(), t.slice(t.indexOf(",") + 1).trim()];
  } else {
    const parts = t.split(" ");
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && /^(?:[A-Z]\.?){1,3}$/.test(last)) {
      // "Smith JA" (Vancouver/PubMed): family first
      family = parts.slice(0, -1).join(" ");
      given = last;
    } else if (parts.length >= 2) {
      // Keep particles with the family name: "Ludwig van Beethoven" -> "van Beethoven"
      let i = parts.length - 1;
      while (i > 1 && /^(?:van|von|de|der|den|da|di|du|la|le|del|dos|bin|al)$/i.test(parts[i - 1])) i--;
      family = parts.slice(i).join(" ");
      given = parts.slice(0, i).join(" ");
    }
  }
  const initials = given
    .split(/[\s.]+|(?<=-)/)
    .map((g) => g.replace(/[^\p{L}-]/gu, ""))
    .filter(Boolean)
    .map((g) => (g.startsWith("-") ? `-${g[1] ?? ""}.` : `${g[0].toUpperCase()}.`))
    .join(" ")
    .replace(/ -/g, "-");
  return { family, given, initials, etAl };
}

/**
 * Split a typed author list into one string per person. Semicolons separate
 * people when present; otherwise commas do, except that a part made only of
 * initials ("M. A.") belongs to the family name before it, so
 * "Nielsen, M. A., Chuang, I. L." is two people, not four. "and" / "&" also
 * separate people.
 */
export function splitAuthorList(text: string): string[] {
  const raw = (text || "").replace(/\s+(?:and|&)\s+/gi, text.includes(";") ? "; " : ", ").trim();
  if (!raw) return [];
  if (raw.includes(";")) return raw.split(";").map((a) => a.trim()).filter(Boolean);
  const parts = raw.split(",").map((a) => a.trim()).filter(Boolean);
  const initialsOnly = /^(?:[A-Z]\.?(?:-[A-Z]\.?)?\s*)+$/;
  const out: string[] = [];
  for (const part of parts) {
    if (out.length && initialsOnly.test(part) && !out[out.length - 1].includes(",")) out[out.length - 1] = `${out[out.length - 1]}, ${part}`;
    else out.push(part);
  }
  return out;
}
