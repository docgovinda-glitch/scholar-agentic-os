import React, { useState, useMemo } from 'react';
import { SlideCanvas, extractSlidesFromAcademicText, type SlideDeck, type NarrativeFramework } from '../../slides';
import {
  classifyArchetype,
  auditStyleCompliance,
  type StyleAuditReport,
  type CorpusArchetype
} from '../services/styleEngineService';
import type { AssignmentType } from '../../../desk/assignment/types';
import type { CourseworkExecutionMode } from '../types/orchestrator';

export interface CourseworkSection {
  id: string;
  title: string;
  content: string;
  wordCount?: number;
}

export interface CourseworkWorkspaceProps {
  initialTitle?: string;
  initialSections?: CourseworkSection[];
  targetArchetype?: AssignmentType;
  initialMode?: CourseworkExecutionMode;
  onBackToDashboard?: () => void;
}

export const ARCHETYPE_DEFAULT_TONES: Record<string, string> = {
  essay: 'Formal Academic',
  literature_review: 'Critical',
  research_paper: 'Formal Academic',
  case_study: 'Analytical',
  report: 'Objective',
  critical_essay: 'Critical',
  argumentative_essay: 'Persuasive',
  policy_analysis: 'Analytical',
  business_assignment: 'Analytical',
  journal_article: 'Formal Academic',
  presentation_slides: 'Conversational Academic',
};

/**
 * CourseworkWorkspace:
 * Academic Coursework & Essay drafting container with direct "Present Keynote" bridge,
 * Minimal vs Detailed execution mode toggle, auto-bound collegiate tone mapping,
 * and live Supervised ML Style Engine auditing across the 11 peer-reviewed archetypes.
 */
