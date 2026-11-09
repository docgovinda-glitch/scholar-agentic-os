/**
 * Output-type ids the app used before it aligned with the Atlas catalog.
 *
 * The Research Proposal workspace used to be stored as `OT-19` (the catalog's
 * Case Study) and the Thesis workspace as `OT-09` (the catalog's Book /
 * Monograph). Projects saved under those ids are read as the catalog ids the
 * workspaces now use: Research Proposal `OT-15` and Master's Thesis `OT-07`.
 */
const LEGACY_OUTPUT_TYPE_IDS: Readonly<Record<string, string>> = {
  "OT-19": "OT-15",
  "OT-09": "OT-07",
};

export function normalizeOutputTypeId<T extends string | undefined | null>(id: T): T | string {
  if (typeof id !== "string") return id;
  return LEGACY_OUTPUT_TYPE_IDS[id] ?? id;
}
