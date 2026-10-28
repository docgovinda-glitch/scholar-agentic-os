/**
 * Document Intelligence Engine - Spreadsheet Parser
 *
 * Production-quality tabular data parser using ExcelJS (and deterministic CSV/TSV fallback).
 * Extracts sheet names, row counts, formatted samples, and summaries with NFC Unicode normalization.
 */

import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function formatCellValue(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) return "";
  if (typeof cellValue === "object") {
    const obj = cellValue as Record<string, unknown>;
    if ("result" in obj && obj.result !== undefined) return String(obj.result).trim();
    if ("text" in obj && typeof obj.text === "string") return obj.text.trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part: any) => part?.text || "").join("").trim();
    }
    if (cellValue instanceof Date) return cellValue.toISOString();
  }
  return String(cellValue).trim();
}

export class SpreadsheetParser implements Parser {
  metadata: ParserMetadata = {
    id: "spreadsheet",
    name: "Spreadsheet & Tabular Data Parser",
    description: "Extracts tabular data, row counts, and structural summaries from Excel and CSV files",
    version: "2.0.0",
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
    const { data, filename = "", mimeType = "" } = input;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const lowerName = filename.toLowerCase();
    const lowerMime = mimeType.toLowerCase();

    const isZipXlsx =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;
    const isTextTabular =
      !isZipXlsx &&
      (lowerName.endsWith(".csv") ||
        lowerName.endsWith(".tsv") ||
        lowerMime.includes("csv") ||
        lowerMime.includes("tab-separated-values"));

    try {
      const sheetNames: string[] = [];
      const textParts: string[] = [];
      const pages: Array<{ text: string; pageNumber: number }> = [];
      let totalRows = 0;

      if (isZipXlsx) {
        const excelJsModule = await import("exceljs");
        const ExcelJS = ((excelJsModule as any).default || excelJsModule) as typeof import("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);

        workbook.worksheets.forEach((worksheet, idx) => {
          const sheetName = worksheet.name || `Sheet${idx + 1}`;
          sheetNames.push(sheetName);

          const rows: string[][] = [];
          worksheet.eachRow({ includeEmpty: false }, (row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            const formatted = values.map(formatCellValue).filter(Boolean);
            if (formatted.length > 0) {
              rows.push(formatted);
            }
          });

          totalRows += rows.length;
          const sheetLines: string[] = [`[Sheet: ${sheetName}] (${rows.length} rows)`];
          rows.slice(0, 100).forEach((r, rowIdx) => {
            sheetLines.push(`Row ${rowIdx + 1}: ${r.join(" | ")}`);
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
      } else if (isTextTabular || buffer.length > 0) {
        const rawText = buffer.toString("utf-8").normalize("NFC");
        const delimiter = lowerName.endsWith(".tsv") || lowerMime.includes("tab-separated") ? "\t" : ",";
        const rows = parseDelimitedText(rawText, delimiter);
        const sheetName = "Sheet1";
        sheetNames.push(sheetName);
        totalRows = rows.length;

        const sheetLines: string[] = [`[Sheet: ${sheetName}] (${rows.length} rows)`];
        rows.slice(0, 100).forEach((r, rowIdx) => {
          const rowStr = r.filter(Boolean).join(" | ");
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
          pageNumber: 1,
          text: sheetText,
        });
      }

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
