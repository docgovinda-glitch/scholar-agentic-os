/**
 * The manuscript as JATS 1.3 (Journal Article Tag Suite) XML, the format
 * journals and PubMed Central exchange articles in: front matter, body
 * sections, and a reference list of element-citations built from the
 * reference records, with citations as <xref> links. Only what the author
 * entered is included. Pure; no I/O.
 */
import type { ReferenceRecord } from "./references";
import { citedIds } from "./citationStyles";
import { figureFile, numberFigures, type ManuscriptFigure, type Numbering } from "./figures";

export interface JatsInput {
  title: string;
  journal?: string;
  authors: Array<{ name: string; affiliation?: string; email?: string; orcid?: string }>;
  abstract?: string;
  keywords?: string[];
  /** Manuscript Markdown without its abstract. */
  body: string;
  declarations: Array<{ label: string; text: string }>;
  records: Record<string, ReferenceRecord>;
  figures?: ManuscriptFigure[];
}

export const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const refId = (id: string) => `ref-${id.replace(/[^A-Za-z0-9_.-]/g, "_")}`;

// Numbering for the document being built (buildJats is synchronous and sets it first).
let floats: Numbering | null = null;

function inline(src: string, known: Set<string>): string {
  const out: string[] = [];
  const re = /\[CITE:([A-Za-z0-9_.:-]+)\]|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|\[(FIG|TAB):([A-Za-z0-9_-]+)\]/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    out.push(escapeXml(src.slice(last, m.index)));
    if (m[1]) out.push(known.has(m[1]) ? `<xref ref-type="bibr" rid="${refId(m[1])}">${escapeXml(m[1])}</xref>` : escapeXml(m[0]));
    else if (m[2]) out.push(`<bold>${inline(m[2], known)}</bold>`);
    else if (m[3]) out.push(`<italic>${inline(m[3], known)}</italic>`);
    else if (m[5]) {
      const label = floats?.label[m[5]];
      out.push(label ? `<xref ref-type="${m[4] === "TAB" ? "table" : "fig"}" rid="${m[4] === "TAB" ? "tab" : "fig"}-${escapeXml(m[5])}">${label}</xref>` : escapeXml(m[0]));
    }
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(escapeXml(src.slice(last)));
  return out.join("");
}

