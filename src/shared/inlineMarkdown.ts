/**
 * Inline Markdown in drafted prose and reference entries (*italic*, **bold**),
 * shared by every export writer (.docx in the browser, PDF on the server), so
 * literal asterisks never reach a document.
 */

/** Strip LaTeX/Markdown escapes the model leaves in prose ("\$3\$-noisy" -> "3-noisy", "\_" -> "_"). */
export function cleanEscapes(text: string): string {
  return (text || "")
    .replace(/\\\$([^$]*?)\\\$/g, "$1")
    .replace(/\$([^$\n]{1,40})\$/g, "$1")
    .replace(/\\([$_*#%&{}])/g, "$1")
    .replace(/\[Unverified Claim[^\]]*\]/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

export interface StyledRun {
  text: string;
  italics?: boolean;
  bold?: boolean;
}

/** Inline Markdown as styled runs: never prints literal asterisks. */
export function inlineMarkdownRuns(text: string): StyledRun[] {
  const clean = cleanEscapes(text);
  const runs: StyledRun[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m.index > last) runs.push({ text: clean.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else runs.push({ text: m[2], italics: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) runs.push({ text: clean.slice(last) });
  return runs.length ? runs : [{ text: clean }];
}
