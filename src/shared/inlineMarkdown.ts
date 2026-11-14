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
  underline?: boolean;
}

/**
 * Inline Markdown as styled runs: **bold**, *italic* and <u>underline</u>
 * (nested in any order). Never prints literal asterisks or tags.
 */
export function inlineMarkdownRuns(text: string): StyledRun[] {
  const runs: StyledRun[] = [];
  const walk = (src: string, style: Omit<StyledRun, "text">) => {
    const re = /<u>([\s\S]+?)<\/u>|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m.index > last) runs.push({ text: src.slice(last, m.index), ...style });
      if (m[1] !== undefined) walk(m[1], { ...style, underline: true });
      else if (m[2] !== undefined) walk(m[2], { ...style, bold: true });
      else walk(m[3], { ...style, italics: true });
      last = m.index + m[0].length;
    }
    if (last < src.length) runs.push({ text: src.slice(last), ...style });
  };
  const clean = cleanEscapes(text);
  walk(clean, {});
  return runs.length ? runs : [{ text: clean }];
}
