import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { SpreadsheetParser } from "../parsers/spreadsheetParser";

describe("SpreadsheetParser (ExcelJS replacement for xlsx)", () => {
  const parser = new SpreadsheetParser();

  it("parses a real .xlsx workbook buffer with multiple sheets and formula cells", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet1 = workbook.addWorksheet("Participants");
    sheet1.addRow(["ID", "Age", "Outcome"]);
    sheet1.addRow(["P001", 34, "Recovered"]);
    sheet1.addRow(["P002", 47, { formula: "SUM(10,20)", result: 30 }]);

    const sheet2 = workbook.addWorksheet("Summary");
    sheet2.addRow(["Metric", "Value"]);
    sheet2.addRow(["Total N", 2]);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const res = await parser.parse({
      data: buffer,
      filename: "cohort_study.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata?.sheetNames).toEqual(["Participants", "Summary"]);
      expect(res.data.metadata?.rowCount).toBe(5);
      expect(res.data.text).toContain("[Sheet: Participants] (3 rows)");
      expect(res.data.text).toContain("Row 2: P001 | 34 | Recovered");
      expect(res.data.text).toContain("Row 3: P002 | 47 | 30");
      expect(res.data.text).toContain("[Sheet: Summary] (2 rows)");
      expect(res.data.pages).toHaveLength(2);
    }
  });

  it("parses CSV buffers with quoted fields and commas", async () => {
    const csv = `Author,Title,Citations\n"Smith, J.","A Study on ""AI""",42\n"Doe, A.",Another Paper,19\n`;
    const res = await parser.parse({
      data: Buffer.from(csv, "utf-8"),
      filename: "references.csv",
      mimeType: "text/csv",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata?.sheetNames).toEqual(["Sheet1"]);
      expect(res.data.metadata?.rowCount).toBe(3);
      expect(res.data.text).toContain('Row 2: Smith, J. | A Study on "AI" | 42');
      expect(res.data.text).toContain("Row 3: Doe, A. | Another Paper | 19");
    }
  });

  it("parses TSV buffers accurately", async () => {
    const tsv = "Gene\tLog2FC\tpValue\nBRCA1\t2.41\t0.0001\nTP53\t-1.85\t0.0023\n";
    const res = await parser.parse({
      data: Buffer.from(tsv, "utf-8"),
      filename: "expression.tsv",
      mimeType: "text/tab-separated-values",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata?.rowCount).toBe(3);
      expect(res.data.text).toContain("Row 2: BRCA1 | 2.41 | 0.0001");
    }
  });
});

