/**
 * Document Intelligence Engine - Spreadsheet Parser
 *
 * Production-quality tabular data parser using xlsx library.
 * Extracts sheet names, row counts, formatted samples, and summaries with NFC Unicode normalization.
 */

import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

export class SpreadsheetParser implements Parser {
  metadata: ParserMetadata = {
    id: "spreadsheet",
    name: "Spreadsheet & Tabular Data Parser",
    description: "Extracts tabular data, row counts, and structural summaries from Excel and CSV files",
    version: "1.0.0",
    capabilities: {
      mimeTypes: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "text/tab-separated-values",
      ],
      extensions: ["xlsx", "xls", "csv", "tsv"],
      supportsMetadata: true,
      supportsStructure: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    },
  };

  async parse(input: DocumentInput): Promise<ParserOperationResult> {
    const { data } = input;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetNames = workbook.SheetNames || [];
      const textParts: string[] = [];
      const pages: Array<{ text: string; pageNumber: number }> = [];
      let totalRows = 0;

      sheetNames.forEach((sheetName, idx) => {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) return;

        const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        totalRows += rows.length;

        const sheetLines: string[] = [`[Sheet: ${sheetName}] (${rows.length} rows)`];
        const sample = rows.slice(0, 100);
        sample.forEach((row, rowIdx) => {
          const rowStr = (Array.isArray(row) ? row : [])
            .map((c) => String(c).trim())
            .filter(Boolean)
            .join(" | ");
          if (rowStr) {
            sheetLines.push(`Row ${rowIdx + 1}: ${rowStr}`);
          }
        });

        if (rows.length > 100) {
          sheetLines.push(`... and ${rows.length - 100} more rows`);
        }

        const sheetText = sheetLines.join("\n").normalize("NFC");
        textParts.push(sheetText);
        pages.push({
          pageNumber: idx + 1,
          text: sheetText,
        });
      });

      const summary = `Spreadsheet containing ${sheetNames.length} sheet(s) (${sheetNames.join(", ")}), with ${totalRows} total rows.`;
      const fullText = (textParts.length > 0 ? textParts.join("\n\n") : buffer.toString("utf-8")).normalize("NFC");

      const parserResult: ParserResult = {
        text: fullText,
        metadata: {
          summary,
          sheetNames,
          rowCount: totalRows,
        },
        pages,
        warnings: sheetNames.length === 0 ? ["No worksheets found in workbook"] : [],
      };

      return {
        ok: true,
        data: parserResult,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: {
          type: "PARSE_ERROR",
          message: `Failed to parse spreadsheet: ${msg}`,
          cause: error,
        },
      };
    }
  }
}
