import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, Compass, Lock, PenLine } from "lucide-react";
import type { WordBudgetBlueprint, SectionBudget, SubSectionBudget, ManuscriptTemplate } from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import { saveIntakeAnswers, allocateProjectWordBudget } from "../api";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";
import { safeParseAnswerField } from "../../shared/projectStateSchema";
import JournalProfileCard, { SPELLING_OPTIONS, type SuggestedJournal } from "../journal/JournalProfileCard";
import { blueprintFromStructure } from "../journal/journalProfile";
import GapFinder, { type SavedGaps } from "../journal/blueprint/GapFinder";
import QuestionsAndTitle from "../journal/blueprint/QuestionsAndTitle";
import JournalMatcher, { type SavedJournals } from "../journal/blueprint/JournalMatcher";
import { suggestQuestions } from "../journal/blueprintApi";
import { ARTICLE_TYPES, missingForLock, templateForArticleType, type GroundedGap } from "../../domain/journal/blueprintFunnel";

type Path = "explore" | "own";

const card = "bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-5";
const field =
  "w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] outline-none";

/** Older projects saved title options as objects; newer ones as plain strings. */
function parseTitleOptions(raw: unknown): string[] {
  const xs = safeParseAnswerField<unknown[]>(raw, []);
  return Array.isArray(xs)
    ? xs
        .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && "title_text" in x ? String((x as { title_text: string }).title_text) : ""))
        .filter(Boolean)
    : [];
}

