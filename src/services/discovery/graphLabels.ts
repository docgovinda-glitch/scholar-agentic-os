/** Words that mark a publisher or organisation, whose "surname" would be meaningless. */
const ORGANISATION = /\b(news|tv|magazine|times|post|journal|university|institute|organi[sz]ation|council|commission|ministry|department|agency|bank|group|media|network|sports?|press|association|society|foundation|office|nations)\b/i;

/** "Samarasinghe (2025)": the first author's family name, or an organisation's name, with the year. */
export function graphNodeLabel(authors: string[] | undefined, year: number | undefined): string {
  const raw = (authors?.[0] ?? "").replace(/\s+et al\.?$/i, "").trim();
  let name = "Unknown";
  if (raw) {
    if (ORGANISATION.test(raw)) name = raw;
    else if (raw.includes(",")) name = raw.split(",")[0].trim();
    else {
      const words = raw.split(/\s+/);
      // "Samarasinghe AB": trailing initials follow the family name.
      while (words.length > 1 && /^(?:[A-Z]\.?){1,3}$/.test(words[words.length - 1])) words.pop();
      name = words[words.length - 1];
    }
  }
  if (name.length > 18) name = `${name.slice(0, 17).trim()}…`;
  return `${name} (${year || "n.d."})`;
}
