/**
 * The one way to write a CSV cell. Text that starts with =, +, - or @ (or a
 * tab or carriage return) is read as a formula by Excel, Sheets and LibreOffice,
 * so a title or note from a registry, an upload or the author could run one
 * when the file is opened. Such text gets a leading apostrophe, which the
 * spreadsheet shows as plain text; plain numbers are left as they are.
 * Pure; no I/O.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)*$/;

export function csvCell(value: unknown, options: { singleLine?: boolean } = {}): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (options.singleLine) text = text.replace(/\r?\n/g, " ");
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
