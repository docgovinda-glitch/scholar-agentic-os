/**
 * A section draft that stopped part way (the student pressed Stop, or the
 * connection dropped) is resumed from its last complete sentence, so the
 * model never has to finish a broken sentence. Pure; no I/O.
 */

/** The text up to its last complete sentence; the whole text when it has none. */
export function trimToLastSentence(text: string): string {
  const t = (text || "").trimEnd();
  if (!t) return "";
  const re = /[.!?]["'”’)\]]?(?=\s|$)/g;
  let end = -1;
  for (let m = re.exec(t); m; m = re.exec(t)) end = m.index + m[0].length;
  return end > 0 ? t.slice(0, end) : t;
}
