import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useResearchWorkspace } from "./ResearchContext";
import { saveIntakeAnswers } from "../api";
import {
  exportJournalToDocx,
  exportRefereeLetterToDocx,
  downloadBlob,
  generateJournalLatex,
} from "./services/journalExportService";
import {
  downloadProjectExportBlob,
  downloadRefereeResponseLetterBlob,
} from "../api";
import type { WordBudgetBlueprint, RebuttalMatrixItem } from "./types";
import ReferencesCheck from "../journal/ReferencesCheck";
import VerificationChecks, { useVerification } from "../journal/VerificationChecks";
import { checkDois, lookupDoi } from "../journal/referenceApi";
import { studioEvidence } from "../journal/studioEvidence";
import { auditCitations, recordsForSources } from "../../domain/journal/referenceAudit";
import { cleanDoi, parseReferenceRecords, type ReferenceRecord } from "../../domain/journal/references";
import { isNumeric, renderManuscript, styleKey, type StyleKey } from "../../domain/journal/citationStyles";
import { safeParseAnswerField } from "../../shared/projectStateSchema";

/** The style select's values (kept from before) and their labels. */
const STYLE_OPTIONS: Array<{ value: string; key: StyleKey; label: string }> = [
  { value: "apa7", key: "apa", label: "APA 7th Edition (author–date)" },
  { value: "ieee", key: "ieee", label: "IEEE (numbered [1])" },
  { value: "harvard", key: "harvard", label: "Harvard (author, year)" },
  { value: "chicago", key: "chicago", label: "Chicago (author–date)" },
  { value: "mla9", key: "mla", label: "MLA 9th Edition (author)" },
  { value: "vancouver", key: "vancouver", label: "Vancouver / ICMJE (numbered)" },
];
const styleSelectValue = (raw: string | undefined) => STYLE_OPTIONS.find((o) => o.key === styleKey(raw))?.value ?? "apa7";

interface PrimaryDataEntry {
  id: string;
  name?: string;
  title?: string;
  datasetName?: string;
}

interface VaultSourceEntry {
  id: string;
  title?: string;
  name?: string;
  year?: number | string;
  publicationYear?: number | string;
}