function bodyXml(markdown: string, known: Set<string>): string {
  const blocks = markdown.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  let depth = 0; // open <sec> elements
  let n = 0;
  const close = (to: number) => {
    while (depth > to) {
      out.push("</sec>");
      depth--;
    }
  };
  for (const b of blocks) {
    const lines = b.split("\n");
    const h = lines.length === 1 ? lines[0].match(/^(#{1,6})\s+(?:§\s*)?(.+)$/) : null;
    if (h) {
      const level = h[1].length >= 4 ? 2 : 1;
      close(level - 1);
      out.push(`<sec id="sec${++n}"><title>${inline(h[2].replace(/^\d+(\.\d+)*\.?\s+/, ""), known)}</title>`);
      depth = level;
    } else if (lines.every((l) => /^[-*] /.test(l)) || lines.every((l) => /^\d+\. /.test(l))) {
      const ordered = /^\d/.test(lines[0]);
      out.push(
        `<list list-type="${ordered ? "order" : "bullet"}">${lines.map((l) => `<list-item><p>${inline(l.replace(/^([-*]|\d+\.) /, ""), known)}</p></list-item>`).join("")}</list>`
      );
    } else {
      out.push(`<p>${lines.map((l) => inline(l, known)).join(" ")}</p>`);
    }
  }
  close(0);
  return out.join("\n");
}

function citationXml(r: ReferenceRecord): string {
  const type = r.kind === "article" ? "journal" : r.kind === "book" ? "book" : r.kind === "chapter" ? "book" : r.kind === "dataset" ? "data" : "other";
  const names = r.authors.map((a) => `<name><surname>${escapeXml(a.family)}</surname>${a.given ? `<given-names>${escapeXml(a.given)}</given-names>` : ""}</name>`).join("");
  const [fpage, lpage] = (r.pages ?? "").split(/\s*[-–]+\s*/);
  const parts = [
    names ? `<person-group person-group-type="author">${names}</person-group>` : "",
    r.title ? (r.kind === "book" ? `<source>${escapeXml(r.title)}</source>` : `<article-title>${escapeXml(r.title)}</article-title>`) : "",
    r.container && r.kind !== "book" ? `<source>${escapeXml(r.container)}</source>` : "",
    r.year ? `<year>${r.year}</year>` : "",
    r.volume ? `<volume>${escapeXml(r.volume)}</volume>` : "",
    r.issue ? `<issue>${escapeXml(r.issue)}</issue>` : "",
    fpage ? `<fpage>${escapeXml(fpage)}</fpage>` : "",
    lpage ? `<lpage>${escapeXml(lpage)}</lpage>` : "",
    r.publisher ? `<publisher-name>${escapeXml(r.publisher)}</publisher-name>` : "",
    r.doi ? `<pub-id pub-id-type="doi">${escapeXml(r.doi)}</pub-id>` : r.url ? `<ext-link ext-link-type="uri">${escapeXml(r.url)}</ext-link>` : "",
  ];
  return `<ref id="${refId(r.id)}"><element-citation publication-type="${type}">${parts.join("")}</element-citation></ref>`;
}

function floatXml(f: ManuscriptFigure, label: string, known: Set<string>): string {
  const caption = `<caption><p>${inline([f.caption.trim(), f.credit?.trim()].filter(Boolean).join(" "), known)}</p></caption>`;
  if (f.kind === "table") {
    const rows = f.rows ?? [];
    const cells = (r: string[], tag: "th" | "td") => `<tr>${r.map((c) => `<${tag}>${inline(c, known)}</${tag}>`).join("")}</tr>`;
    return `<table-wrap id="tab-${escapeXml(f.id)}"><label>${label}</label>${caption}<table>${rows[0] ? `<thead>${cells(rows[0], "th")}</thead>` : ""}<tbody>${rows.slice(1).map((r) => cells(r, "td")).join("")}</tbody></table></table-wrap>`;
  }
  return `<fig id="fig-${escapeXml(f.id)}"><label>${label}</label>${caption}${f.altText.trim() ? `<alt-text>${escapeXml(f.altText.trim())}</alt-text>` : ""}${f.image ? `<graphic xlink:href="${figureFile(f, label)}"/>` : ""}</fig>`;
}

export function buildJats(input: JatsInput): string {
  floats = numberFigures(input.body, input.figures ?? []);
  const ids = citedIds(input.body).filter((id) => input.records[id]);
  const known = new Set(ids);
  const authors = input.authors.filter((a) => a.name.trim());
  const contribs = authors
    .map((a, i) => {
      const parts = a.name.trim().split(/\s+/);
      const name = parts.length > 1 ? `<name><surname>${escapeXml(parts[parts.length - 1])}</surname><given-names>${escapeXml(parts.slice(0, -1).join(" "))}</given-names></name>` : `<name><surname>${escapeXml(a.name.trim())}</surname></name>`;
      return `<contrib contrib-type="author">${a.orcid ? `<contrib-id contrib-id-type="orcid">https://orcid.org/${escapeXml(a.orcid)}</contrib-id>` : ""}${name}${a.email ? `<email>${escapeXml(a.email)}</email>` : ""}${a.affiliation ? `<xref ref-type="aff" rid="aff${i + 1}"/>` : ""}</contrib>`;
    })
    .join("");
  const affs = authors.map((a, i) => (a.affiliation ? `<aff id="aff${i + 1}">${escapeXml(a.affiliation)}</aff>` : "")).join("");
  const keywords = (input.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const back = [
    input.declarations.length ? input.declarations.map((d) => `<sec><title>${escapeXml(d.label)}</title><p>${inline(d.text, known)}</p></sec>`).join("") : "",
    ids.length ? `<ref-list><title>References</title>${ids.map((id) => citationXml(input.records[id])).join("")}</ref-list>` : "",
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.3 20210610//EN" "JATS-archivearticle1-3.dtd">
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article" dtd-version="1.3">
<front>
${input.journal ? `<journal-meta><journal-title-group><journal-title>${escapeXml(input.journal)}</journal-title></journal-title-group></journal-meta>` : "<journal-meta/>"}
<article-meta>
<title-group><article-title>${inline(input.title || "Untitled manuscript", known)}</article-title></title-group>
${contribs ? `<contrib-group>${contribs}</contrib-group>` : ""}${affs}
${input.abstract?.trim() ? `<abstract><p>${inline(input.abstract.trim(), known)}</p></abstract>` : ""}
${keywords.length ? `<kwd-group>${keywords.map((k) => `<kwd>${escapeXml(k)}</kwd>`).join("")}</kwd-group>` : ""}
</article-meta>
</front>
<body>
${bodyXml(input.body, known)}
</body>
${back ? `<back>${back}</back>` : ""}
${floats.figures.length + floats.tables.length ? `<floats-group>${[...floats.figures, ...floats.tables].map((f) => floatXml(f, floats!.label[f.id], known)).join("")}</floats-group>` : ""}
</article>
`;
}
