import React, { useState, useMemo, useEffect } from "react";
import type {
  AssignmentStructure,
  DiscoveredSource,
  SectionAnalyticalSynthesis,
} from "../types";
import { flattenStructureSubheadings, CITATION_STYLES } from "../types";
import {
  generateOrSyncAnalyticalSyntheses,
  recalculateAllSynthesesCitations,
  strengthenSynthesisClaim,
  deepenCounterargument,
} from "../services/sectionAnalysisService";
import { formatSourceInTextCitation, formatSourceBibliography } from "../services/citationFormatService";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Edit2,
  Check,
  Plus,
  Trash2,
  Quote,
  Layers,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  X,
  RefreshCw,
  HelpCircle,
} from "lucide-react";

export interface SectionAnalysisWorkspaceProps {
  structure: AssignmentStructure;
  sources: DiscoveredSource[];
  question: string;
  citationStyle: string;
  onCitationStyleChange?: (newStyle: string) => void;
  onProceedToDrafting?: () => void;
  onBackToVault?: () => void;
  savedSyntheses?: SectionAnalyticalSynthesis[];
  onSaveSyntheses?: (syntheses: SectionAnalyticalSynthesis[]) => Promise<void>;
}

export const SectionAnalysisWorkspace: React.FC<SectionAnalysisWorkspaceProps> = ({
  structure,
  sources,
  question,
  citationStyle,
  onCitationStyleChange,
  onProceedToDrafting,
  onBackToVault,
  savedSyntheses = [],
  onSaveSyntheses,
}) => {
  // Outline sections
  const subheadings = useMemo(() => flattenStructureSubheadings(structure), [structure]);
  const outlineSections = useMemo(() => {
    if (subheadings.length > 0) {
      return subheadings.map((s) => ({
        id: s.id,
        numberStr: s.numberStr,
        title: s.title,
        guidance: s.guidance || s.purpose,
        analyticalObjective: s.analyticalObjective,
        keyTheories: s.keyTheories,
      }));
    }
    return (structure?.headings || []).map((h) => ({
      id: h.id,
      numberStr: `${h.number}.0`,
      title: h.title,
      guidance: h.notes || h.purpose,
      analyticalObjective: h.analyticalObjective,
      keyTheories: h.keyTheories,
    }));
  }, [subheadings, structure]);

  const [activeSectionId, setActiveSectionId] = useState<string>(
    outlineSections[0]?.id || ""
  );

  // Syntheses collection
  const [syntheses, setSyntheses] = useState<SectionAnalyticalSynthesis[]>(() => {
    if (savedSyntheses && savedSyntheses.length > 0) {
      return recalculateAllSynthesesCitations(savedSyntheses, sources, citationStyle);
    }
    return generateOrSyncAnalyticalSyntheses(structure, sources, question, citationStyle);
  });

  // Track active section change if list was empty initially
  useEffect(() => {
    if (!activeSectionId && outlineSections.length > 0) {
      setActiveSectionId(outlineSections[0].id);
    }
  }, [outlineSections, activeSectionId]);

  // Synchronize with parent save helper
  const handleUpdateSyntheses = async (updated: SectionAnalyticalSynthesis[]) => {
    setSyntheses(updated);
    if (onSaveSyntheses) {
      await onSaveSyntheses(updated);
    }
  };

  // Subtle Agentic Status
  const [agenticStatus, setAgenticStatus] = useState<string | null>(null);

  // Citation Traceability Modal / Popover state
  const [traceabilityItem, setTraceabilityItem] = useState<{
    synthesis: SectionAnalyticalSynthesis;
    source?: DiscoveredSource;
  } | null>(null);

  // Inline editing state for analysis card
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    claim: "",
    evidence: "",
    interpretation: "",
    counterargument: "",
    analyticalLink: "",
  });

  const activeSection = outlineSections.find((s) => s.id === activeSectionId) || outlineSections[0];
  const activeSyntheses = syntheses.filter((s) => s.sectionId === activeSectionId);

  // Handle citation style change
  const handleStyleChange = (newStyle: string) => {
    if (onCitationStyleChange) {
      onCitationStyleChange(newStyle);
    }
    const updated = recalculateAllSynthesesCitations(syntheses, sources, newStyle);
    handleUpdateSyntheses(updated);
    setAgenticStatus(`Updated in-text citations to ${newStyle.toUpperCase()}`);
    setTimeout(() => setAgenticStatus(null), 3000);
  };

  // Regenerate analysis for active section with subtle agentic progression
  const handleRegenerateActiveSection = () => {
    setAgenticStatus("Reviewing relevant sources…");

    setTimeout(() => {
      setAgenticStatus("Extracting supporting evidence…");
      setTimeout(() => {
        setAgenticStatus("Connecting evidence to your argument…");
        setTimeout(() => {
          setAgenticStatus("Preparing cited analysis…");
          setTimeout(() => {
            if (!activeSection) return;
            const otherSyntheses = syntheses.filter((s) => s.sectionId !== activeSection.id);
            const fresh = generateOrSyncAnalyticalSyntheses(
              structure,
              sources,
              question,
              citationStyle,
              []
            ).filter((s) => s.sectionId === activeSection.id);

            handleUpdateSyntheses([...otherSyntheses, ...fresh]);
            setAgenticStatus(null);
          }, 400);
        }, 400);
      }, 400);
    }, 400);
  };

  // Start editing a card
  const handleStartEditCard = (card: SectionAnalyticalSynthesis) => {
    setEditingCardId(card.id);
    setEditForm({
      claim: card.claim,
      evidence: card.evidence,
      interpretation: card.interpretation,
      counterargument: card.counterargument,
      analyticalLink: card.analyticalLink,
    });
  };

  // Save edited card
  const handleSaveCardEdit = () => {
    if (!editingCardId) return;
    const updated = syntheses.map((item) => {
      if (item.id === editingCardId) {
        return {
          ...item,
          claim: editForm.claim.trim() || item.claim,
          evidence: editForm.evidence.trim() || item.evidence,
          interpretation: editForm.interpretation.trim() || item.interpretation,
          counterargument: editForm.counterargument.trim() || item.counterargument,
          analyticalLink: editForm.analyticalLink.trim() || item.analyticalLink,
          isUserEdited: true,
        };
      }
      return item;
    });
    handleUpdateSyntheses(updated);
    setEditingCardId(null);
  };

  // Delete a card
  const handleDeleteCard = (cardId: string) => {
    const updated = syntheses.filter((item) => item.id !== cardId);
    handleUpdateSyntheses(updated);
  };

  // Strengthen argument for a card
  const handleStrengthenArgument = (card: SectionAnalyticalSynthesis) => {
    const enriched = strengthenSynthesisClaim(card, sources, citationStyle);
    const updated = syntheses.map((s) => (s.id === card.id ? enriched : s));
    handleUpdateSyntheses(updated);
  };

  // Deepen counterargument for a card
  const handleDeepenCounterargument = (card: SectionAnalyticalSynthesis) => {
    const enriched = deepenCounterargument(card, sources, citationStyle);
    const updated = syntheses.map((s) => (s.id === card.id ? enriched : s));
    handleUpdateSyntheses(updated);
  };

  // Add new custom analytical claim to active section
  const handleAddCustomClaim = () => {
    if (!activeSection) return;
    const matchedSource = sources[0];
    const defaultCitation = matchedSource
      ? formatSourceInTextCitation(matchedSource, citationStyle)
      : citationStyle.includes("mla") ? "(Scholar 42)" : "(Scholar, 2024)";

    const newClaim: SectionAnalyticalSynthesis = {
      id: `synth-custom-${Date.now()}`,
      sectionId: activeSection.id,
      sectionTitle: activeSection.title,
      sectionNumberStr: activeSection.numberStr,
      claim: "State your central argument or proposition here...",
      evidence: "Add supporting statistical finding, case study observation, or textual evidence...",
      sourceId: matchedSource?.id,
      sourceTitle: matchedSource?.title || "Scholarly Source",
      sourceAuthors: matchedSource?.authors || ["Scholar, A."],
      sourceYear: matchedSource?.year || "n.d.",
      sourceJournal: matchedSource?.journal || "Academic Journal",
      citation: defaultCitation,
      interpretation: "Explain how this evidence substantiates your thesis...",
      counterargument: "Identify an opposing theoretical perspective or empirical limitation...",
      analyticalLink: "Conclude with an explicit analytical bridge addressing the assignment prompt...",
      isUserEdited: true,
    };

    handleUpdateSyntheses([...syntheses, newClaim]);
    handleStartEditCard(newClaim);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200/80 dark:border-white/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-emerald-700 text-white dark:bg-emerald-600">
              Evidence & Analysis
            </span>
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Outline-Grounded Synthesis Engine
            </span>
            {agenticStatus && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1.5 animate-pulse">
                <Sparkles className="w-3 h-3 text-blue-600" />
                <span>{agenticStatus}</span>
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            AI Analysis & Argumentation
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            Construct evidence-backed arguments for each section of your outline. Claims, evidence excerpts, interpretations, and verified in-text citations are automatically calibrated.
          </p>
        </div>

        {/* Citation Style Selector & Navigation */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="citation-style-select" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Citation Style:
            </label>
            <select
              id="citation-style-select"
              value={citationStyle}
              onChange={(e) => handleStyleChange(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/15 bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white outline-none cursor-pointer"
            >
              {CITATION_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </div>

          {onBackToVault && (
            <button
              type="button"
              onClick={onBackToVault}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Evidence Vault</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Dual-Column Analysis Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Outline Section Selector (lg:col-span-4) */}
        <div className="lg:col-span-4 rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>Outline Sections ({outlineSections.length})</span>
            </h2>
            <span className="text-[11px] text-neutral-400 font-mono">Phase 1 Outline</span>
          </div>

          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {outlineSections.map((sec) => {
              const count = syntheses.filter((s) => s.sectionId === sec.id).length;
              const isSelected = sec.id === activeSectionId;

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                    isSelected
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs"
                      : "hover:bg-neutral-100/70 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono opacity-60 block">
                      Section {sec.numberStr || ""}
                    </span>
                    <span className="text-xs font-semibold truncate block">
                      {sec.title}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono shrink-0 ${
                      isSelected
                        ? "bg-white/20 text-white dark:bg-black/10 dark:text-neutral-900"
                        : "bg-neutral-100 dark:bg-white/10 text-neutral-500"
                    }`}
                  >
                    {count} {count === 1 ? "claim" : "claims"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Section Analytical Content (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-4">
          {activeSection ? (
            <div className="space-y-4">
              {/* Active Section Header Card */}
              <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-5 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                        {activeSection.numberStr || "Section"}
                      </span>
                      <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                        {activeSection.title}
                      </h2>
                    </div>
                    {activeSection.guidance && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 leading-relaxed">
                        {activeSection.guidance}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handleAddCustomClaim}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Claim</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRegenerateActiveSection}
                      disabled={Boolean(agenticStatus)}
                      title="Regenerate analysis with AI"
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${agenticStatus ? "animate-spin" : ""}`} />
                      <span>Regenerate</span>
                    </button>
                  </div>
                </div>

                {activeSection.analyticalObjective && (
                  <div className="p-3 rounded-xl bg-blue-500/[0.04] dark:bg-blue-500/[0.08] border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Analytical Objective:</strong> {activeSection.analyticalObjective}
                    </span>
                  </div>
                )}
              </div>

              {/* Analysis Cards List */}
              {activeSyntheses.length > 0 ? (
                <div className="space-y-4">
                  {activeSyntheses.map((card, idx) => {
                    const isEditing = editingCardId === card.id;
                    const matchedSource = card.sourceId
                      ? sources.find((s) => s.id === card.sourceId)
                      : undefined;

                    return (
                      <div
                        key={card.id}
                        className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-5 shadow-xs space-y-4 transition-all"
                      >
                        {/* Card Header: Claim Number & Quick Actions */}
                        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 dark:border-white/5 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[10px] font-bold flex items-center justify-center font-mono">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                              Analytical Argument
                            </span>
                            {card.isUserEdited && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                User Edited
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={handleSaveCardEdit}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartEditCard(card)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                title="Edit analysis"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteCard(card.id)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer transition-colors"
                              title="Delete analytical point"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Analysis Card Fields */}
                        <div className="space-y-3.5 text-xs">
                          {/* 1. Claim */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block">
                              1. Core Claim (What is being argued?)
                            </span>
                            {isEditing ? (
                              <textarea
                                value={editForm.claim}
                                onChange={(e) => setEditForm({ ...editForm, claim: e.target.value })}
                                rows={2}
                                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-white/20 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none focus:ring-1 focus:ring-neutral-400"
                              />
                            ) : (
                              <p className="font-semibold text-neutral-900 dark:text-white text-xs sm:text-sm leading-relaxed">
                                {card.claim}
                              </p>
                            )}
                          </div>

                          {/* 2. Evidence & In-Text Citation */}
                          <div className="space-y-1 p-3.5 rounded-xl bg-neutral-50/80 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                                <Quote className="w-3 h-3 text-neutral-400" />
                                <span>2. Evidence & Verifiable Citation</span>
                              </span>

                              {/* Clickable In-Text Citation Badge (Opens Traceability) */}
                              <button
                                type="button"
                                onClick={() => setTraceabilityItem({ synthesis: card, source: matchedSource })}
                                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="Click to view source evidence traceability"
                              >
                                <ShieldCheck className="w-3 h-3 text-emerald-400 dark:text-emerald-600" />
                                <span>{card.citation}</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            </div>

                            {isEditing ? (
                              <textarea
                                value={editForm.evidence}
                                onChange={(e) => setEditForm({ ...editForm, evidence: e.target.value })}
                                rows={2}
                                className="w-full p-2 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
                              />
                            ) : (
                              <p className="text-neutral-700 dark:text-neutral-300 italic leading-relaxed">
                                "{card.evidence}"
                              </p>
                            )}

                            {card.evidenceLocation && (
                              <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 block pt-1">
                                📍 Provenance: {card.evidenceLocation} · Source: {card.sourceTitle || "Scholarly Publication"}
                              </span>
                            )}
                          </div>

                          {/* 3. Interpretation */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block">
                              3. Analytical Interpretation (What does the evidence mean?)
                            </span>
                            {isEditing ? (
                              <textarea
                                value={editForm.interpretation}
                                onChange={(e) => setEditForm({ ...editForm, interpretation: e.target.value })}
                                rows={2}
                                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-white/20 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none focus:ring-1 focus:ring-neutral-400"
                              />
                            ) : (
                              <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed">
                                {card.interpretation}
                              </p>
                            )}
                          </div>

                          {/* 4. Counterargument */}
                          <div className="space-y-1 p-3 rounded-xl bg-amber-500/[0.04] dark:bg-amber-500/[0.08] border border-amber-500/20">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                              4. Counterargument & Dissenting Debate
                            </span>
                            {isEditing ? (
                              <textarea
                                value={editForm.counterargument}
                                onChange={(e) => setEditForm({ ...editForm, counterargument: e.target.value })}
                                rows={2}
                                className="w-full p-2 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
                              />
                            ) : (
                              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                                {card.counterargument}
                              </p>
                            )}
                          </div>

                          {/* 5. Analytical Link to Assignment Question */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block">
                              5. Analytical Link (How does this answer the assignment brief?)
                            </span>
                            {isEditing ? (
                              <textarea
                                value={editForm.analyticalLink}
                                onChange={(e) => setEditForm({ ...editForm, analyticalLink: e.target.value })}
                                rows={2}
                                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-white/20 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none focus:ring-1 focus:ring-neutral-400"
                              />
                            ) : (
                              <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed font-medium">
                                {card.analyticalLink}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Card Sub-actions Footer: Strengthen / Deepen */}
                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-neutral-100 dark:border-white/5 flex-wrap">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStrengthenArgument(card)}
                              className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Sparkles className="w-3 h-3 text-neutral-400" />
                              <span>Strengthen Argument</span>
                            </button>
                            <span className="text-neutral-300 dark:text-neutral-700">·</span>
                            <button
                              type="button"
                              onClick={() => handleDeepenCounterargument(card)}
                              className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Layers className="w-3 h-3 text-neutral-400" />
                              <span>Deepen Counterargument</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setTraceabilityItem({ synthesis: card, source: matchedSource })}
                            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>Trace to Source</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 space-y-3">
                  <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    No analytical claims generated for this section yet.
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                    Click <strong>Regenerate Analysis</strong> to synthesize evidence from your accumulated sources, or add a custom claim.
                  </p>
                  <button
                    type="button"
                    onClick={handleRegenerateActiveSection}
                    className="px-5 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-2 shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Analysis for Section</span>
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Source-to-Citation Traceability Popover Modal */}
      {traceabilityItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/15 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
                  Source-to-Citation Traceability
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTraceabilityItem(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Target Claim
                </span>
                <p className="font-semibold text-neutral-900 dark:text-white leading-relaxed">
                  {traceabilityItem.synthesis.claim}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Active In-Text Citation
                  </span>
                  <p className="font-mono font-bold text-neutral-900 dark:text-white">
                    {traceabilityItem.synthesis.citation}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Citation Style
                  </span>
                  <p className="font-semibold text-neutral-800 dark:text-neutral-200 uppercase">
                    {citationStyle}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08] border border-emerald-500/20 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Underlying Source & Authors
                </span>
                <p className="font-bold text-neutral-900 dark:text-white">
                  {traceabilityItem.source?.title || traceabilityItem.synthesis.sourceTitle || "Scholarly Publication"}
                </p>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                  {(traceabilityItem.source?.authors || traceabilityItem.synthesis.sourceAuthors || []).join(", ")} (
                  {traceabilityItem.source?.year || traceabilityItem.synthesis.sourceYear || "n.d."})
                  {" · "}
                  <span className="italic">
                    {traceabilityItem.source?.journal || traceabilityItem.synthesis.sourceJournal || "Academic Press"}
                  </span>
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  Verifiable Evidence Excerpt
                </span>
                <p className="italic text-neutral-800 dark:text-neutral-200 leading-relaxed font-serif">
                  "{traceabilityItem.synthesis.evidenceExcerpt || traceabilityItem.synthesis.evidence}"
                </p>
                {traceabilityItem.synthesis.evidenceLocation && (
                  <span className="text-[10px] font-mono text-neutral-400 block pt-1">
                    📍 Location: {traceabilityItem.synthesis.evidenceLocation}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setTraceabilityItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
              >
                Close Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2 Bottom Action Bar */}
      <div className="rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Phase 2: Evidence & Analysis Complete
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center gap-1 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              <span>{syntheses.length} Analytical Arguments Formulated</span>
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            All analytical arguments are grounded in your unified source vault with valid in-text citations. Proceed to Phase 3 drafting when ready.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          {onBackToVault && (
            <button
              type="button"
              onClick={onBackToVault}
              className="px-4 py-2.5 rounded-full text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Evidence Vault</span>
            </button>
          )}

          {onProceedToDrafting && (
            <button
              type="button"
              onClick={onProceedToDrafting}
              data-testid="proceed-to-drafting-btn"
              className="px-7 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none"
            >
              <span>Proceed to Phase 3: Drafting</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionAnalysisWorkspace;
