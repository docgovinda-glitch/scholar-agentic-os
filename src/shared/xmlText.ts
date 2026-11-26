/**
 * Text that is safe to write into an XML 1.0 document (.pptx, .docx, JATS).
 * Control characters other than tab, line feed and carriage return are not
 * allowed in XML at all, and one of them makes the whole file unreadable
 * ("needs repair" in PowerPoint and Word). They turn up in real text: PDF
 * extraction leaves form feeds, Word leaves vertical tabs for soft line
 * breaks. Those two are line breaks; the others, and lone surrogate halves,
 * are dropped. Pure; no I/O.
 */
const LINE_BREAKS = /[\u000B\u000C\u0085\u2028\u2029]/g;
const INVALID = /[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlText(text: string): string {
  return text.replace(LINE_BREAKS, '\n').replace(INVALID, '');
}
