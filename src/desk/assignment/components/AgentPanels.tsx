import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play, RotateCcw, Sparkles, Square } from "lucide-react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import type { AgentStepState } from "../context/useCourseworkAgent";

/**
 * The coursework agent's work, stage by stage: each card runs one step on the
 * student's AI, shows what it is doing and what it found, and can be re-run.
 * Nothing here is simulated: status text comes from the step itself, and
 * results are what the server checked and saved.
 */

function StatusLine({ state }: { state: AgentStepState }) {
  if (state.status === "idle") return null;
  const icon =
    state.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : state.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`flex items-start gap-1.5 text-xs ${state.status === "error" ? "text-red-700 dark:text-red-400" : "text-neutral-600 dark:text-neutral-300"}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{state.message}</span>
    </p>
  );
}

export function AgentStepCard({
  title,
  what,
  state,
  hasResult,
  onRun,
  runLabel,
  disabledReason,
  children,
  testId,
}: {
  title: string;
  what: string;
  state: AgentStepState;
  hasResult: boolean;
  onRun: () => void;
  runLabel: string;
  disabledReason?: string;
  children?: ReactNode;
  testId: string;
}) {
  const busy = state.status === "running";
  return (
    <section aria-label={title} data-testid={testId} className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-750 p-4 sm:p-5 space-y-3 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" aria-hidden="true" />
            {title}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{what}</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy || Boolean(disabledReason)}
          title={disabledReason}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : hasResult ? <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
          {busy ? "Working…" : state.status === "error" ? "Try again" : hasResult ? "Run again" : runLabel}
        </button>
      </div>
      {disabledReason && !busy && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{disabledReason}</p>}
      <StatusLine state={state} />
      {children}
    </section>
  );
}

const Quote = ({ q }: { q?: string }) => (q ? <span className="block text-[11px] italic text-neutral-500 dark:text-neutral-400 mt-0.5">“{q}”</span> : null);
const H = ({ children }: { children: ReactNode }) => <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mt-2">{children}</h3>;

/** Extract: the whole run, plus what the brief asks for and what is missing. */
export function ExtractAgentPanel({ brief, saveBrief }: { brief?: string; saveBrief?: () => Promise<void> } = {}) {
  const { agent, question } = useAssignmentWorkspace();
  const e = agent.extraction;
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // The brief as typed on this screen counts, even before it is saved.
  const hasBrief = (brief ?? question ?? "").trim().length >= 10;
  const withBrief = async (fn: () => Promise<unknown>) => {
    if (saveBrief) await saveBrief();
    await fn();
  };
  const allSteps = (["extract", "understand", "sources"] as const).map((id) => [id, agent.steps[id]] as const);

  return (
    <div className="space-y-3" data-testid="agent-extract">
      <section aria-label="Work through the assignment" className="rounded-2xl border border-amber-200/80 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-4 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs text-neutral-800 dark:text-neutral-200">
            <span className="font-semibold">Let Scholar work through it:</span> read the brief, plan the piece and its outline, then find and read sources. It stops before drafting so you can check its work.
          </p>
          {agent.running ? (
            <button type="button" onClick={agent.stop} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 dark:border-white/20 px-3 py-1.5 text-xs font-semibold cursor-pointer">
              <Square className="w-3 h-3" aria-hidden="true" /> Stop after this step
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void withBrief(agent.runThrough)}
              disabled={!hasBrief}
              title={hasBrief ? undefined : "Add your brief first"}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" /> Run Extract → Understand → Sources
            </button>
          )}
        </div>
        {allSteps.some(([, s]) => s.status !== "idle") && (
          <ol className="space-y-1">
            {allSteps.map(([id, s]) => (
              <li key={id} className="flex items-center gap-2 text-[11px]">
                {s.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : s.status === "done" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" aria-hidden="true" /> : s.status === "error" ? <AlertTriangle className="w-3 h-3 text-red-500" aria-hidden="true" /> : <CircleDashed className="w-3 h-3 text-neutral-400" aria-hidden="true" />}
                <span className="font-semibold capitalize w-20">{id}</span>
                <span className="text-neutral-600 dark:text-neutral-400">{s.message ?? "Waiting"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AgentStepCard
        testId="agent-step-extract"
        title="Extract: what the brief asks for"
        what="Your AI reads the brief and any materials you added. Every requirement it lists is quoted from them."
        state={agent.steps.extract}
        hasResult={Boolean(e)}
        onRun={() => void withBrief(() => agent.runExtract())}
        runLabel="Read the brief"
        disabledReason={hasBrief ? undefined : "Add your brief first."}
      >
        {e && (
          <div className="text-xs text-neutral-800 dark:text-neutral-200 space-y-1">
            {e.task && <p><span className="font-semibold">Task:</span> {e.task}</p>}
            {e.questions.length > 0 && (
              <>
                <H>Questions</H>
                <ul className="list-disc pl-4 space-y-1">{e.questions.map((q, i) => <li key={i}>{q.text}<Quote q={q.quote} /></li>)}</ul>
              </>
            )}
            {e.requirements.length > 0 && (
              <>
                <H>Requirements ({e.requirements.length})</H>
                <ul className="list-disc pl-4 space-y-1">{e.requirements.map((r, i) => <li key={i}><span className="text-[10px] uppercase text-neutral-500 mr-1">{r.kind}</span>{r.text}<Quote q={r.quote} /></li>)}</ul>
              </>
            )}
            {e.criteria.length > 0 && (
              <>
                <H>Marking criteria</H>
                <ul className="list-disc pl-4">{e.criteria.map((c, i) => <li key={i}>{c.criterion}{c.weight ? ` (${c.weight}%)` : ""}</li>)}</ul>
              </>
            )}
            {(e.constraints.wordCount || e.constraints.citationStyle || e.constraints.deadline || e.constraints.format) && (
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                {[e.constraints.wordCount && `${e.constraints.wordCount.toLocaleString()} words`, e.constraints.citationStyle, e.constraints.format, e.constraints.deadline && `due ${e.constraints.deadline}`].filter(Boolean).join(" · ")}
              </p>
            )}
            {e.materials.length > 0 && (
              <>
                <H>Your materials</H>
                <ul className="list-disc pl-4">{e.materials.map((m, i) => <li key={i}><span className="font-medium">{m.name}:</span> {m.summary}</li>)}</ul>
              </>
            )}
            {e.missing.length > 0 && (
              <div className="mt-2 rounded-xl border border-amber-200 dark:border-amber-500/30 p-3 space-y-2" data-testid="agent-missing">
                <p className="text-xs font-semibold">To settle before writing</p>
                {e.missing.map((m, i) => (
                  <label key={i} className="block text-xs space-y-1">
                    <span>{m.question} <span className="text-neutral-500">{m.why}</span></span>
                    <input
                      value={answers[i] ?? ""}
                      onChange={(ev) => setAnswers((p) => ({ ...p, [i]: ev.target.value }))}
                      placeholder="Your answer (optional)"
                      className="w-full rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent px-2 py-1"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  disabled={!Object.values(answers).some((v) => v.trim()) || agent.steps.extract.status === "running"}
                  onClick={() =>
                    void agent.runExtract(
                      e.missing
                        .map((m, i) => (answers[i]?.trim() ? `${m.question} ${answers[i].trim()}` : ""))
                        .filter(Boolean)
                        .join("\n")
                    )
                  }
                  className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Read again with my answers
                </button>
              </div>
            )}
          </div>
        )}
      </AgentStepCard>
    </div>
  );
}

/** Understand: what to produce, how, and what research is needed. */
export function UnderstandAgentPanel() {
  const { agent } = useAssignmentWorkspace();
  const u = agent.understanding;
  return (
    <AgentStepCard
      testId="agent-step-understand"
      title="Understand: what to produce and how"
      what="Your AI works out the subject, the approach, how to meet each criterion and what to research, then writes the outline from that plan."
      state={agent.steps.understand}
      hasResult={Boolean(u)}
      onRun={() => void agent.runUnderstand()}
      runLabel="Plan the assignment"
      disabledReason={agent.extraction ? undefined : "Run Extract first, so the plan is based on what the brief asks for."}
    >
      {u && (
        <div className="text-xs text-neutral-800 dark:text-neutral-200 space-y-1">
          <p><span className="font-semibold">To produce:</span> {u.produce}</p>
          {u.discipline && <p><span className="font-semibold">Subject:</span> {u.discipline}{u.assignmentType ? ` · ${u.assignmentType}` : ""}</p>}
          {u.approach && <p><span className="font-semibold">Approach:</span> {u.approach}</p>}
          {u.structure && <p><span className="font-semibold">Shape:</span> {u.structure}</p>}
          {u.thesisDirection && <p><span className="font-semibold">Line of argument to test:</span> {u.thesisDirection}</p>}
          {u.criteria.length > 0 && (
            <>
              <H>Meeting the criteria</H>
              <ul className="list-disc pl-4">{u.criteria.map((c, i) => <li key={i}><span className="font-medium">{c.criterion}:</span> {c.howToMeet}</li>)}</ul>
            </>
          )}
          {u.knowledgeGaps.length > 0 && (
            <>
              <H>What to find evidence for</H>
              <ul className="list-disc pl-4">{u.knowledgeGaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </>
          )}
          {u.searchQueries.length > 0 && <p className="text-[11px] text-neutral-600 dark:text-neutral-400">Searches: {u.searchQueries.map((q) => `“${q}”`).join(", ")}</p>}
          {u.blockers.length > 0 && (
            <div role="note" className="rounded-lg border border-amber-200 dark:border-amber-500/30 p-2">
              <p className="font-semibold">Settle first</p>
              <ul className="list-disc pl-4">{u.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </AgentStepCard>
  );
}

/** Sources: real search, AI reading of abstracts, links to the outline. */
export function SourcesAgentPanel() {
  const { agent, sources } = useAssignmentWorkspace();
  const analysed = sources.filter((s) => s.aiRelevance);
  const counts = { high: analysed.filter((s) => s.aiRelevance === "high").length, medium: analysed.filter((s) => s.aiRelevance === "medium").length, low: analysed.filter((s) => s.aiRelevance === "low").length };
  return (
    <AgentStepCard
      testId="agent-step-sources"
      title="Sources: find, read and link"
      what="Searches OpenAlex, Crossref and other scholarly indexes with the plan's queries, then your AI reads each abstract: relevance, credibility, evidence quoted word for word, and the outline sections it supports. Only the abstract is read, not the full text."
      state={agent.steps.sources}
      hasResult={analysed.length > 0}
      onRun={() => void agent.runSources()}
      runLabel="Find and read sources"
    >
      {analysed.length > 0 && (
        <div className="text-xs space-y-2">
          <p className="text-neutral-700 dark:text-neutral-300">
            {counts.high} highly relevant, {counts.medium} useful, {counts.low} less relevant. Useful ones are approved and linked to your outline; change that on each card below.
          </p>
          <ul className="space-y-2">
            {analysed
              .filter((s) => s.aiRelevance !== "low")
              .slice(0, 8)
              .map((s) => (
                <li key={s.id} className="rounded-lg border border-neutral-200/80 dark:border-white/10 p-2">
                  <p className="font-medium text-neutral-900 dark:text-white">{s.title} <span className="text-neutral-500 font-normal">({s.year || "n.d."})</span></p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400">{s.aiRelevance} relevance · {s.aiCredibility}</p>
                  {s.mainFinding && <p className="mt-0.5">{s.mainFinding}</p>}
                  {(s.extractedEvidences ?? []).slice(0, 2).map((ev) => <Quote key={ev.id} q={ev.excerpt} />)}
                  {s.suggestedUse && <p className="text-[11px] text-neutral-500 mt-0.5">{s.suggestedUse}</p>}
                </li>
              ))}
          </ul>
        </div>
      )}
    </AgentStepCard>
  );
}

/** Submission: the AI review of the draft against the brief. */
export function ReviewAgentPanel() {
  const { agent, currentWordCount } = useAssignmentWorkspace();
  const r = agent.review;
  const stale = r && typeof r.words === "number" && Math.abs((r.words ?? 0) - currentWordCount) > 40;
  return (
    <AgentStepCard
      testId="agent-step-review"
      title="Review: is it ready to submit?"
      what="Your AI checks the draft against every requirement from the brief, flags claims without a source, and comments on argument, structure and language, quoting your draft each time."
      state={agent.steps.review}
      hasResult={Boolean(r)}
      onRun={() => void agent.runReview()}
      runLabel="Review my draft"
      disabledReason={currentWordCount < 30 ? "Write at least part of your draft first." : undefined}
    >
      {r && (
        <div className="text-xs text-neutral-800 dark:text-neutral-200 space-y-1">
          {stale && <p className="text-amber-700 dark:text-amber-400">The draft has changed since this review. Run it again for an up-to-date check.</p>}
          {r.summary && <p>{r.summary}</p>}
          {r.requirements.length > 0 && (
            <>
              <H>Requirements</H>
              <ul className="space-y-1">
                {r.requirements.map((q) => (
                  <li key={q.index}>
                    <span className={`inline-block w-16 font-semibold ${q.status === "met" ? "text-emerald-600 dark:text-emerald-400" : q.status === "partly" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{q.status === "met" ? "Met" : q.status === "partly" ? "Partly" : "Missing"}</span>
                    {q.requirement}
                    <Quote q={q.quote} />
                    {q.fix && q.status !== "met" && <span className="block text-[11px] text-neutral-600 dark:text-neutral-400">Fix: {q.fix}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.unsupportedClaims.length > 0 && (
            <>
              <H>Claims without a source</H>
              <ul className="list-disc pl-4">{r.unsupportedClaims.map((c, i) => <li key={i}>“{c.quote}” <span className="text-neutral-500">{c.why}</span></li>)}</ul>
            </>
          )}
          {[["Argument", r.argument], ["Structure", r.structure]].map(([label, items]) =>
            (items as Array<{ comment: string; quote?: string }>).length ? (
              <div key={label as string}>
                <H>{label as string}</H>
                <ul className="list-disc pl-4">{(items as Array<{ comment: string; quote?: string }>).map((a, i) => <li key={i}>{a.comment}<Quote q={a.quote} /></li>)}</ul>
              </div>
            ) : null
          )}
          {r.language.length > 0 && (
            <>
              <H>Language</H>
              <ul className="list-disc pl-4">{r.language.map((l, i) => <li key={i}>“{l.quote}” → {l.suggestion}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </AgentStepCard>
  );
}
