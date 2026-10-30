import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { readXlsx, isDateFormatCode } from "../parsers/xlsxReader";

/** What the parser produced with ExcelJS: the reference this reader must match. */
function excelJsText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // One deliberate difference: ExcelJS printed a formula's error result as
    // "[object Object]"; the reader shows the error text ("#DIV/0!").
    if ("result" in o && o.result && typeof o.result === "object" && "error" in (o.result as object)) {
      return String((o.result as { error: unknown }).error);
    }
    if ("result" in o && o.result !== undefined) return String(o.result).trim();
    if ("text" in o && typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return o.richText.map((p: { text?: string }) => p?.text || "").join("").trim();
    if ("error" in o) return String(o.error);
  }
  return String(value).trim();
}

async function viaExcelJs(buf: Buffer): Promise<Array<{ name: string; rows: string[][] }>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (Array.isArray(row.values) ? row.values.slice(1) : []).map(excelJsText).filter(Boolean);
      if (vals.length) rows.push(vals);
    });
    return { name: ws.name, rows };
  });
}

describe("xlsxReader", () => {
  it("matches ExcelJS on strings, numbers, booleans, dates, formulas, rich text, errors and gaps", async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Data & Notes");
    s1.addRow(["ID", "Score", "Passed", "Seen on", "Note"]);
    s1.addRow(["P001", 34.5, true, new Date(Date.UTC(2023, 6, 15)), "café <ok> & \"quoted\""]);
    s1.addRow(["P002", 47, false, new Date(Date.UTC(2024, 1, 29, 13, 45)), { richText: [{ text: "rich " }, { text: "text", font: { bold: true } }] }]);
    const r = s1.addRow(["Total", { formula: "B2+B3", result: 81.5 }]);
    r.getCell(4).value = { formula: "1/0", result: { error: "#DIV/0!" } } as unknown as ExcelJS.CellValue;
    s1.getCell("D2").numFmt = "yyyy-mm-dd";
    s1.getCell("D3").numFmt = "dd/mm/yyyy hh:mm";
    s1.getCell("B5").value = 0.25;
    s1.getCell("B5").numFmt = "0.00%"; // a percentage, not a date
    s1.getCell("E7").value = "after a gap";
    const s2 = wb.addWorksheet("Empty");
    void s2;
    const s3 = wb.addWorksheet("Ünïcödé");
    s3.addRow(["Pramāṇa", "Śaṅkara"]);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const mine = await readXlsx(new Uint8Array(buf));
    expect(mine).toEqual(await viaExcelJs(buf));
    expect(mine[0].rows[1]).toContain("2023-07-15T00:00:00.000Z");
    expect(mine[0].rows[4]).toEqual(["0.25"]);
    expect(mine.map((s) => s.name)).toEqual(["Data & Notes", "Empty", "Ünïcödé"]);
  });

  it("classifies number formats", () => {
    expect(isDateFormatCode("yyyy-mm-dd")).toBe(true);
    expect(isDateFormatCode("[$-409]mmm d, yyyy")).toBe(true);
    expect(isDateFormatCode("h:mm AM/PM")).toBe(true);
    expect(isDateFormatCode("0.00%")).toBe(false);
    expect(isDateFormatCode('#,##0 "days"')).toBe(false);
    expect(isDateFormatCode("General")).toBe(false);
  });

  it("rejects a zip that is not a workbook", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    const data = await zip.generateAsync({ type: "uint8array" });
    await expect(readXlsx(data)).rejects.toThrow(/Not an Excel workbook/);
  });
});
