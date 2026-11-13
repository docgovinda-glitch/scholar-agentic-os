/**
 * The one list of domains that are never treated as authoritative sources (forums, content farms,
 * homework sites, unattributed blogging platforms). Web results from these are tiered D.
 */
export const LOW_CREDIBILITY_DOMAINS: readonly string[] = [
  "quora.com",
  "reddit.com",
  "pinterest.com",
  "answers.com",
  "yahoo.com",
  "medium.com",
  "blogspot.com",
  "wordpress.com",
  "tumblr.com",
  "ehow.com",
  "wikihow.com",
  "vocal.media",
  "hubpages.com",
  "buzzfeed.com",
  "scribd.com",
  "coursehero.com",
  "studocu.com",
  "chegg.com",
  "brainly.com",
];

export function isLowCredibilityDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return LOW_CREDIBILITY_DOMAINS.some((bad) => d === bad || d.endsWith(`.${bad}`));
}