export default function AuditExportMode() {
  const { project, projectId, setProject } = useResearchWorkspace();
  const effectiveProjectId = project?.projectId || projectId;

  const answers = useMemo(() => project?.answers || {}, [project?.answers]);
  // The user's own choice; never a made-up journal name in their export.
  const targetJournalName = String(answers.target_journal || "").trim() || "Target journal not yet selected";

  // Assembled manuscript markdown
  const manuscriptMarkdown = useMemo(() => {
    return (
      answers["manuscript_markdown"] ||
      answers["full_text_markdown"] ||
      answers["assembled_draft"] ||
      ""
    );
  }, [answers]);

  // Mode 1 Word budget blueprint
  const blueprint: WordBudgetBlueprint | null = useMemo(() => {
    const raw = answers["word_budget_blueprint"] || answers["word_budget"];
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }, [answers]);

  // Mode 4 Rebuttal matrix items
  const rebuttalMatrix: RebuttalMatrixItem[] = useMemo(() => {
    const raw = answers["rebuttal_matrix"];
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [answers]);

  // Primary datasets uploaded in Mode 2
  const primaryDatasets: PrimaryDataEntry[] = useMemo(() => {
    const raw = answers["user_datasets"] || answers["user_data_entries"];
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [answers]);

  // Vault sources in Mode 2
  const vaultSources: VaultSourceEntry[] = useMemo(() => {
    const raw = answers["approved_vault_sources"] || answers["vault_sources"];
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [answers]);

  // ── 1. Word Count Compliance ──
  // The author's own target from Blueprint (or the journal profile); none is assumed.
  const targetWords = blueprint?.targetTotalWords || Number(answers["target_word_count"]) || 0;
  const actualWords = useMemo(() => {
    return manuscriptMarkdown.trim() ? manuscriptMarkdown.trim().split(/\s+/).length : 0;
  }, [manuscriptMarkdown]);

  const wordDeltaPercent = useMemo(() => {
    if (targetWords === 0) return 0;
    return Number((((actualWords - targetWords) / targetWords) * 100).toFixed(1));
  }, [actualWords, targetWords]);

  const hasWordTarget = targetWords > 0;
  const isWordCountCompliant = hasWordTarget && actualWords > 0 && Math.abs(wordDeltaPercent) <= 5.0;

  // ── 2. References: every citation resolved, nothing retracted unacknowledged ──
  const sources = useMemo(() => studioEvidence(answers), [answers]);
  const savedRecords = useMemo(() => parseReferenceRecords(answers["reference_records"]), [answers]);
  const acknowledgedRetractions = useMemo(
    () => safeParseAnswerField<string[]>(answers["acknowledged_retractions"], []).filter((x) => typeof x === "string"),
    [answers]
  );
  const referenceAudit = useMemo(
    () => auditCitations(manuscriptMarkdown, sources, savedRecords, acknowledgedRetractions),
    [manuscriptMarkdown, sources, savedRecords, acknowledgedRetractions]
  );
  const [checkingRefs, setCheckingRefs] = useState(false);
  const [refCheckError, setRefCheckError] = useState<string | null>(null);

  // ── 3. Verification: statistics, spelling, abstract numbers, numbering ──
  const verification = useVerification(manuscriptMarkdown);

  // ── 4. 2026 Publisher Ethical Declarations ──
  const [dataAvailabilityEnabled, setDataAvailabilityEnabled] = useState(true);
  const [competingInterestsEnabled, setCompetingInterestsEnabled] = useState(true);
  const [creditEnabled, setCreditEnabled] = useState(true);
  const [aiDisclosureEnabled, setAiDisclosureEnabled] = useState(true);

  // Declarations are statements the authors make, so they start empty: only
  // the authors know their funding, interests, contributions and data access.
  // A starting draft that names their own datasets is offered, never filled in.
  const datasetDraft = useMemo(() => {
    if (primaryDatasets.length === 0) return "";
    const names = primaryDatasets.map((d) => d.title || d.name || d.id).join(", ");
    return `The data analysed in this study (${names}) are available from the corresponding author on reasonable request.`;
  }, [primaryDatasets]);

  const [dataAvailabilityStatement, setDataAvailabilityStatement] = useState(answers["data_availability_statement"] || "");
  const [competingInterestsStatement, setCompetingInterestsStatement] = useState(answers["competing_interests_statement"] || "");
  const [creditStatement, setCreditStatement] = useState(answers["credit_statement"] || "");
  const [aiDisclosureStatement, setAiDisclosureStatement] = useState(answers["ai_disclosure_statement"] || "");

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // ── Submission Package Formatter State ──
  const [layoutMode, setLayoutMode] = useState<"1-column-double" | "2-column-camera">(
    "1-column-double"
  );
  const [citationStyle, setCitationStyle] = useState<string>(styleSelectValue(answers["citation_style"]));
  const renderedManuscript = useMemo(
    () => renderManuscript(manuscriptMarkdown, recordsForSources(sources, savedRecords), styleKey(citationStyle)),
    [manuscriptMarkdown, sources, savedRecords, citationStyle]
  );
  const styleLabel = STYLE_OPTIONS.find((o) => o.value === citationStyle)?.label.replace(/ \(.*\)$/, "") ?? "APA 7th Edition";
  // The title page is the author's: start from what the project has, never a stand-in person.
  const [title, setTitle] = useState(answers["working_title"] || (project as { title?: string })?.title || "");
  const [runningHead, setRunningHead] = useState(answers["running_head"] || "");
  const [authorName, setAuthorName] = useState(
    project?.authors?.[0] ? `${project.authors[0].firstName} ${project.authors[0].surname}`.trim() : ""
  );
  const [affiliation, setAffiliation] = useState(project?.authors?.[0]?.affiliation || "");
  const [orcid, setOrcid] = useState(answers["author_orcid"] || "");
  const [email, setEmail] = useState(project?.authors?.[0]?.email || "");
  const [keywords, setKeywords] = useState(answers["keywords"] || "");

  useEffect(() => {
    if (project) {
      if (answers["working_title"] || (project as { title?: string })?.title) {
        setTitle(answers["working_title"] || (project as { title?: string })?.title || "");
      }
      if (answers["running_head"]) {
        setRunningHead(answers["running_head"]);
      }
      if (project.authors?.[0]) {
        setAuthorName(`${project.authors[0].firstName} ${project.authors[0].surname}`.trim());
        if (project.authors[0].affiliation) {
          setAffiliation(project.authors[0].affiliation);
        }
        if (project.authors[0].email) {
          setEmail(project.authors[0].email);
        }
      }
      if (answers["author_orcid"]) {
        setOrcid(answers["author_orcid"]);
      }
      if (answers["citation_style"]) {
        setCitationStyle(styleSelectValue(answers["citation_style"]));
      }
      for (const [key, set] of [
        ["data_availability_statement", setDataAvailabilityStatement],
        ["competing_interests_statement", setCompetingInterestsStatement],
        ["credit_statement", setCreditStatement],
        ["ai_disclosure_statement", setAiDisclosureStatement],
        ["keywords", setKeywords],
      ] as const) {
        if (answers[key]) set(answers[key]);
      }
    }
  }, [project, answers]);

  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Conductor Gate G7 Certification status
  // The share of the five checks that pass; nothing is granted up front.
  const declarationsWritten = [
    [dataAvailabilityEnabled, dataAvailabilityStatement],
    [competingInterestsEnabled, competingInterestsStatement],
    [creditEnabled, creditStatement],
    [aiDisclosureEnabled, aiDisclosureStatement],
  ].every(([on, text]) => on && String(text).trim().length > 0);
  const titlePageComplete = [title, authorName, affiliation, email].every((v) => v.trim().length > 0);
  // Text checks pass only when there is text to check.
  const hasText = actualWords > 0;
  const citationsOk = hasText && referenceAudit.blocking === 0;
  const verificationOk = hasText && verification.problems === 0;
  const g7Checks = [isWordCountCompliant, citationsOk, verificationOk, declarationsWritten, titlePageComplete];
  const g7Passed = g7Checks.filter(Boolean).length;
  const g7CertifiedReady = g7Checks.every(Boolean);

  // Append Declarations to Manuscript End-Matter
  const handleAppendDeclarations = useCallback(async () => {
    if (!project) return;
    setSaveStatus("Appending declarations...");

    let declarationsText = "\n\n## Declarations\n\n";
    if (dataAvailabilityEnabled && dataAvailabilityStatement.trim()) {
      declarationsText += `**Data & Primary Material Availability:** ${dataAvailabilityStatement}\n\n`;
    }
    if (competingInterestsEnabled && competingInterestsStatement.trim()) {
      declarationsText += `**Competing Interests / Funding Declaration:** ${competingInterestsStatement}\n\n`;
    }
    if (creditEnabled && creditStatement.trim()) {
      declarationsText += `**CRediT Author Contribution Statement:** ${creditStatement}\n\n`;
    }
    if (aiDisclosureEnabled && aiDisclosureStatement.trim()) {
      declarationsText += `**Transparent Methodology & AI-Assisted Tool Disclosure:** ${aiDisclosureStatement}\n\n`;
    }

    let updatedMarkdown = manuscriptMarkdown;
    const declIndex = updatedMarkdown.indexOf("## Declarations");
    if (declIndex !== -1) {
      // Replace existing declarations
      const refIndex = updatedMarkdown.indexOf("## References", declIndex);
      if (refIndex !== -1) {
        updatedMarkdown =
          updatedMarkdown.slice(0, declIndex) +
          declarationsText.trim() +
          "\n\n" +
          updatedMarkdown.slice(refIndex);
      } else {
        updatedMarkdown = updatedMarkdown.slice(0, declIndex) + declarationsText.trim();
      }
    } else {
      // Append before References if references exist, otherwise at bottom
      const refIndex = updatedMarkdown.indexOf("## References");
      if (refIndex !== -1) {
        updatedMarkdown =
          updatedMarkdown.slice(0, refIndex) +
          declarationsText +
          updatedMarkdown.slice(refIndex);
      } else {
        updatedMarkdown += declarationsText;
      }
    }

    const nextAnswers = {
      ...answers,
      manuscript_markdown: updatedMarkdown,
      data_availability_statement: dataAvailabilityStatement,
      competing_interests_statement: competingInterestsStatement,
      credit_statement: creditStatement,
      ai_disclosure_statement: aiDisclosureStatement,
      working_title: title,
      running_head: runningHead,
      author_orcid: orcid,
      keywords,
    };

    try {
      const updated = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
      setProject(updated);
      setSaveStatus("Declarations successfully appended to manuscript end-matter!");
      setTimeout(() => setSaveStatus(null), 4000);
    } catch {
      setSaveStatus("Failed to save declarations to project answers.");
    }
  }, [
    project,
    effectiveProjectId,
    answers,
    manuscriptMarkdown,
    dataAvailabilityEnabled,
    dataAvailabilityStatement,
    competingInterestsEnabled,
    competingInterestsStatement,
    creditEnabled,
    creditStatement,
    aiDisclosureEnabled,
    aiDisclosureStatement,
    title,
    runningHead,
    orcid,
    keywords,
    setProject,
  ]);

  // Looks up cited DOIs: a full record where there is none from the registry
  // yet, otherwise just the current retraction status. Saved on the project.
  const handleCheckReferences = useCallback(async () => {
    if (!effectiveProjectId) return;
    setCheckingRefs(true);
    setRefCheckError(null);
    try {
      const cited = new Set(referenceAudit.rows.map((r) => r.id));
      const next: Record<string, ReferenceRecord> = { ...savedRecords };
      const toLookUp: Array<{ id: string; doi: string }> = [];
      const toCheck: Array<{ id: string; doi: string }> = [];
      for (const src of sources) {
        if (!cited.has(src.id) || src.isUserData) continue;
        const rec = savedRecords[src.id];
        const doi = cleanDoi(rec?.doi ?? src.doi);
        if (!doi) continue;
        (rec && rec.registry !== "author" ? toCheck : toLookUp).push({ id: src.id, doi });
      }
      let failed = 0;
      for (const { id, doi } of toLookUp) {
        try {
          const { record } = await lookupDoi(effectiveProjectId, doi);
          next[id] = { ...record, id };
        } catch {
          failed += 1;
        }
      }
      if (toCheck.length) {
        const { results } = await checkDois(effectiveProjectId, toCheck.map((x) => x.doi));
        for (const { id, doi } of toCheck) if (results[doi]) next[id] = { ...next[id], integrity: results[doi] };
      }
      const saved = await saveIntakeAnswers(effectiveProjectId, {
        ...answers,
        reference_records: JSON.stringify(next),
        references_checked_at: new Date().toISOString(),
      });
      setProject(saved);
      if (failed) setRefCheckError(`${failed} DOI${failed === 1 ? "" : "s"} could not be found or reached; ${failed === 1 ? "it stays" : "they stay"} "Not checked".`);
    } catch (err: unknown) {
      setRefCheckError(err instanceof Error ? err.message : "The references could not be checked.");
    } finally {
      setCheckingRefs(false);
    }
  }, [effectiveProjectId, referenceAudit, savedRecords, sources, answers, setProject]);

  const handleAcknowledgeRetraction = useCallback(
    async (id: string, on: boolean) => {
      if (!effectiveProjectId) return;
      const next = on ? Array.from(new Set([...acknowledgedRetractions, id])) : acknowledgedRetractions.filter((x) => x !== id);
      const saved = await saveIntakeAnswers(effectiveProjectId, { ...answers, acknowledged_retractions: JSON.stringify(next) });
      setProject(saved);
    },
    [effectiveProjectId, acknowledgedRetractions, answers, setProject]
  );

  // Export waits while a citation points nowhere or to an unacknowledged retraction.
  const exportBlocked = referenceAudit.blocking > 0;
  const exportBlockedNotice = `Fix the references first: ${referenceAudit.blocking} citation${referenceAudit.blocking === 1 ? "" : "s"} ${referenceAudit.blocking === 1 ? "points" : "point"} to no source or to a retracted paper. See "2. References".`;
  const exportText = renderedManuscript.markdown;

  // Export handlers
  const handleDownloadDocx = useCallback(async () => {
    if (!effectiveProjectId) return;
    if (exportBlocked) {
      setExportNotice(exportBlockedNotice);
      return;
    }
    setIsExporting("docx");
    setExportNotice("Compiling journal submission Word (.docx) document...");

    try {
      // Try backend endpoint first
      const blob = await downloadProjectExportBlob(effectiveProjectId, "docx", {
        template: layoutMode === "2-column-camera" ? "ieee" : "apa7",
        manuscriptMarkdown: exportText,
      });
      downloadBlob(blob, `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}_Submission.docx`);
      setExportNotice("Downloaded Journal Submission (.docx) successfully.");
    } catch {
      // Client-side AST fallback using exportJournalToDocx
      try {
        await exportJournalToDocx({
          title,
          targetJournal: targetJournalName,
          template: layoutMode === "2-column-camera" ? "ieee" : "apa7",
          citationStyle,
          authors: [
            {
              name: authorName,
              affiliation,
              email,
              isCorresponding: true,
            },
          ],
          abstract: answers["abstract"] || "",
          keywords: keywords.split(",").map((s) => s.trim()),
          sections: [
            {
              section: "Manuscript Content",
              content: exportText,
            },
          ],
          declarations: {
            dataAvailability: dataAvailabilityStatement,
            conflictOfInterest: competingInterestsStatement,
            authorContributions: creditStatement,
          },
        });
        setExportNotice("Downloaded Journal Submission (.docx) successfully via AST compiler.");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error";
        setExportNotice(`Failed to export DOCX: ${msg}`);
      }
    } finally {
      setIsExporting(null);
      setTimeout(() => setExportNotice(null), 5000);
    }
  }, [
    project,
    effectiveProjectId,
    layoutMode,
    title,
    citationStyle,
    authorName,
    affiliation,
    email,
    answers,
    keywords,
    exportText,
    exportBlocked,
    exportBlockedNotice,
    dataAvailabilityStatement,
    competingInterestsStatement,
    creditStatement,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (!effectiveProjectId) return;
    if (exportBlocked) {
      setExportNotice(exportBlockedNotice);
      return;
    }
    setIsExporting("pdf");
    setExportNotice("Compiling camera-ready PDF document...");

    try {
      const blob = await downloadProjectExportBlob(effectiveProjectId, "pdf", {
        template: layoutMode === "2-column-camera" ? "ieee" : "nature",
        manuscriptMarkdown: exportText,
      });
      downloadBlob(blob, `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}_CameraReady.pdf`);
      setExportNotice("Downloaded Camera-Ready (.pdf) successfully.");
    } catch {
      setExportNotice("PDF compiler requires backend service. Please check connection.");
    } finally {
      setIsExporting(null);
      setTimeout(() => setExportNotice(null), 5000);
    }
  }, [project, effectiveProjectId, layoutMode, title, exportBlocked, exportBlockedNotice, exportText]);

  const handleDownloadRefereeLetter = useCallback(async () => {
    if (!effectiveProjectId) return;
    setIsExporting("letter");
    setExportNotice("Compiling Point-by-Point Referee Response Letter (.docx)...");

    try {
      // Call backend route
      const blob = await downloadRefereeResponseLetterBlob(effectiveProjectId);
      downloadBlob(blob, "Referee_Response_Letter.docx");
      setExportNotice("Downloaded Referee_Response_Letter.docx successfully.");
    } catch {
      // Client-side fallback
      try {
        const letterBlob = await exportRefereeLetterToDocx(
          title,
          authorName,
          targetJournalName,
          rebuttalMatrix
        );
        downloadBlob(letterBlob, "Referee_Response_Letter.docx");
        setExportNotice("Downloaded Referee_Response_Letter.docx successfully via AST compiler.");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error";
        setExportNotice(`Failed to export Referee Response Letter: ${msg}`);
      }
    } finally {
      setIsExporting(null);
      setTimeout(() => setExportNotice(null), 5000);
    }
  }, [project, title, authorName, layoutMode, rebuttalMatrix]);

  const handleQuickExport = useCallback(
    (format: "latex" | "typst" | "markdown") => {
      if (exportBlocked) {
        setExportNotice(exportBlockedNotice);
        return;
      }
      if (format === "markdown") {
        const blob = new Blob([exportText], { type: "text/markdown;charset=utf-8" });
        downloadBlob(blob, `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`);
      } else if (format === "latex") {
        const latexRes = generateJournalLatex({
          title,
          targetJournal: "Journal Submission",
          template: layoutMode === "2-column-camera" ? "ieee" : "nature",
          authors: [{ name: authorName, affiliation, email }],
          sections: [{ section: "Body", content: exportText }],
        });
        const blob = new Blob([latexRes.tex], { type: "text/x-tex;charset=utf-8" });
        downloadBlob(blob, `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.tex`);
      } else if (format === "typst") {
        const typstContent = `#set page(paper: "a4", margin: 2.5cm)\n#set text(font: "Linux Libertine", size: 11pt)\n\n= ${title}\n\n*${authorName}*\n_${affiliation}_\n\n${exportText}`;
        const blob = new Blob([typstContent], { type: "text/plain;charset=utf-8" });
        downloadBlob(blob, `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.typ`);
      }
    },
    [exportText, exportBlocked, exportBlockedNotice, title, layoutMode, authorName, affiliation, email]
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* ── Studio Header ── */}
      <div className="border-b border-[color:var(--border-control)] bg-[color:var(--surface-raised)] px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
              Mode 5
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
              Conductor Gate G7
            </span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Pre-Flight Compliance Audit & Submission Compiler
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Synchronized Gate G7 compliance verification, 2026 publisher ethical declarations, and camera-ready document generation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 ${
              g7CertifiedReady
                ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border-[color:var(--state-success)]"
                : "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] border-[color:var(--state-warning)]"
            }`}
          >
            <span>{g7CertifiedReady ? "✓ Gate G7: CERTIFIED READY" : "⚠ Gate G7: ACTION REQUIRED"}</span>
            <span className="px-1.5 py-0.2 rounded bg-[color:var(--surface-raised)] text-[11px]">
              {g7Passed} of {g7Checks.length} checks pass
            </span>
          </div>
        </div>
      </div>

      {/* ── Feedback Notice ── */}
      {(exportNotice || saveStatus) && (
        <div className="bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] border-b border-[color:var(--border-control)] px-6 py-2.5 text-xs font-medium flex items-center justify-between">
          <span>{exportNotice || saveStatus}</span>
        </div>
      )}

      {/* ── Main Two-Panel Grid ── */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ==================================================================== */}
        {/* LEFT PANEL: GATE G7 PRE-SUBMISSION GATEKEEPER SCORECARD             */}
        {/* ==================================================================== */}
        <section
          aria-label="Pre-Submission Gatekeeper Scorecard"
          className="lg:col-span-7 flex flex-col gap-6"
        >
          {/* Card Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[color:var(--text-secondary)] flex items-center gap-2">
              <span>Gate G7 Scorecard</span>
              <span className="text-xs font-normal normal-case text-[color:var(--text-muted)]">
                (Word budget, references, verification and declarations)
              </span>
            </h3>
          </div>

          {/* 1. Word Count Budget Compliance */}
          <div className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-[color:var(--text-primary)]">
                  1. Word Count Budget Compliance
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  (Mode 1 Target Blueprint)
                </span>
              </div>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  isWordCountCompliant
                    ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"
                    : "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                }`}
              >
                {!hasWordTarget
                  ? "No word target set in Blueprint"
                  : isWordCountCompliant
                  ? `Within Budget (±5% Target: ${actualWords.toLocaleString()} / ${targetWords.toLocaleString()} words, ${wordDeltaPercent > 0 ? "+" : ""}${wordDeltaPercent}%)`
                  : `Budget Deviation: ${actualWords.toLocaleString()} / ${targetWords.toLocaleString()} words (${wordDeltaPercent > 0 ? "+" : ""}${wordDeltaPercent}%)`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)]">
                <div className="text-[11px] text-[color:var(--text-muted)]">Actual Manuscript Words</div>
                <div className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                  {actualWords.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)]">
                <div className="text-[11px] text-[color:var(--text-muted)]">Mode 1 Target Budget</div>
                <div className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                  {hasWordTarget ? targetWords.toLocaleString() : "Not set"}
                </div>
              </div>
              <div className="p-2.5 rounded bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)]">
                <div className="text-[11px] text-[color:var(--text-muted)]">Tolerance Band (±5%)</div>
                <div className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                  {hasWordTarget ? `${Math.round(targetWords * 0.95).toLocaleString()} – ${Math.round(targetWords * 1.05).toLocaleString()}` : "—"}
                </div>
              </div>
            </div>

            {blueprint?.sections && (
              <div className="mt-1 border-t border-[color:var(--border-control)] pt-2">
                <div className="text-[11px] font-bold text-[color:var(--text-secondary)] mb-1.5">
                  Section Budget Allocation Breakdown:
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {blueprint.sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[color:var(--surface-canvas)]"
                    >
                      <span className="font-medium text-[color:var(--text-primary)]">
                        {sec.sectionName || sec.sectionKey}
                      </span>
                      <span className="text-[color:var(--text-muted)]">
                        Target: {sec.targetWords}w
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. References */}
          <ReferencesCheck
            audit={referenceAudit}
            references={renderedManuscript.references}
            styleLabel={styleLabel}
            numbered={isNumeric(styleKey(citationStyle))}
            hasText={hasText}
            canCheck={referenceAudit.rows.some((r) => !["missing", "data", "unregistered"].includes(r.state))}
            checking={checkingRefs}
            checkError={refCheckError}
            lastChecked={answers["references_checked_at"] || undefined}
            onCheck={handleCheckReferences}
            acknowledged={acknowledgedRetractions}
            onAcknowledge={handleAcknowledgeRetraction}
          />

          {/* 3. Verification */}
          <VerificationChecks markdown={manuscriptMarkdown} />

          {/* 4. 2026 Publisher Ethical & Provenance Declarations */}
          <div className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-[color:var(--text-primary)]">
                  4. 2026 Publisher Ethical & Provenance Declarations
                </span>
                <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                  ICMJE, COPE, Elsevier, Wiley standard compliance statements.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAppendDeclarations}
                className="px-3 py-1.5 rounded-lg bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 text-xs font-bold transition shadow-sm"
              >
                Append Declarations to Manuscript End-Matter
              </button>
            </div>

            {/* Declaration 1: Data Availability */}
            <div className="p-3 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dataAvailabilityEnabled}
                    onChange={(e) => setDataAvailabilityEnabled(e.target.checked)}
                    className="accent-[color:var(--accent)]"
                  />
                  <span className="text-xs font-bold text-[color:var(--text-primary)]">
                    Data & Primary Material Availability Statement
                  </span>
                </label>
                {datasetDraft && dataAvailabilityEnabled && !dataAvailabilityStatement.trim() && (
                  <button
                    type="button"
                    onClick={() => setDataAvailabilityStatement(datasetDraft)}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] cursor-pointer"
                  >
                    Start from my datasets
                  </button>
                )}
              </div>
              {dataAvailabilityEnabled && (
                <textarea
                  aria-label="Data Availability Statement"
                  rows={2}
                  placeholder="Where readers can get your data, e.g. a repository and DOI, or 'available from the corresponding author on reasonable request'."
                  value={dataAvailabilityStatement}
                  onChange={(e) => setDataAvailabilityStatement(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              )}
            </div>

            {/* Declaration 2: Competing Interests */}
            <div className="p-3 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={competingInterestsEnabled}
                  onChange={(e) => setCompetingInterestsEnabled(e.target.checked)}
                  className="accent-[color:var(--accent)]"
                />
                <span className="text-xs font-bold text-[color:var(--text-primary)]">
                  Competing Interests / Funding Declaration
                </span>
              </label>
              {competingInterestsEnabled && (
                <textarea
                  aria-label="Competing Interests Statement"
                  rows={2}
                  placeholder="Your funding sources and any competing interests, e.g. 'The authors declare no competing interests.' Only you can state this."
                  value={competingInterestsStatement}
                  onChange={(e) => setCompetingInterestsStatement(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              )}
            </div>

            {/* Declaration 3: CReDiT Author Contributions */}
            <div className="p-3 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={creditEnabled}
                  onChange={(e) => setCreditEnabled(e.target.checked)}
                  className="accent-[color:var(--accent)]"
                />
                <span className="text-xs font-bold text-[color:var(--text-primary)]">
                  CRediT Author Contribution Statement
                </span>
              </label>
              {creditEnabled && (
                <textarea
                  aria-label="CRediT Statement"
                  rows={2}
                  placeholder="Who did what, using CRediT roles, e.g. 'A. Author: Conceptualization, Writing – original draft. B. Author: Formal analysis.'"
                  value={creditStatement}
                  onChange={(e) => setCreditStatement(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              )}
            </div>

            {/* Declaration 4: Transparent Methodology & AI Disclosure */}
            <div className="p-3 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiDisclosureEnabled}
                  onChange={(e) => setAiDisclosureEnabled(e.target.checked)}
                  className="accent-[color:var(--accent)]"
                />
                <span className="text-xs font-bold text-[color:var(--text-primary)]">
                  Transparent Methodology & AI-Assisted Tool Disclosure
                </span>
              </label>
              {aiDisclosureEnabled && (
                <textarea
                  aria-label="AI Disclosure Statement"
                  rows={2}
                  placeholder="How you used AI tools in preparing this work and that you take responsibility for the content, as your journal requires."
                  value={aiDisclosureStatement}
                  onChange={(e) => setAiDisclosureStatement(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              )}
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* RIGHT PANEL: CAMERA-READY SUBMISSION PACKAGE EXPORTER                */}
        {/* ==================================================================== */}
        <section
          aria-label="Camera-Ready Submission Package Exporter"
          className="lg:col-span-5 flex flex-col gap-6"
        >
          {/* Card Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[color:var(--text-secondary)] flex items-center gap-2">
              <span>Submission Package Exporter</span>
            </h3>
          </div>

          {/* Layout & Style Configuration */}
          <div className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
              Layout & Citation Typography
            </h4>

            {/* Manuscript Layout Selector */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--text-primary)] mb-1.5">
                Manuscript Layout Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLayoutMode("1-column-double")}
                  className={`p-2.5 rounded-lg border text-left transition ${
                    layoutMode === "1-column-double"
                      ? "border-[color:var(--border-strong)] bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] shadow-sm"
                      : "border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)]"
                  }`}
                >
                  <div className="text-xs font-bold">1-Column Double-Spaced</div>
                  <div className="text-[10px] text-[color:var(--text-muted)] mt-0.5">
                    2.0 spacing, 12pt review submission standard
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLayoutMode("2-column-camera")}
                  className={`p-2.5 rounded-lg border text-left transition ${
                    layoutMode === "2-column-camera"
                      ? "border-[color:var(--border-strong)] bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] shadow-sm"
                      : "border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)]"
                  }`}
                >
                  <div className="text-xs font-bold">2-Column Camera-Ready</div>
                  <div className="text-[10px] text-[color:var(--text-muted)] mt-0.5">
                    1.15 spacing, compact journal proceedings
                  </div>
                </button>
              </div>
            </div>

            {/* Citation Style Selector */}
            <div>
              <label
                htmlFor="citation-style-select"
                className="block text-xs font-bold text-[color:var(--text-primary)] mb-1"
              >
                Citation & Bibliography Style
              </label>
              <select
                id="citation-style-select"
                value={citationStyle}
                onChange={(e) => setCitationStyle(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
              >
                {STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Author & Title Page Metadata */}
          <div className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
              Title Page & Editorial Metadata
            </h4>

            <div>
              <label
                htmlFor="meta-title"
                className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
              >
                Full Article Title
              </label>
              <input
                id="meta-title"
                  placeholder="Your article title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
              />
            </div>

            <div>
              <label
                htmlFor="meta-running-head"
                className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
              >
                Running Head (Max 50 Characters)
              </label>
              <input
                id="meta-running-head"
                  placeholder="Short title for page headers"
                type="text"
                maxLength={50}
                value={runningHead}
                onChange={(e) => setRunningHead(e.target.value)}
                className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="meta-author"
                  className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
                >
                  Author Name(s)
                </label>
                <input
                  id="meta-author"
                  placeholder="Your full name"
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              </div>

              <div>
                <label
                  htmlFor="meta-orcid"
                  className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
                >
                  ORCID iD
                </label>
                <input
                  id="meta-orcid"
                  placeholder="0000-0000-0000-0000"
                  type="text"
                  value={orcid}
                  onChange={(e) => setOrcid(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="meta-affil"
                  className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
                >
                  Institutional Affiliation
                </label>
                <input
                  id="meta-affil"
                  placeholder="Department, institution, city, country"
                  type="text"
                  value={affiliation}
                  onChange={(e) => setAffiliation(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              </div>

              <div>
                <label
                  htmlFor="meta-email"
                  className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
                >
                  Corresponding Email
                </label>
                <input
                  id="meta-email"
                  placeholder="Corresponding author email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="meta-keywords"
                className="block text-[11px] font-bold text-[color:var(--text-primary)] mb-1"
              >
                Keywords (5–7 Comma-Separated)
              </label>
              <input
                id="meta-keywords"
                  placeholder="4–6 keywords, separated by commas"
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]"
              />
            </div>
          </div>

          {/* 1-Click Submission Downloads */}
          <div className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
              1-Click Submission Package Downloads
            </h4>

            {/* Download Journal Manuscript (.docx) */}
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={handleDownloadDocx}
              className="w-full py-2.5 px-4 rounded-lg bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 font-bold text-xs flex items-center justify-between transition shadow-sm disabled:opacity-50"
            >
              <span>Download Journal Manuscript (.docx)</span>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
                Word AST • Dedicated Title Page
              </span>
            </button>

            {/* Download Camera-Ready (.pdf) */}
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={handleDownloadPdf}
              className="w-full py-2.5 px-4 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] hover:border-[color:var(--border-strong)] text-[color:var(--text-primary)] font-bold text-xs flex items-center justify-between transition disabled:opacity-50"
            >
              <span>Download Camera-Ready Manuscript (.pdf)</span>
              <span className="text-[10px] text-[color:var(--text-muted)]">
                Typeset PDF
              </span>
            </button>

            {/* Download Referee Response Letter (.docx) */}
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={handleDownloadRefereeLetter}
              className="w-full py-2.5 px-4 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] hover:border-[color:var(--border-strong)] text-[color:var(--text-primary)] font-bold text-xs flex items-center justify-between transition disabled:opacity-50"
            >
              <span>Download Point-by-Point Referee Response Letter (.docx)</span>
              <span className="text-[10px] text-[color:var(--text-muted)]">
                Mode 4 Rebuttal Letter
              </span>
            </button>

            {/* Secondary Formats */}
            <div className="border-t border-[color:var(--border-control)] pt-3 mt-1">
              <div className="text-[11px] font-bold text-[color:var(--text-muted)] mb-2">
                Secondary Formats:
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickExport("latex")}
                  className="py-1.5 px-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] text-xs font-semibold hover:border-[color:var(--border-strong)] transition"
                >
                  LaTeX (.tex)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExport("typst")}
                  className="py-1.5 px-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] text-xs font-semibold hover:border-[color:var(--border-strong)] transition"
                >
                  Typst (.typ)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickExport("markdown")}
                  className="py-1.5 px-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] text-xs font-semibold hover:border-[color:var(--border-strong)] transition"
                >
                  Markdown (.md)
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
