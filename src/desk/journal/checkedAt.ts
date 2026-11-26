/** A saved timestamp as the reader's local date and time; empty when it can't be read (never "Invalid Date"). */
export function checkedAtLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/** A link target only when it is a web address (a stored value is never trusted as a script URL). */
export const isWebUrl = (url: string | undefined): url is string => Boolean(url) && /^https?:\/\//i.test(url as string);
