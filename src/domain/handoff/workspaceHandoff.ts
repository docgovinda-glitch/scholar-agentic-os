/**
 * Ask Scholar -> workspace hand-off.
 *
 * One pure builder turns a conversation (question, answer, every turn, attached documents, retrieved
 * sources, citation style) into the intake a workspace opens with, so the user never repeats a question
 * or re-uploads a document. Each workspace reads its own intake keys; this module is the only place
 * that maps a conversation onto them.
 */

export type WorkspaceFormatId = "OT-01" | "OT-10" | "OT-15" | "OT-07" | "OT-22";

export interface HandoffMessage {
  sender: "user" | "assistant";
  text: string;
}

export interface HandoffFile {
  name: string;
  type?: string;
  text: string;
}

export interface HandoffSourceInput {
  id?: string;
  sourceId?: string;
  title?: string;
  authors?: string[];
  author?: string;
  year?: number | string;
  venue?: string;
  journal?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  snippet?: string;
  evidenceSnippet?: string;
}

export interface HandoffSource {
  id: string;
  title: string;
  authors: string[];
  year?: number | string;
  venue: string;
  doi?: string;
  url?: string;
  snippet: string;
}

export interface HandoffInput {
  targetFormatId: WorkspaceFormatId;
  /** The conversation up to and including the answer being converted. */
  messages: HandoffMessage[];
  /** The answer the user is acting on. */
  answerText: string;
  /** The question that produced the answer (defaults to the last user message). */
  question?: string;
  files?: HandoffFile[];
  sources?: HandoffSourceInput[];
  citationStyle: string;
  suggestedTitle?: string;
  wordCountTarget?: number;
}

export interface WorkspaceHandoff {
  title: string;
  question: string;
  intake: Record<string, unknown>;
  sources: HandoffSource[];
}

const MAX_TURNS = 20;
const MAX_TURN_CHARS = 4000;
const MAX_FILES = 5;
const MAX_FILE_CHARS = 40_000;

export function normalizeHandoffSources(input: HandoffSourceInput[] | undefined): HandoffSource[] {
  return (input ?? [])
    .filter((c) => c && (c.title || c.doi || c.url))
    .map((c, i) => ({
      id: c.id || c.sourceId || `ask-src-${i + 1}`,
      title: c.title || c.url || `Source ${i + 1}`,
      authors: Array.isArray(c.authors) ? c.authors.filter(Boolean) : c.author ? [String(c.author)] : [],
      year: c.year,
      venue: c.venue || c.journal || c.publisher || "",
      doi: c.doi,
      url: c.url,
      snippet: c.snippet || c.evidenceSnippet || "",
    }));
}

function shortTitle(text: string): string {
  const clean = text.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

function sourceNotes(sources: HandoffSource[]): string {
  return sources
    .map(
      (c, i) =>
        `[${i + 1}] ${c.title}${c.venue ? ` (${c.venue})` : ""}\nAuthors: ${c.authors.join(", ") || "not stated"}\nDOI: ${c.doi || "N/A"}\nURL: ${c.url || "N/A"}`
    )
    .join("\n\n");
}

export function buildWorkspaceHandoff(input: HandoffInput): WorkspaceHandoff {
  const turns = input.messages.filter((m) => m.text && m.text.trim()).slice(-MAX_TURNS);
  const lastUser = [...turns].reverse().find((m) => m.sender === "user")?.text;
  const question = (input.question || lastUser || input.answerText.split("\n")[0] || "").replace(/^#+\s*/, "").trim();
  const title = input.suggestedTitle || shortTitle(question || "Research project");
  const files = (input.files ?? [])
    .filter((f) => f.name && f.text && f.text.trim())
    .slice(-MAX_FILES)
    .map((f) => ({ name: f.name, type: f.type ?? "", text: f.text.slice(0, MAX_FILE_CHARS) }));
  const sources = normalizeHandoffSources(input.sources);

  const conversation = turns.map((m) => ({ role: m.sender, text: m.text.slice(0, MAX_TURN_CHARS) }));
  const documentText = files.map((f) => `--- ${f.name} ---\n${f.text}`).join("\n\n");

  const common: Record<string, unknown> = {
    title,
    working_title: title,
    citation_style: input.citationStyle,
    targetWordCount: input.wordCountTarget,
    backgroundNotes: `Ask Scholar synthesis (carried over from the conversation):\n\n${input.answerText}`,
    preliminaryEvidence: sourceNotes(sources),
    discovered_sources: JSON.stringify(sources),
    ask_conversation: conversation,
    ask_documents: files,
  };

  let specific: Record<string, unknown>;
  switch (input.targetFormatId) {
    case "OT-01": {
      // A coursework brief is what the student pasted or uploaded; with no document, the question itself.
      const brief = documentText ? `${question}\n\n${documentText}` : question;
      specific = {
        assignment_question: question,
        assignment_brief: brief,
        assignment_brief_text: brief,
        ...(files[0] ? { assignment_brief_file: files[0].name } : {}),
        research_topic: question,
      };
      break;
    }
    case "OT-22":
      specific = { topic: question, researchQuestions: question };
      break;
    case "OT-10":
    case "OT-15":
    case "OT-07":
    default:
      specific = {
        researchQuestion: question,
        research_question: question,
        research_topic: question,
        questions: question,
      };
  }

  const intake = Object.fromEntries(
    Object.entries({ ...common, ...specific }).filter(([, v]) => v !== undefined && v !== "")
  );
  return { title, question, intake, sources };
}
