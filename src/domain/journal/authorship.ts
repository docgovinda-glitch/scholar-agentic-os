/**
 * Authors of a manuscript: the CRediT contributor roles (NISO Z39.104-2022),
 * the contribution statement journals ask for, ORCID iD checks, and what the
 * title page still needs. Pure; no I/O.
 */

/** The 14 CRediT roles, in the order NISO lists them. */
export const CREDIT_ROLES = [
  "Conceptualization",
  "Data curation",
  "Formal analysis",
  "Funding acquisition",
  "Investigation",
  "Methodology",
  "Project administration",
  "Resources",
  "Software",
  "Supervision",
  "Validation",
  "Visualization",
  "Writing – original draft",
  "Writing – review & editing",
] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export interface ManuscriptAuthor {
  id: string;
  firstName: string;
  surname: string;
  affiliation?: string;
  email: string;
  orcid?: string;
  isCorresponding: boolean;
  creditRoles: string[];
}

export const fullName = (a: Pick<ManuscriptAuthor, "firstName" | "surname">) => `${a.firstName} ${a.surname}`.replace(/\s+/g, " ").trim();

/** "Ada Lovelace" → "A. Lovelace"; hyphenated given names keep both initials. */
export function initialsName(a: Pick<ManuscriptAuthor, "firstName" | "surname">): string {
  const initials = a.firstName
    .split(/\s+/)
    .filter(Boolean)
    .map((g) => g.split("-").map((p) => `${p.charAt(0).toUpperCase()}.`).join("-"))
    .join(" ");
  return [initials, a.surname.trim()].filter(Boolean).join(" ");
}

/**
 * The contribution statement from each author's roles, in CRediT order:
 * "A. Lovelace: Conceptualization, Methodology. C. Babbage: Software."
 * Authors with no roles are left out (and reported by checkAuthors).
 */
export function creditStatement(authors: ManuscriptAuthor[]): string {
  return authors
    .filter((a) => fullName(a) && a.creditRoles.length > 0)
    .map((a) => {
      const roles = CREDIT_ROLES.filter((r) => a.creditRoles.includes(r));
      return `${initialsName(a)}: ${roles.join(", ")}.`;
    })
    .join(" ");
}

/** "https://orcid.org/0000-0002-1825-0097" or "0000000218250097" → "0000-0002-1825-0097". */
export function normalizeOrcid(raw: string | undefined): string {
  const digits = String(raw ?? "")
    .replace(/^https?:\/\/orcid\.org\//i, "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase();
  return digits.length === 16 ? digits.replace(/(.{4})(?=.)/g, "$1-") : String(raw ?? "").trim();
}

/** ORCID's ISO 7064 MOD 11-2 check digit is right. */
export function isValidOrcid(raw: string | undefined): boolean {
  const id = normalizeOrcid(raw).replace(/-/g, "");
  if (!/^\d{15}[\dX]$/.test(id)) return false;
  let total = 0;
  for (const ch of id.slice(0, 15)) total = (total + Number(ch)) * 2;
  const result = (12 - (total % 11)) % 11;
  return id[15] === (result === 10 ? "X" : String(result));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthorProblem {
  authorId?: string;
  message: string;
}

/** What the title page and contribution statement still need. */
export function checkAuthors(authors: ManuscriptAuthor[]): AuthorProblem[] {
  const out: AuthorProblem[] = [];
  if (authors.length === 0) return [{ message: "Add at least one author." }];
  const corresponding = authors.filter((a) => a.isCorresponding);
  if (corresponding.length === 0) out.push({ message: "Choose a corresponding author." });
  if (corresponding.length > 1) out.push({ message: "Only one author can be the corresponding author." });
  authors.forEach((a, i) => {
    const who = fullName(a) || `Author ${i + 1}`;
    if (!a.firstName.trim() || !a.surname.trim()) out.push({ authorId: a.id, message: `${who}: first name and surname are both needed.` });
    if (!a.affiliation?.trim()) out.push({ authorId: a.id, message: `${who}: add an affiliation.` });
    if (a.isCorresponding && !EMAIL.test(a.email.trim())) out.push({ authorId: a.id, message: `${who}: the corresponding author needs an email address.` });
    if (a.email.trim() && !EMAIL.test(a.email.trim())) out.push({ authorId: a.id, message: `${who}: the email address doesn't look right.` });
    if (a.orcid?.trim() && !isValidOrcid(a.orcid)) out.push({ authorId: a.id, message: `${who}: the ORCID iD's check digit doesn't match; check it at orcid.org.` });
    if (a.creditRoles.length === 0) out.push({ authorId: a.id, message: `${who}: choose at least one CRediT role.` });
  });
  return out;
}

export function newAuthor(id: string, isCorresponding = false): ManuscriptAuthor {
  return { id, firstName: "", surname: "", affiliation: "", email: "", orcid: "", isCorresponding, creditRoles: [] };
}
