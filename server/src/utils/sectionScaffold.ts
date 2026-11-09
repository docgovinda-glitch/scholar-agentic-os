/**
 * Offline section scaffold: when no AI provider can answer, the student still
 * gets a structured outline of the section built ONLY from what they already
 * have: the section's title and prompt, its key points and their approved
 * sources. It states no facts, figures or findings, and is labelled as a
 * scaffold so it is never mistaken for AI-written prose.
 */
export interface ScaffoldSource {
  id?: string;
  title?: string;
  authors?: string[] | string;
  year?: string | number;
}

export interface SectionScaffoldInput {
  title: string;
  prompt?: string;
  keyPoints?: string[];
  assignmentQuestion?: string;
  sources?: ScaffoldSource[];
  targetWords?: number;
}

export const SCAFFOLD_MARKER = "[Offline scaffold: replace each prompt with your own analysis]";

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t);

function authorLabel(a: ScaffoldSource["authors"]): string {
  const first = Array.isArray(a) ? a[0] : a;
  return (first || "").split(",")[0].trim();
}

export function buildSectionScaffold(input: SectionScaffoldInput): string {
  const title = input.title.replace(/^\s*\d+(\.\d+)*\.?\s*/, "").trim() || "This section";
  const points = (input.keyPoints ?? []).filter((p) => p && p.trim()).slice(0, 5);
  const sources = (input.sources ?? []).filter((s) => s.title).slice(0, 4);
  const per = input.targetWords && points.length ? Math.round(input.targetWords / Math.max(1, points.length + 1) / 5) * 5 : undefined;

  const lines: string[] = [SCAFFOLD_MARKER, ""];
  if (input.prompt || input.assignmentQuestion) {
    lines.push(`**What this section must answer:** ${clip((input.prompt || input.assignmentQuestion || "").trim(), 400)}`, "");
  }
  lines.push(`**Opening (Point):** State your answer to "${clip(title, 120)}" in one or two sentences.`, "");
  if (points.length > 0) {
    points.forEach((p, i) => {
      lines.push(`**Paragraph ${i + 1}${per ? ` (~${per} words)` : ""}:** ${clip(p.trim(), 220)}`);
      lines.push(`- Evidence: add a claim from your sources${sources[i] ? ` such as ${authorLabel(sources[i].authors) || "the source"} (${sources[i].year ?? "n.d."})` : ""}.`);
      lines.push(`- Explain: say why it matters for the question, then link back to your answer.`, "");
    });
  } else {
    lines.push("**Paragraph 1:** Make your first point, support it with evidence, explain it, and link it back to the question.", "");
  }
  lines.push(`**Close (Link):** Tie the section back to the assignment question.`);
  if (sources.length > 0) {
    lines.push("", "**Your approved sources for this section:**");
    for (const s of sources) lines.push(`- ${authorLabel(s.authors) || "Unknown author"} (${s.year ?? "n.d."}) ${clip(String(s.title), 140)}`);
  }
  return lines.join("\n");
}
