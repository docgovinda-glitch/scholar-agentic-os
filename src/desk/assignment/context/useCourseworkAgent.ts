import { useCallback, useMemo, useRef, useState } from "react";
import { authedJsonFetch } from "../../api";
import type { DraftReview, Extraction, SourceAnalysis, Understanding } from "../../../domain/assignment/assignmentAgent";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";
import { discoverRealScholarlySourcesFromServer } from "../services/realScholarlyDiscoveryService";
import { applyAnalyses, approveRelevant, bindToSections, forAnalysis, mergeDiscovered } from "../services/agentSources";
import type { AssignmentDraftingSection, AssignmentStructure, DiscoveredSource } from "../types";

export type AgentStepId = "extract" | "understand" | "sources" | "review";
export interface AgentStepState {
  status: "idle" | "running" | "done" | "error";
  /** What is happening now, or what went wrong. */
  message?: string;
}

export interface CourseworkAgent {
  steps: Record<AgentStepId, AgentStepState>;
  extraction: (Extraction & { at?: string }) | null;
  understanding: (Understanding & { at?: string }) | null;
  sourceAnalysis: Record<string, SourceAnalysis>;
  review: (DraftReview & { at?: string; words?: number }) | null;
  /** True while a multi-step run is going. */
  running: boolean;
  runExtract: (clarifications?: string) => Promise<boolean>;
  runUnderstand: () => Promise<boolean>;
  runSources: () => Promise<boolean>;
  runReview: () => Promise<boolean>;
  /** Extract, Understand and Sources in order, stopping at the first problem. */
  runThrough: () => Promise<void>;
  /** Stops a multi-step run after the step in progress. */
  stop: () => void;
}

interface Deps {
  projectId: string;
  answers: Record<string, unknown>;
  question: string;
  citationStyle: string;
  sources: DiscoveredSource[];
  approvedSourceIds: string[];
  structure: AssignmentStructure;
  latestSections: () => AssignmentDraftingSection[];
  /** Waits for pending saves, so the server works on the latest answers. */
  flushSaves: () => Promise<void>;
  /** Reloads the project after the server saved a step's result; returns its answers. */
  reload: () => Promise<Record<string, unknown>>;
  saveAnswers: (updates: Record<string, unknown>) => Promise<void>;
}

const IDLE: AgentStepState = { status: "idle" };