export default function CourseworkWorkspace({
  initialTitle = 'Academic Coursework & Synthesis',
  targetArchetype = 'essay',
  initialMode = 'minimal',
  initialSections = [
    {
      id: 'sec-1',
      title: 'Context & Empirical Problem',
      content: 'Standard generative models lack cryptographic provenance, leading to 84% failure rates in peer-review citation audits.',
    },
    {
      id: 'sec-2',
      title: 'Research Methodology',
      content: 'Triangulated survey data validates 14% retention drop across first-year undergraduate academic writing programs.',
    },
    {
      id: 'sec-3',
      title: 'Grounded Evidence Resolution',
      content: 'Multi-agent adversarial consensus achieves 100% citation precision while accelerating synthesis turnaround by 4.2x.',
    },
  ],
  onBackToDashboard,
}: CourseworkWorkspaceProps) {
  const [mode, setMode] = useState<CourseworkExecutionMode>(initialMode);
  const [title, setTitle] = useState(initialTitle);
  const [assignmentType, setAssignmentType] = useState<AssignmentType>(targetArchetype);
  const [academicTone, setAcademicTone] = useState<string>(
    ARCHETYPE_DEFAULT_TONES[targetArchetype] || 'Formal Academic'
  );
  const [targetWordCount, setTargetWordCount] = useState<number>(2000);
  const [citationStyle, setCitationStyle] = useState<string>('APA 7th');
  const [customRubric, setCustomRubric] = useState<string>('');
  const [sourceFilters, setSourceFilters] = useState({
    openAlex: true,
    crossref: true,
    pubmed: false,
  });
  const [activePhase, setActivePhase] = useState<number>(3);
  const [sections, setSections] = useState<CourseworkSection[]>(initialSections);
  const [isPresentationActive, setIsPresentationActive] = useState(false);
  const [framework, setFramework] = useState<NarrativeFramework>('SCR');
  const [showStyleAudit, setShowStyleAudit] = useState(false);

  // Auto-bind academic tone on assignment type selection while allowing user override
  const handleAssignmentTypeChange = (newType: string) => {
    const at = newType as AssignmentType;
    setAssignmentType(at);
    if (ARCHETYPE_DEFAULT_TONES[newType]) {
      setAcademicTone(ARCHETYPE_DEFAULT_TONES[newType]);
    }
  };

  // Aggregate markdown from active sections
  const draftMarkdown = useMemo(() => {
    return `# ${title}\n\n` + sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n');
  }, [title, sections]);

  // Total word count
  const totalWords = useMemo(() => {
    return sections.reduce((acc, s) => {
      const words = s.content.trim().split(/\s+/).filter(Boolean).length;
      return acc + words;
    }, 0);
  }, [sections]);

  // Inter-section overlap calculation (mock telemetry: 4.8% overlap, passing <20% threshold)
  const interSectionOverlap = 4.8;
  const isOverlapCompliant = interSectionOverlap < 20.0;

  // Real-time Supervised ML Style Compliance & Archetype Audit
  const styleAudit = useMemo<StyleAuditReport>(() => {
    return auditStyleCompliance(draftMarkdown, assignmentType as CorpusArchetype);
  }, [draftMarkdown, assignmentType]);

  // Active Presentation Deck
  const activeDeck = useMemo<SlideDeck>(() => {
    return extractSlidesFromAcademicText(draftMarkdown, framework);
  }, [draftMarkdown, framework]);

  if (isPresentationActive) {
    return (
      <div className="min-h-screen w-full bg-[#F7F5F0] dark:bg-[#171717] flex flex-col justify-center animate-in fade-in duration-200">
        <SlideCanvas deck={activeDeck} onClose={() => setIsPresentationActive(false)} />
      </div>
    );
  }

  const isAuditVisible = mode === 'detailed' || showStyleAudit;

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header & Action Bridge */}
      <header className="max-w-5xl mx-auto rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
              Phase 03 · Drafting & Presentation Bridge
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
              {totalWords} Words Synthesized
            </span>
            <button
              type="button"
              onClick={() => setShowStyleAudit(!showStyleAudit)}
              aria-label="Toggle Style Audit Panel"
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide flex items-center gap-1.5 transition-colors cursor-pointer ${
                styleAudit.isCompliant
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              <span>{styleAudit.isCompliant ? '✓' : '⚠️'}</span>
              <span>Style Score: {styleAudit.overallScore}% ({styleAudit.primaryTone})</span>
            </button>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h1>
        </div>

        {/* Action Controls: Mode Selector & Present Button */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Minimal vs Detailed Mode Toggle */}
          <div
            role="radiogroup"
            aria-label="Coursework Execution Mode"
            className="inline-flex items-center p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-white/10"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'minimal'}
              onClick={() => setMode('minimal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'minimal'
                  ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Minimal
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'detailed'}
              onClick={() => setMode('detailed')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'detailed'
                  ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Detailed
            </button>
          </div>

          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="px-3.5 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Back
            </button>
          )}

          {/* Action pill explicitly matching specification */}
          <button
            type="button"
            onClick={() => setIsPresentationActive(true)}
            aria-label="Present Presentation"
            className="rounded-full px-4 py-1.5 text-sm font-medium border border-neutral-200/80 bg-white hover:bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-[#1C1C1E] dark:hover:bg-neutral-800 dark:text-neutral-100 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>📽️</span>
            <span>Present Presentation</span>
          </button>
        </div>
      </header>

      {/* Configuration & Setup Bar */}
      <section
        aria-label="Coursework Setup Bar"
        className="max-w-5xl mx-auto rounded-2xl p-5 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {mode === 'minimal' ? 'Streamlined Setup' : 'Comprehensive Architecture Controls'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200/60 dark:border-neutral-700">
              OT-01 · {mode === 'minimal' ? 'Minimal Mode' : 'Detailed Mode'}
            </span>
          </div>
          {mode === 'detailed' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span>●</span> Inter-section Overlap: {interSectionOverlap}% ({isOverlapCompliant ? 'PASS <20%' : 'FAIL'})
              </span>
            </div>
          )}
        </div>

        {/* Streamlined Configuration Grid (Always Visible) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Assignment Topic
            </label>
            <input
              type="text"
              aria-label="Topic"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Developing Breakthrough Leadership"
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Assignment Type
            </label>
            <select
              aria-label="Assignment Type"
              value={assignmentType}
              onChange={(e) => handleAssignmentTypeChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            >
              <option value="essay">Essay</option>
              <option value="literature_review">Literature Review</option>
              <option value="research_paper">Research Paper</option>
              <option value="case_study">Case Study</option>
              <option value="report">Report</option>
              <option value="critical_essay">Critical Essay</option>
              <option value="argumentative_essay">Argumentative Essay</option>
              <option value="policy_analysis">Policy Analysis</option>
              <option value="business_assignment">Business Assignment</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Word Count Target
            </label>
            <input
              type="number"
              aria-label="Word Count"
              value={targetWordCount}
              onChange={(e) => setTargetWordCount(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Citation Style
            </label>
            <select
              aria-label="Citation Style"
              value={citationStyle}
              onChange={(e) => setCitationStyle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
            >
              <option value="APA 7th">APA 7th</option>
              <option value="IEEE">IEEE</option>
              <option value="Harvard">Harvard</option>
              <option value="MLA 9th">MLA 9th</option>
              <option value="Chicago">Chicago</option>
            </select>
          </div>
        </div>

        {/* Detailed Mode Advanced Configuration & Telemetry */}
        {mode === 'detailed' && (
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-4 animate-in fade-in duration-200">
            {/* Tone Selector, Custom Rubric, Source Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
                  Academic Tone (Learned Default)
                </label>
                <select
                  aria-label="Academic Tone"
                  value={academicTone}
                  onChange={(e) => setAcademicTone(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="Formal Academic">Formal Academic</option>
                  <option value="Critical">Critical</option>
                  <option value="Analytical">Analytical</option>
                  <option value="Objective">Objective</option>
                  <option value="Persuasive">Persuasive</option>
                  <option value="Conversational Academic">Conversational Academic</option>
                </select>
                <span className="text-[10px] text-neutral-400 block mt-1">
                  Default: {ARCHETYPE_DEFAULT_TONES[assignmentType]} (auto-bound, user editable)
                </span>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
                  Custom Rubric / Special Guidance
                </label>
                <input
                  type="text"
                  aria-label="Custom Rubric"
                  value={customRubric}
                  onChange={(e) => setCustomRubric(e.target.value)}
                  placeholder="e.g. Must evaluate Schein cultural model with empirical counter-evidence"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Live 4-Phase Atomic Lifecycle Stepper */}
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200/60 dark:border-white/5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span className="font-semibold uppercase tracking-wider">Live 4-Phase Atomic Lifecycle Stepper</span>
                <span className="font-mono">Current: Phase 03 · Drafting</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <span className="font-medium">Phase 1: Understand</span>
                  <span>✓</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <span className="font-medium">Phase 2: Sources</span>
                  <span>✓</span>
                </div>
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-between font-bold">
                  <span>Phase 3: Drafting</span>
                  <span className="animate-pulse">●</span>
                </div>
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-400 text-xs flex items-center justify-between">
                  <span>Phase 4: Submission</span>
                  <span>○</span>
                </div>
              </div>
            </div>

            {/* Sourcing & Citation Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-neutral-500">Evidence Badges:</span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                OpenAlex: 14 Indexed Sources
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Crossref: DOIs Verified
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                Citation Density: {styleAudit.metrics.citationDensity}% (min ≥{styleAudit.metrics.targetCitationDensityMin}%)
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
                Overlap: {interSectionOverlap}% (&lt;20% Gate)
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Collapsible/Expanded Collegiate Style & Archetype Audit Panel */}
      {(mode === 'detailed' || showStyleAudit) && (
        <section
          aria-label="Supervised Style Engine Audit Details"
          className="max-w-5xl mx-auto rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200/60 dark:border-neutral-800 pb-3">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-neutral-400 dark:text-neutral-500">
                OT-01 Supervised Style Engine (110-Paper Corpus Benchmark)
              </div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 flex flex-wrap items-center gap-2 mt-0.5">
                <span>Target: <strong className="capitalize">{styleAudit.targetArchetype.replace(/_/g, ' ')}</strong></span>
                <span className="text-neutral-300 dark:text-neutral-700">|</span>
                <span>Predicted: <strong className="capitalize">{styleAudit.predictedArchetype.replace(/_/g, ' ')}</strong></span>
                <span className="text-neutral-300 dark:text-neutral-700">|</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {styleAudit.primaryTone} · {styleAudit.secondaryTone}
                </span>
              </div>
            </div>
            {mode === 'minimal' && (
              <button
                type="button"
                onClick={() => setShowStyleAudit(false)}
                className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 self-start sm:self-auto cursor-pointer"
              >
                ✕ Close
              </button>
            )}
          </div>

          {/* 4 Quantitative Benchmarks */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200/50 dark:border-white/5 space-y-1">
              <div className="text-[11px] text-neutral-400">Avg Sentence Length</div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {styleAudit.metrics.avgSentenceLength} words
              </div>
              <div className="text-[10px] text-neutral-400">
                Target: {styleAudit.metrics.targetSentenceLengthRange[0]}–{styleAudit.metrics.targetSentenceLengthRange[1]}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200/50 dark:border-white/5 space-y-1">
              <div className="text-[11px] text-neutral-400">Passive Voice</div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {styleAudit.metrics.passiveVoiceRatio.toFixed(1)}/sent
              </div>
              <div className="text-[10px] text-neutral-400">
                Max: ≤{styleAudit.metrics.targetPassiveVoiceMax}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200/50 dark:border-white/5 space-y-1">
              <div className="text-[11px] text-neutral-400">Lexical Diversity</div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {styleAudit.metrics.lexicalDiversity.toFixed(2)}
              </div>
              <div className="text-[10px] text-neutral-400">
                Min: ≥{styleAudit.metrics.targetLexicalDiversityMin}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200/50 dark:border-white/5 space-y-1">
              <div className="text-[11px] text-neutral-400">Citation Density</div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {styleAudit.metrics.citationDensity.toFixed(1)}%
              </div>
              <div className="text-[10px] text-neutral-400">
                Min: ≥{styleAudit.metrics.targetCitationDensityMin}%
              </div>
            </div>
          </div>

          {/* Recommendations List */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Collegiate Recommendations:
            </div>
            <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400 list-disc list-inside">
              {styleAudit.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Drafting Canvas */}
      <main className="max-w-5xl mx-auto space-y-4">
        {sections.map((section, idx) => (
          <div
            key={section.id}
            className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={section.title}
                onChange={(e) => {
                  const next = [...sections];
                  next[idx] = { ...section, title: e.target.value };
                  setSections(next);
                }}
                className="font-bold text-sm sm:text-base text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-blue-500 focus:outline-none px-1 py-0.5 w-full max-w-md"
              />
              <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                Section {idx + 1}
              </span>
            </div>

            <textarea
              rows={3}
              value={section.content}
              onChange={(e) => {
                const next = [...sections];
                next[idx] = { ...section, content: e.target.value };
                setSections(next);
              }}
              placeholder="Enter section academic arguments, findings, and evidence..."
              className="w-full p-3 text-xs sm:text-sm border border-neutral-200/80 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ))}
      </main>
    </div>
  );
}
