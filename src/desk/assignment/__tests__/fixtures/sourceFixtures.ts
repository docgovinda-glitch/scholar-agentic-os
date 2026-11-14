/**
 * Test stand-ins for live scholarly discovery (a network call). They are
 * built from the question's own words so relevance checks pass, and are
 * clearly labelled fixtures; production code never ships a literature catalog.
 */
import type { DiscoveredSource } from "../../types";

const STOP = new Set("the and for with from that this what how does which into about their critically evaluate discuss analyse analyze explain assess".split(" "));

function topicWords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

const AUTHORS = [
  ["Adler, M."], ["Brennan, K.", "Cho, L."], ["Duarte, P."], ["Evans, R.", "Fischer, T."],
  ["Gupta, S."], ["Hall, J."], ["Ibsen, N.", "Jones, D."], ["Kaur, A."], ["Lopez, E."], ["Moreau, C."],
  ["Nakamura, Y."], ["Owens, B."], ["Park, H."], ["Quinn, F."],
];

function make(question: string, i: number, _style: string): DiscoveredSource {
  const words = topicWords(question);
  const a = words[i % Math.max(1, words.length)] || "topic";
  const b = words[(i + 1) % Math.max(1, words.length)] || "evidence";
  const title = `Fixture study ${i + 1}: ${a} and ${b} in practice`;
  const authors = AUTHORS[i % AUTHORS.length];
  const year = String(2018 + (i % 8));
  return {
    id: `fixture-src-${i + 1}`,
    title,
    authors,
    year,
    type: i % 3 === 0 ? "book" : "journal_article",
    journal: `Fixture Journal of ${a.charAt(0).toUpperCase()}${a.slice(1)}`,
    doi: `10.0000/fixture.${i + 1}`,
    url: `https://doi.org/10.0000/fixture.${i + 1}`,
    relevanceScore: 90 - i,
    roleInAssignment: i % 2 === 0 ? "Core theory" : "Empirical evidence",
    relevanceCategory: i < 4 ? "Very High" : "High",
    mainFinding: `Examines ${a} and ${b}.`,
    suggestedUse: `Evidence on ${a}.`,
    citation: `${authors[0].split(",")[0]} (${year})`,
    status: "kept",
    abstract: `A fixture abstract about ${words.slice(0, 6).join(" ")}.`,
  } as DiscoveredSource;
}

export function fixtureSources(question: string, style = "apa7", count = 12): DiscoveredSource[] {
  if (!question || question.trim().length < 4) return [];
  return Array.from({ length: count }, (_, i) => make(question, i, style));
}

export function fixtureMoreSources(existing: DiscoveredSource[], question: string, n = 10): DiscoveredSource[] {
  if (!question || question.trim().length < 4) return [];
  const have = new Set(existing.map((s) => s.id));
  const out: DiscoveredSource[] = [];
  for (let i = 0; out.length < n && i < existing.length + n + 50; i++) {
    const s = make(question, i, "apa7");
    if (!have.has(s.id)) out.push(s);
  }
  return out;
}