function StepHeading({ n, title, done, hint }: { n: number; title: string; done: boolean; hint: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[color:var(--border-subtle)] pb-4">
      {done ? (
        <CheckCircle2 className="w-5 h-5 shrink-0 text-[color:var(--state-success)]" aria-label="Done" />
      ) : (
        <span className="w-5 h-5 shrink-0 rounded-full border border-[color:var(--border-control)] text-[10px] font-bold flex items-center justify-center text-[color:var(--text-secondary)]">{n}</span>
      )}
      <div>
        <h2 className="text-sm font-bold text-[color:var(--text-primary)]">
          Step {n}. {title}
        </h2>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Mode 1: an adaptive funnel. An explorer starts from a broad interest and is
 * led to a gap grounded in recent papers, questions, a title and a journal;
 * an author who knows their topic or journal enters them directly. Locking
 * the blueprint opens Mode 2.
 */
export default function ProtocolBlueprintMode() {
  const { project, setProject, setMode } = useResearchWorkspace();
  const answers = useMemo(() => project?.answers || {}, [project?.answers]);
  const pid = project?.projectId;

  // ── Step 1 state ──
  const [path, setPath] = useState<Path>(() =>
    answers["blueprint_path"] === "own" ||
    (!answers["blueprint_path"] && (answers["working_title"] || (answers["target_journal"] && !/^provisional$/i.test(answers["target_journal"]))))
      ? "own"
      : "explore"
  );
  const [interest, setInterest] = useState<string>(() => answers["interest_area"] || "");
  const [gapSearch, setGapSearch] = useState<SavedGaps | null>(() => safeParseAnswerField<SavedGaps | null>(answers["gap_search"], null));
  const [selectedGapId, setSelectedGapId] = useState<string>(() => answers["selected_gap"] || "");
  const [problem, setProblem] = useState<string>(() => answers["core_problem"] || answers["thesis_statement"] || "");
  const [questions, setQuestions] = useState<string[]>(() => {
    const saved = safeParseAnswerField<string[]>(answers["research_questions"], []);
    return Array.isArray(saved) && saved.length ? saved : answers["primary_research_question"] ? [answers["primary_research_question"]] : [];
  });
  const [title, setTitle] = useState<string>(() => answers["working_title"] || answers["title"] || "");
  const [titleOptions, setTitleOptions] = useState<string[]>(() => parseTitleOptions(answers["title_options"]));
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(() => safeParseAnswerField<string[]>(answers["suggested_questions"], []));

  // ── Step 2 state ──
  const [journalSearch, setJournalSearch] = useState<SavedJournals | null>(() => safeParseAnswerField<SavedJournals | null>(answers["journal_search"], null));
  const [suggested, setSuggested] = useState<SuggestedJournal | null>(null);
  const [articleType, setArticleType] = useState<string>(() => answers["article_type_id"] || "");
  const [targetTotalWords, setTargetTotalWords] = useState<number>(() => {
    const parsed = parseInt(answers["target_word_count"] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 6000;
  });
  const [template, setTemplate] = useState<ManuscriptTemplate>(() => {
    const raw = answers["manuscript_template"];
    return raw === "Theoretical" || raw === "SystematicReview" ? raw : "IMRaD";
  });
  const [citationStyle, setCitationStyle] = useState<string>(() => answers["citation_style"] || "APA 7");
  const [orthography, setOrthography] = useState<string>(() => answers["orthography"] || SPELLING_OPTIONS[0]);

  // ── Step 3 state ──
  const [blueprint, setBlueprint] = useState<WordBudgetBlueprint | null>(() => {
    const parsed = safeParseAnswerField<WordBudgetBlueprint | null>(answers["word_budget_blueprint"], null);
    return parsed && Array.isArray(parsed.sections) ? parsed : null;
  });
  const [isAllocatingBudget, setIsAllocatingBudget] = useState(false);
  const [locked, setLocked] = useState<boolean>(() => answers["blueprint_locked"] === "true");
  const [lockError, setLockError] = useState<string | null>(null);

  // New projects carry the placeholder "provisional" until a journal is chosen.
  const savedJournal = (answers["target_journal"] || "").trim();
  const journal = /^provisional$/i.test(savedJournal) ? "" : savedJournal;
  const selectedGap = gapSearch?.gaps.find((g) => g.id === selectedGapId) ?? null;

  // Saves only the fields this mode owns; the server merges them.
  const save = useCallback(
    async (patch: Record<string, string>) => {
      if (!pid) return;
      try {
        setProject(await saveIntakeAnswers(pid, patch));
      } catch (err) {
        console.warn("Blueprint could not be saved:", err);
      }
    },
    [pid, setProject]
  );

  // Typed fields save shortly after the author stops typing. Changing them
  // after the lock reopens the blueprint.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const qs = questions.map((q) => q.trim()).filter(Boolean);
      const patch: Record<string, string> = {
        blueprint_path: path,
        interest_area: normalizeUnicodeNFC(interest.trim()),
        core_problem: normalizeUnicodeNFC(problem.trim()),
        research_questions: JSON.stringify(qs),
        primary_research_question: qs[0] ?? "",
        working_title: normalizeUnicodeNFC(title.trim()),
        title: normalizeUnicodeNFC(title.trim()),
      };
      if (locked) {
        patch.blueprint_locked = "false";
        setLocked(false);
      }
      void save(patch);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save on content changes only
  }, [path, interest, problem, questions, title]);

  const handleAllocateBudget = useCallback(
    async (words: number, tpl: ManuscriptTemplate) => {
      if (!pid) return;
      setIsAllocatingBudget(true);
      try {
        const res = await allocateProjectWordBudget(pid, words, tpl);
        if (res.ok && res.blueprint) setBlueprint(res.blueprint);
      } catch (err) {
        console.warn("Failed to allocate budget:", err);
      } finally {
        setIsAllocatingBudget(false);
      }
    },
    [pid]
  );

  // A budget exists from the start, so the author always sees the shape of the article.
  useEffect(() => {
    if (!blueprint && pid && !isAllocatingBudget) void handleAllocateBudget(targetTotalWords, template);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project
  }, [pid]);

  const chooseGap = (gap: GroundedGap) => {
    setSelectedGapId(gap.id);
    setProblem(gap.statement);
    void save({ selected_gap: gap.id });
  };

  const runSuggest = async () => {
    const statement = selectedGap?.statement ?? problem.trim();
    if (!pid || statement.length < 5) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const r = await suggestQuestions(pid, interest.trim() || title.trim() || statement, { statement, whyItMatters: selectedGap?.whyItMatters });
      // The author's own questions and title are never replaced: suggestions
      // fill an empty list, otherwise they are offered to add.
      const own = questions.map((q) => q.trim()).filter(Boolean);
      if (own.length) setSuggestedQuestions(r.questions);
      else setQuestions(r.questions);
      setTitleOptions(r.titles);
      if (!title.trim() && r.titles[0]) setTitle(r.titles[0]);
      void save({ title_options: JSON.stringify(r.titles), suggested_questions: JSON.stringify(own.length ? r.questions : []) });
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : "Suggestions failed.");
    } finally {
      setSuggesting(false);
    }
  };

  const selectJournal = (j: SavedJournals["journals"][number]) => {
    setSuggested({ journalName: j.name, publisher: j.publisher, homepage: j.homepage });
    void save({ target_journal: j.name, selected_journal_name: j.name, ...(j.publisher ? { publisher: j.publisher } : {}) });
  };

  const handleSaveFormattingProfile = async (newWords: number, newTemplate: ManuscriptTemplate, newStyle: string, newOrthography: string) => {
    if (!pid) return;
    setTargetTotalWords(newWords);
    setTemplate(newTemplate);
    setCitationStyle(newStyle);
    setOrthography(newOrthography);
    const patch: Record<string, string> = {
      target_word_count: String(newWords),
      manuscript_template: newTemplate,
      citation_style: newStyle,
      orthography: newOrthography,
    };
    // An outline taken from the journal keeps its sections; a new word target only resizes them.
    const journalSections = blueprint?.sections.length && blueprint.sections.every((s) => s.id.startsWith("jp-")) ? blueprint.sections.map((s) => s.sectionName) : null;
    if (journalSections) {
      const resized = blueprintFromStructure(pid, journalSections, newWords);
      patch.word_budget_blueprint = JSON.stringify(resized);
      setBlueprint(resized);
      await save(patch);
      return;
    }
    await save(patch);
    await handleAllocateBudget(newWords, newTemplate);
  };

  const handleUpdateSubSectionTarget = async (sectionId: string, subSectionId: string, newTarget: number) => {
    if (!blueprint || !pid) return;
    const clamped = Math.max(100, Math.min(1500, newTarget));
    const sections: SectionBudget[] = blueprint.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      const subs: SubSectionBudget[] = sec.subSections.map((sub) => (sub.id === subSectionId ? { ...sub, targetWords: clamped } : sub));
      return { ...sec, subSections: subs, targetWords: subs.reduce((n, s) => n + s.targetWords, 0) };
    });
    const next: WordBudgetBlueprint = { ...blueprint, sections, allocatedTotalWords: sections.reduce((n, s) => n + s.targetWords, 0), updatedAt: new Date().toISOString() };
    setBlueprint(next);
    await save({ word_budget_blueprint: JSON.stringify(next) });
  };

  const missing = missingForLock({ journal, problem, questions, title, hasBudget: Boolean(blueprint?.sections.length) });
  const step1Done = Boolean(problem.trim() && questions.some((q) => q.trim()) && title.trim());

  const lockAndContinue = async () => {
    if (missing.length) {
      setLockError(`Still needed: ${missing.join(", ")}.`);
      return;
    }
    setLockError(null);
    const qs = questions.map((q) => q.trim()).filter(Boolean);
    await save({
      blueprint_path: path,
      core_problem: normalizeUnicodeNFC(problem.trim()),
      research_questions: JSON.stringify(qs),
      primary_research_question: qs[0],
      working_title: normalizeUnicodeNFC(title.trim()),
      title: normalizeUnicodeNFC(title.trim()),
      title_locked: "true",
      blueprint_locked: "true",
      blueprint_locked_at: new Date().toISOString(),
    });
    setLocked(true);
    setMode("evidence");
  };

  const pathButton = (p: Path, label: string, hint: string, Icon: typeof Compass) => (
    <button
      type="button"
      role="radio"
      aria-checked={path === p}
      onClick={() => setPath(p)}
      className={`flex-1 text-left p-4 rounded-xl border cursor-pointer transition-colors ${
        path === p ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)] bg-[color:var(--surface-raised)]" : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:border-[color:var(--border-control)]"
      }`}
    >
      <span className="flex items-center gap-2 text-xs font-bold text-[color:var(--text-primary)]">
        <Icon className="w-4 h-4" aria-hidden="true" />
        {label}
      </span>
      <span className="block mt-1 text-[11px] text-[color:var(--text-secondary)]">{hint}</span>
    </button>
  );

  const steps = [
    { label: "Topic, gap & questions", done: step1Done },
    { label: "Target journal", done: Boolean(journal) },
    { label: "Lock blueprint", done: locked },
  ];

  return (
    <div className="h-full flex flex-col bg-[color:var(--surface-canvas)] overflow-y-auto">
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent)] text-[color:var(--text-inverse)]">Mode 1</span>
            <h1 className="text-xl font-bold text-[color:var(--text-primary)] mt-1">Blueprint</h1>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">From an interest or your own topic to a locked plan: gap, questions, title, journal and word budget.</p>
          </div>
          <ol className="flex items-center gap-3 flex-wrap" aria-label="Blueprint steps">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--text-secondary)]">
                {s.done ? <CheckCircle2 className="w-4 h-4 text-[color:var(--state-success)]" aria-hidden="true" /> : <Circle className="w-4 h-4" aria-hidden="true" />}
                <span>
                  {i + 1}. {s.label}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto w-full space-y-8">
        <div role="radiogroup" aria-label="Where are you starting from?" className="flex flex-col sm:flex-row gap-3">
          {pathButton("explore", "Explore and discover", "I have a broad interest. Find gaps in recent papers and help me shape questions and a title.", Compass)}
          {pathButton("own", "I have my topic or journal", "I already know my research problem, questions or title, and maybe the journal.", PenLine)}
        </div>

        {/* STEP 1 */}
        <section aria-labelledby="bp-step1" className={card}>
          <div id="bp-step1">
            <StepHeading
              n={1}
              title={path === "explore" ? "Find a gap, then questions and a title" : "Your problem, questions and title"}
              done={step1Done}
              hint={path === "explore" ? "Pick the gap you want to address; questions and title suggestions follow from it. Everything stays editable." : "Enter what you have. Suggestions are optional."}
            />
          </div>

          {path === "explore" && pid && (
            <GapFinder
              projectId={pid}
              interest={interest}
              onInterest={setInterest}
              saved={gapSearch}
              onFound={(g) => {
                setGapSearch(g);
                void save({ gap_search: JSON.stringify(g), interest_area: g.interest });
              }}
              selectedGapId={selectedGapId}
              onSelect={chooseGap}
            />
          )}

          {(path === "own" || selectedGap) && (
            <div className="space-y-1.5">
              <label htmlFor="bp-problem" className="text-xs font-bold text-[color:var(--text-primary)]">
                Research gap or problem
              </label>
              <textarea id="bp-problem" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What is not yet known, and in what setting or population?" className={`${field} resize-y`} />
            </div>
          )}

          {(path === "own" || selectedGap) && (
            <>
              <QuestionsAndTitle
                questions={questions}
                onQuestions={setQuestions}
                title={title}
                onTitle={setTitle}
                titleOptions={titleOptions}
                suggest={problem.trim().length >= 5 ? () => void runSuggest() : undefined}
                suggesting={suggesting}
                suggestError={suggestError}
              />
              {suggestedQuestions.length > 0 && questions.some((q) => q.trim()) && (
                <div className="text-[11px] text-[color:var(--text-secondary)] space-y-1" aria-label="Suggested questions">
                  <p className="font-semibold">Suggested questions (click to add):</p>
                  {suggestedQuestions
                    .filter((s) => !questions.includes(s))
                    .map((s) => (
                      <button key={s} type="button" onClick={() => setQuestions([...questions.filter((q) => q.trim()), s].slice(0, 5))} className="block text-left underline cursor-pointer">
                        + {s}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* STEP 2 */}
        <section aria-labelledby="bp-step2" className={card}>
          <div id="bp-step2">
            <StepHeading
              n={2}
              title="Target journal"
              done={Boolean(journal)}
              hint={journal ? `Writing for ${journal}.` : "Find journals that publish on your topic, or enter the one you have in mind below."}
            />
          </div>

          {pid && (
            <JournalMatcher
              projectId={pid}
              query={[problem, title, interest].map((s) => s.trim()).filter(Boolean).join(". ").slice(0, 600)}
              saved={journalSearch}
              onFound={(r) => {
                setJournalSearch(r);
                void save({ journal_search: JSON.stringify(r) });
              }}
              selectedName={journal}
              onSelect={selectJournal}
            />
          )}

          {project && <JournalProfileCard key={suggested?.journalName ?? "profile"} project={project} onApplied={setProject} suggested={suggested} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="bp-article-type" className="text-xs font-bold text-[color:var(--text-primary)]">
                Article type
              </label>
              <select
                id="bp-article-type"
                value={articleType}
                onChange={(e) => {
                  setArticleType(e.target.value);
                  void save({ article_type_id: e.target.value });
                  void handleSaveFormattingProfile(targetTotalWords, templateForArticleType(e.target.value), citationStyle, orthography);
                }}
                className={`${field} cursor-pointer`}
              >
                <option value="">Choose…</option>
                {ARTICLE_TYPES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span className="block text-[10px] text-[color:var(--text-muted)]">Structure: {template === "SystematicReview" ? "Systematic review" : template}</span>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="target-words-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Word target
              </label>
              <input
                id="target-words-select"
                type="number"
                min={500}
                step={100}
                key={targetTotalWords}
                defaultValue={targetTotalWords}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (Number.isFinite(val) && val >= 500 && val !== targetTotalWords) void handleSaveFormattingProfile(val, template, citationStyle, orthography);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className={`${field} tabular-nums`}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="citation-style-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Citation style
              </label>
              <select id="citation-style-select" value={citationStyle} onChange={(e) => void handleSaveFormattingProfile(targetTotalWords, template, e.target.value, orthography)} className={`${field} cursor-pointer`}>
                {["APA 7", "IEEE", "Harvard", "Chicago Author-Date", "Chicago Notes", "MLA 9", "Vancouver"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="orthography-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Spelling
              </label>
              <select id="orthography-select" value={orthography} onChange={(e) => void handleSaveFormattingProfile(targetTotalWords, template, citationStyle, e.target.value)} className={`${field} cursor-pointer`}>
                {SPELLING_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-[color:var(--text-muted)]">
            These are set from the journal's guidelines when you save them above; change them here if you know better.
            {answers["peer_review_format"] ? ` Review model: ${answers["peer_review_format"]}.` : ""}
          </p>
        </section>

        {/* STEP 3 */}
        <section aria-labelledby="bp-step3" className={card}>
          <div id="bp-step3">
            <StepHeading n={3} title="Word budget and lock" done={locked} hint="Each section is split into writing units of about 350–500 words. Adjust any unit, then lock the blueprint." />
          </div>

          <ul className="grid sm:grid-cols-2 gap-2 text-xs" aria-label="Blueprint checklist">
            {[
              ["Research gap or problem", Boolean(problem.trim())],
              ["At least one research question", questions.some((q) => q.trim())],
              ["Working title", Boolean(title.trim())],
              ["Target journal", Boolean(journal)],
              ["Word budget", Boolean(blueprint?.sections.length)],
            ].map(([label, ok]) => (
              <li key={String(label)} className="flex items-center gap-2 text-[color:var(--text-secondary)]">
                {ok ? <CheckCircle2 className="w-4 h-4 text-[color:var(--state-success)]" aria-hidden="true" /> : <Circle className="w-4 h-4" aria-hidden="true" />}
                <span>
                  {label}
                  <span className="sr-only">{ok ? " — done" : " — missing"}</span>
                </span>
              </li>
            ))}
          </ul>

          {blueprint ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono px-1 text-[color:var(--text-secondary)] flex-wrap gap-2">
                <span>
                  Target: <strong className="text-[color:var(--text-primary)]">{blueprint.targetTotalWords.toLocaleString()} words</strong>
                </span>
                <span>
                  Allocated: <strong className="text-[color:var(--text-primary)]">{blueprint.allocatedTotalWords.toLocaleString()} words</strong>
                  {blueprint.totalSubSections ? ` (${blueprint.totalSubSections} units)` : ""}
                </span>
                <button type="button" disabled={isAllocatingBudget} onClick={() => void handleAllocateBudget(targetTotalWords, template)} className="studio-btn">
                  Rebalance
                </button>
              </div>
              <div className="border border-[color:var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[color:var(--border-subtle)]">
                {blueprint.sections.map((sec) => (
                  <div key={sec.id}>
                    <div className="bg-[color:var(--surface-sunken)] px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-[color:var(--text-primary)]">
                        {sec.order}. {sec.sectionName}
                      </span>
                      <span className="text-xs font-mono font-bold text-[color:var(--accent)]">{sec.targetWords} words</span>
                    </div>
                    {sec.subSections.map((sub, sIdx) => (
                      <div key={sub.id} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-xs text-[color:var(--text-primary)] min-w-0 truncate">
                          <span className="text-[10px] font-mono text-[color:var(--text-muted)] mr-2">
                            § {sec.order}.{sIdx + 1}
                          </span>
                          {sub.title}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <input
                            aria-label={`Target words for ${sub.title}`}
                            type="number"
                            min={100}
                            max={1000}
                            step={25}
                            value={sub.targetWords}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) void handleUpdateSubSectionTarget(sec.id, sub.id, val);
                            }}
                            className="w-20 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-lg px-2 py-1 text-xs font-mono text-right text-[color:var(--text-primary)] outline-none"
                          />
                          <span className="text-[10px] text-[color:var(--text-muted)] font-mono">words</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[color:var(--text-secondary)]">{isAllocatingBudget ? "Working out the word budget…" : "The word budget appears once the project has loaded."}</p>
          )}

          {lockError && (
            <p role="alert" className="text-xs text-[color:var(--state-danger)]">
              {lockError}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => void lockAndContinue()} disabled={missing.length > 0} className="studio-btn studio-btn-primary">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Lock blueprint and continue to Mode 2 (Evidence Matrix)
            </button>
            {missing.length > 0 ? (
              <span className="text-[11px] text-[color:var(--text-muted)]">Still needed: {missing.join(", ")}.</span>
            ) : locked ? (
              <span className="text-[11px] text-[color:var(--state-success)]">Locked. Editing any field above reopens it.</span>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
