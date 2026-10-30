/**
 * Minimal .xlsx reader: sheet names and cell values only.
 *
 * Replaces ExcelJS for reading uploads. ExcelJS is a full read/write library
 * (~900 kB in the browser bundle); the parser only needs the text of each
 * cell. An .xlsx file is a zip of XML parts, read here with JSZip, which the
 * app already ships for .docx/.pptx.
 *
 * Output matches what the parser produced with ExcelJS:
 * - strings as written, numbers as String(number), booleans as "true"/"false";
 * - formula cells as their cached result;
 * - date-formatted numbers as ISO-8601 (Date.toISOString());
 * - error cells as their error text ("#DIV/0!").
 */

export interface XlsxSheet {
  name: string;
  /** Non-empty cell texts per non-empty row, in column order. */
  rows: string[][];
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    }
    return XML_ENTITIES[code] ?? "";
  });
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : undefined;
}

/** Text of all <t> runs in a fragment, ignoring phonetic (<rPh>) runs. */
function runText(fragment: string): string {
  const clean = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** Built-in number formats that display dates or times (ECMA-376 18.8.30). */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

export function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, "") // quoted literals
    .replace(/\\./g, "") // escaped characters
    .replace(/\[[^\]]*\]/g, ""); // colours, conditions, locales
  return /[dmyhs]/i.test(stripped);
}

/** Excel serial date (1900 system) to a JS Date, as ExcelJS converts it. */
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400000));
}

async function loadZip(data: Uint8Array): Promise<import("jszip")> {
  const mod = await import("jszip");
  const JSZip = ((mod as unknown as { default?: typeof import("jszip") }).default ?? mod) as unknown as {
    loadAsync(d: Uint8Array): Promise<import("jszip")>;
  };
  return JSZip.loadAsync(data);
}

export async function readXlsx(data: Uint8Array): Promise<XlsxSheet[]> {
  const zip = await loadZip(data);
  const read = async (path: string): Promise<string | null> => {
    const file = zip.file(path.replace(/^\//, ""));
    return file ? file.async("string") : null;
  };

  const workbookXml = await read("xl/workbook.xml");
  if (!workbookXml) throw new Error("Not an Excel workbook (xl/workbook.xml missing)");

  // Relationship id -> sheet part path
  const relsXml = (await read("xl/_rels/workbook.xml.rels")) ?? "";
  const relTargets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) relTargets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  // Shared strings
  const sharedXml = (await read("xl/sharedStrings.xml")) ?? "";
  const shared: string[] = [];
  for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(runText(m[1]));

  // Styles: which cell style indexes are dates
  const stylesXml = (await read("xl/styles.xml")) ?? "";
  const customFormats = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(m[1], "numFmtId"));
    const code = attr(m[1], "formatCode");
    if (Number.isFinite(id) && code !== undefined) customFormats.set(id, code);
  }
  const dateStyle: boolean[] = [];
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (cellXfs) {
    for (const m of cellXfs[1].matchAll(/<xf\b([^>]*)\/?>/g)) {
      const id = Number(attr(m[1], "numFmtId") ?? "0");
      const custom = customFormats.get(id);
      dateStyle.push(custom !== undefined ? isDateFormatCode(custom) : BUILTIN_DATE_FORMATS.has(id));
    }
  }

  const sheets: XlsxSheet[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], "name") ?? `Sheet${sheets.length + 1}`;
    const relId = attr(m[1], "r:id");
    const path = (relId && relTargets.get(relId)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const sheetXml = (await read(path)) ?? "";

    const rows: string[][] = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells: string[] = [];
      for (const c of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? "";
        const type = attr(attrs, "t") ?? "n";
        const styleIdx = Number(attr(attrs, "s") ?? "0");
        const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        const raw = vMatch ? decodeXml(vMatch[1]) : undefined;

        let text = "";
        if (type === "s") text = raw !== undefined ? shared[Number(raw)] ?? "" : "";
        else if (type === "inlineStr") text = runText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
        else if (type === "b") text = raw === undefined ? "" : raw === "1" ? "true" : "false";
        else if (type === "str" || type === "e") text = raw ?? "";
        else if (raw !== undefined && raw !== "") {
          const n = Number(raw);
          text = Number.isFinite(n) && dateStyle[styleIdx] ? serialToDate(n).toISOString() : String(Number.isFinite(n) ? n : raw);
        }
        text = text.trim();
        if (text) cells.push(text);
      }
      if (cells.length > 0) rows.push(cells);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