async function postStep(projectId: string, step: AgentStepId, body: object): Promise<any> {
  const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/agent/${step}`, "POST", body, { skipLlmFallback: true });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `This step failed (${res.status}).`);
  return data;
}

/**
 * The coursework agent: runs each step on the student's AI through the
 * server, keeps a real status for each, and leaves the student in control
 * (every step can be re-run, and a run stops before drafting).
 */
export function useCourseworkAgent(d: Deps): CourseworkAgent {
  const [steps, setSteps] = useState<Record<AgentStepId, AgentStepState>>({ extract: IDLE, understand: IDLE, sources: IDLE, review: IDLE });
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const depsRef = useRef(d);
  depsRef.current = d;

  const extraction = useMemo(() => safeParseAnswerField<CourseworkAgent["extraction"]>(d.answers["assignment_extraction"], null), [d.answers]);
  const understanding = useMemo(() => safeParseAnswerField<CourseworkAgent["understanding"]>(d.answers["assignment_understanding"], null), [d.answers]);
  const sourceAnalysis = useMemo(() => safeParseAnswerField<Record<string, SourceAnalysis>>(d.answers["assignment_source_analysis"], {}) ?? {}, [d.answers]);
  const review = useMemo(() => safeParseAnswerField<CourseworkAgent["review"]>(d.answers["assignment_ai_review"], null), [d.answers]);

  const set = (id: AgentStepId, s: AgentStepState) => setSteps((prev) => ({ ...prev, [id]: s }));

  const guard = useCallback(async (id: AgentStepId, working: string, fn: () => Promise<string>): Promise<boolean> => {
    set(id, { status: "running", message: working });
    try {
      await depsRef.current.flushSaves();
      const done = await fn();
      await depsRef.current.reload();
      set(id, { status: "done", message: done });
      return true;
    } catch (e) {
      set(id, { status: "error", message: e instanceof Error ? e.message : "This step failed." });
      return false;
    }
  }, []);

  const runExtract = useCallback(
    (clarifications?: string) =>
      guard("extract", "Reading your brief and materials…", async () => {
        const data = await postStep(depsRef.current.projectId, "extract", clarifications ? { clarifications } : {});
        const e = data.extraction as Extraction;
        return `Found ${e.requirements.length} requirement${e.requirements.length === 1 ? "" : "s"}${e.questions.length ? `, ${e.questions.length} question${e.questions.length === 1 ? "" : "s"}` : ""}${e.missing.length ? ` and ${e.missing.length} thing${e.missing.length === 1 ? "" : "s"} to settle` : ""}.`;
      }),
    [guard]
  );

  const runUnderstand = useCallback(
    () =>
      guard("understand", "Working out what to produce and planning the outline…", async () => {
        const data = await postStep(depsRef.current.projectId, "understand", {});
        if (data.outlineError) return `Plan ready; the outline could not be written (${data.outlineError}). Try again from Drafting.`;
        const n = (data.structure?.headings ?? []).length;
        return `Plan ready, with an outline of ${n} section${n === 1 ? "" : "s"}.`;
      }),
    [guard]
  );

  const runSources = useCallback(
    () =>
      guard("sources", "Searching scholarly databases…", async () => {
        const dd = depsRef.current;
        // Read from the server, not from screen state: when steps run back to
        // back, the screen may not show the outline Understand just wrote.
        const a0 = await dd.reload();
        const u = safeParseAnswerField<Understanding | null>(a0["assignment_understanding"], null);
        const existing = safeParseAnswerField<DiscoveredSource[]>(a0["assignment_sources"], []) ?? [];
        const approved = safeParseAnswerField<string[]>(a0["approved_source_ids"] ?? a0["approvedSourceIds"], []) ?? [];
        const queries = u?.searchQueries?.length ? u.searchQueries.slice(0, 3) : [dd.question];
        let found: DiscoveredSource[] = [];
        for (const q of queries) {
          set("sources", { status: "running", message: `Searching: “${q}”…` });
          found = found.concat(await discoverRealScholarlySourcesFromServer(q, dd.citationStyle, 15).catch(() => []));
        }
        const merged = mergeDiscovered(Array.isArray(existing) ? existing : [], found, 20);
        if (merged.length === 0) throw new Error("The search found no sources. Try again later, or add your own sources.");
        set("sources", { status: "running", message: `Reading ${Math.min(20, merged.length)} abstracts with your AI…` });
        const data = await postStep(dd.projectId, "sources", { sources: forAnalysis(merged) });
        const analyses = data.analyses as SourceAnalysis[];
        // The server saved the analysis; reload, then save the sources and links on top.
        const a1 = await dd.reload();
        const structure = safeParseAnswerField<AssignmentStructure | null>(a1["assignment_structure"] ?? a1["structure"], null) ?? dd.structure;
        const sections = safeParseAnswerField<AssignmentDraftingSection[]>(a1["assignment_internal_sections"], []) ?? [];
        const titles: Record<string, string> = {};
        for (const h of structure.headings ?? []) for (const s of h.subheadings ?? []) titles[s.id] = `${s.numberStr} ${s.title}`;
        const bound = bindToSections(structure, Array.isArray(sections) ? sections : [], analyses);
        await dd.saveAnswers({
          assignment_sources: applyAnalyses(merged, analyses, titles),
          approved_source_ids: approveRelevant(Array.isArray(approved) ? approved : [], analyses),
          approvedSourceIds: approveRelevant(Array.isArray(approved) ? approved : [], analyses),
          assignment_structure: bound.structure,
          structure: bound.structure,
          ...(bound.sections.length ? { assignment_internal_sections: bound.sections, assignment_outline: bound.sections } : {}),
        });
        const useful = analyses.filter((a) => a.relevance !== "low").length;
        return `Read ${analyses.length} sources; ${useful} look useful and are approved and linked to your outline. Check them before drafting.`;
      }),
    [guard]
  );

  const runReview = useCallback(
    () =>
      guard("review", "Reviewing your draft against the brief…", async () => {
        const data = await postStep(depsRef.current.projectId, "review", {});
        const r = data.review as DraftReview;
        const open = r.requirements.filter((x) => x.status !== "met").length;
        return `Review ready: ${open} requirement${open === 1 ? "" : "s"} to work on, ${r.unsupportedClaims.length} claim${r.unsupportedClaims.length === 1 ? "" : "s"} without a source.`;
      }),
    [guard]
  );

  const runThrough = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    try {
      for (const step of [runExtract, runUnderstand, runSources]) {
        if (stopRef.current) break;
        const ok = await step();
        if (!ok) break;
      }
    } finally {
      setRunning(false);
    }
  }, [runExtract, runUnderstand, runSources]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { steps, extraction, understanding, sourceAnalysis, review, running, runExtract, runUnderstand, runSources, runReview, runThrough, stop };
}
