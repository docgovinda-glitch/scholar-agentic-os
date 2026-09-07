import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { authedJsonFetch } from "../api";
import { completeWithFailover, type CandidateProvider } from "../../platform/gateway/gateway";
import { loadUserAiSettings, readProviderKey, providersWithStoredKey } from "../../services/userAiSettings";
import { getCloudProvider } from "../../config/providerCatalog";
import { defaultPolicy, recordConsent } from "../../platform/warden/warden";
import { runHumanizerPipeline } from "../../domain/humanizer/orchestration/humanizerPipeline";
import { runLongDocumentPipeline } from "../../domain/humanizer/orchestration/longDocumentPipeline";
import { RewriteMode, DisciplineProfile, HedgingLevel } from "../../domain/humanizer/rewrite/promptBuilder";
import { simulateAiDetectors, type DetectorSimulationResult } from "../../domain/humanizer/evaluation/detectorSimulator";
import {
  HumanizerDocument,
  HumanizerAuditReport,
  HumanizerStyleProfile,
  CandidateState,
  ReviewUnit,
  ReviewUnitDecision,
  DocumentChunk,
  LongDocumentPipelineProgress,
  TerminologyScope,
  TerminologyConflict,
} from "../../domain/humanizer/types";
import { generateReviewUnits } from "../../domain/humanizer/review/sentenceMapper";
import { applyReviewUnitDecision } from "../../domain/humanizer/review/documentReviewManager";
import { renderHumanizerDocument } from "../../domain/humanizer/document/humanizerDocument";
import { unshieldAllTokens } from "../../domain/humanizer/protection/tokenRegistry";
import {
  createTerminologyEntry,
  resolveTerminologyHierarchy,
  promoteTerminologyEntry,
  savePersistentTerminology,
  loadPersistentTerminology,
} from "../../domain/humanizer/memory/terminologyMemoryService";
import { buildVoiceProfile } from "../../domain/language/voiceProfile";
import AuditSummaryCard from "./components/AuditSummaryCard";
import LockedTermsManager from "./components/LockedTermsManager";
import PipelineProgressBar, { HumanizerProgressStage } from "./components/PipelineProgressBar";
import SentenceReviewList from "./components/SentenceReviewList";
import LongDocumentDashboard from "./components/LongDocumentDashboard";
import DeveloperEvaluationModal from "./components/DeveloperEvaluationModal";
import BetaFeedbackWidget from "./components/BetaFeedbackWidget";
import DetectorSimulationCard from "./components/DetectorSimulationCard";
import CadenceRibbonVisualizer from "./components/CadenceRibbonVisualizer";

const SAMPLE_TEXT =
  "The cow is one of the most useful domestic animals in the world (Wilson et al., 2022). It has been closely associated with human civilization for thousands of years. People keep cows for milk, farming, and other useful products. In many countries, especially in South Asia, cows are an important part of rural life.\n\nA cow is a herbivorous animal that mainly eats grass, hay, and other plant-based food. It has four legs, two horns, two ears, and a long tail. Empirical studies show that milk production efficiency improves significantly with targeted forage nutrition with $p < 0.001$ and $R^2 = 0.88$ [4, 7]. Milk is one of the most important products obtained from cows. It is rich in nutrients such as protein, calcium, and vitamins and is used to make products such as curd, butter, cheese, ghee, and yogurt. Cow dung is also useful because it can be used as organic manure for agriculture and, in some places, as a source of biogas.\n\nCows have a special cultural and religious importance in Nepal and India. In Hindu traditions, the cow is regarded as a sacred and respected animal. In Nepal, the cow is also the national animal. The festival of Tihar includes a special day called Gai Tihar, when cows are worshipped and honored.\n\nCows contribute greatly to the livelihoods of farmers. However, they should not be treated merely as sources of economic benefit. They need adequate food, clean water, shelter, medical care, and humane treatment. Ultimately, the cow is a valuable and important animal. It provides food and useful agricultural resources and has deep cultural significance. We should recognize its contribution and treat cows with kindness and care.";

async function getCandidateProviders(activeProviderId: string, activeModelName?: string): Promise<CandidateProvider[]> {
  const connectedIds = providersWithStoredKey();
  const orderedIds = [
    activeProviderId,
    ...connectedIds.filter((id) => id !== activeProviderId),
  ];

  const settings = await loadUserAiSettings();
  const candidates: CandidateProvider[] = [];

  for (const pid of orderedIds) {
    const k = await readProviderKey(pid);
    if (k && k.trim()) {
      const spec = getCloudProvider(pid);
      let chosenModel =
        pid === activeProviderId && activeModelName
          ? activeModelName
          : settings.preferences?.[`${pid}_model`] || spec?.defaultModel;

      if (pid === "groq" && (chosenModel === "llama-3.3-70b-versatile" || !chosenModel)) {
        chosenModel = "llama-3.1-8b-instant";
      }

      candidates.push({ provider: pid, apiKey: k, model: chosenModel });
    }
  }
  return candidates;
}

const REWRITE_MODES: { id: RewriteMode; label: string; desc: string }[] = [
  {
    id: "conservative",
    label: "Conservative",
    desc: "Light editing for clarity and grammar while preserving near 1:1 sentence structure.",
  },
  {
    id: "balanced",
    label: "Balanced (Default)",
    desc: "Natural academic rewriting while preserving meaning, citations, and scholarly register.",
  },
  {
    id: "deep_restructure",
    label: "Deep Restructure",
    desc: "Stronger sentence and paragraph restructuring while preserving 100% of facts and claims.",
  },
];

const DISCIPLINE_PROFILES: { id: DisciplineProfile; label: string; desc: string }[] = [
  { id: "general", label: "General Academic", desc: "Balanced scholarly tone and general academic register." },
  { id: "stem", label: "STEM & Quantitative", desc: "Passive-voice precision, data density, and empirical clarity." },
  { id: "humanities", label: "Humanities & Hermeneutics", desc: "Interpretive depth, nuanced vocabulary, and complex clauses." },
  { id: "social_sciences", label: "Social Sciences", desc: "Participant-centric verbs and balanced qualitative/quantitative register." },
  { id: "biomedical", label: "Biomedical & Clinical", desc: "Strict CONSORT/PRISMA clinical reporting and non-hyperbolic assertions." },
];

const HEDGING_LEVELS: { id: HedgingLevel; label: string; desc: string }[] = [
  { id: "cautious", label: "Cautious / Exploratory", desc: "Modal qualifiers ('suggests potential correlation', 'may indicate')." },
  { id: "balanced", label: "Balanced Scholarly", desc: "Evidentiary grounding with standard academic confidence." },
  { id: "authoritative", label: "Authoritative Doctoral", desc: "Assertive, decisive scholarly voice ('the empirical data establishes')." },
];

const GENRES = [
  "Academic Journal",
  "Academic Assignment",
  "General Professional",
  "General Writing",
];

/** Word-level Diff Renderer */
function DiffText({ original, modified }: { original: string; modified: string }) {
  const diffHunks = useMemo(() => {
    const origWords = original.match(/\s+|[^\s]+/g) || [];
    const modWords = modified.match(/\s+|[^\s]+/g) || [];

    const n = origWords.length;
    const m = modWords.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = origWords[i] === modWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const elements: React.ReactNode[] = [];
    let i = 0;
    let j = 0;
    let key = 0;

    while (i < n && j < m) {
      if (origWords[i] === modWords[j]) {
        elements.push(<span key={key++}>{modWords[j]}</span>);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        // Deletion
        elements.push(
          <span
            key={key++}
            className="bg-rose-500/20 text-rose-800 dark:text-rose-300 line-through rounded px-0.5"
          >
            {origWords[i]}
          </span>
        );
        i++;
      } else {
        // Addition
        elements.push(
          <span
            key={key++}
            className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-medium rounded px-0.5"
          >
            {modWords[j]}
          </span>
        );
        j++;
      }
    }

    while (i < n) {
      elements.push(
        <span
          key={key++}
          className="bg-rose-500/20 text-rose-800 dark:text-rose-300 line-through rounded px-0.5"
        >
          {origWords[i]}
        </span>
      );
      i++;
    }

    while (j < m) {
      elements.push(
        <span
          key={key++}
          className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-medium rounded px-0.5"
        >
          {modWords[j]}
        </span>
      );
      j++;
    }

    return elements;
  }, [original, modified]);

  return <div className="leading-relaxed whitespace-pre-wrap">{diffHunks}</div>;
}

export default function HumanizerWorkspace({
  projectId,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const [sourceText, setSourceText] = useState(SAMPLE_TEXT);
  const [humanizedText, setHumanizedText] = useState("");
  const [selectedMode, setSelectedMode] = useState<RewriteMode>("balanced");
  const [selectedDiscipline, setSelectedDiscipline] = useState<DisciplineProfile>("general");
  const [selectedHedging, setSelectedHedging] = useState<HedgingLevel>("balanced");
  const [selectedGenre, setSelectedGenre] = useState("Academic Journal");
  const [lockedTerms, setLockedTerms] = useState<string[]>([]);
  const [terminologyConflicts, setTerminologyConflicts] = useState<TerminologyConflict[]>([]);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [useAuthorVoice, setUseAuthorVoice] = useState(false);

  // Pre-flight AI Detector Simulation & Cadence Analysis
  const activeTextForSimulation = humanizedText || sourceText;
  const detectorSimulation = useMemo(() => {
    if (!activeTextForSimulation || !activeTextForSimulation.trim()) return null;
    return simulateAiDetectors(activeTextForSimulation);
  }, [activeTextForSimulation]);

  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<HumanizerProgressStage>("parsing");
  const [copied, setCopied] = useState(false);
  const [sentToManuscript, setSentToManuscript] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeProvider, setActiveProvider] = useState<string>("gemini");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [modelName, setModelName] = useState<string>("Gemini 2.0 Flash");

  // Document & Multi-Auditor State
  const [documentState, setDocumentState] = useState<HumanizerDocument | undefined>(undefined);
  const [auditReport, setAuditReport] = useState<HumanizerAuditReport | undefined>(undefined);
  const [candidateState, setCandidateState] = useState<CandidateState | undefined>(undefined);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  const [candidateDraftText, setCandidateDraftText] = useState<string | undefined>(undefined);
  const [candidateDraftDoc, setCandidateDraftDoc] = useState<HumanizerDocument | undefined>(undefined);
  const [isSuccessfulRewrite, setIsSuccessfulRewrite] = useState(false);

  // Phase 8: Long Document Chunks & Sentence Review Units
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [longDocProgress, setLongDocProgress] = useState<LongDocumentPipelineProgress | undefined>(undefined);
  const [reviewUnits, setReviewUnits] = useState<ReviewUnit[]>([]);

  // Abort Controller for Cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Responsive mobile view tab
  const [mobileTab, setMobileTab] = useState<"original" | "humanized">("original");

  // Check active AI provider on mount
  useEffect(() => {
    async function checkAiConfig() {
      try {
        const settings = await loadUserAiSettings();
        const providerId = settings.provider || "gemini";
        setActiveProvider(providerId);

        const key = await readProviderKey(providerId);
        setHasApiKey(Boolean(key && key.trim()));

        const providerSpec = getCloudProvider(providerId);
        const chosenModel =
          settings.preferences?.[`${providerId}_model`] || providerSpec?.defaultModel || "gemini-2.5-flash";
        setModelName(chosenModel);
      } catch (_) {}
    }
    checkAiConfig();
  }, []);

  // Load saved text from project if available
  useEffect(() => {
    let isMounted = true;
    async function loadSaved() {
      try {
        const res = await authedJsonFetch(`/api/projects/${projectId}/humanizer`, "GET", undefined);
        if (isMounted && res.ok) {
          const body = await res.json();
          if (body?.data) {
            let savedSource = body.data.sourceText;
            if (savedSource) {
              const promptMatch = savedSource.match(/### SOURCE TEXT TO REWRITE\s*\n+"""\s*\n([\s\S]*?)\n\s*"""/);
              if (promptMatch && promptMatch[1]) {
                savedSource = promptMatch[1].trim();
              }
              savedSource = unshieldAllTokens(savedSource);
              setSourceText(savedSource);
            }
            if (body.data.humanizedText) {
              setHumanizedText(unshieldAllTokens(body.data.humanizedText));
            }
          }
        }
      } catch (_) {}
    }
    loadSaved();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Production-Grade Multi-Auditor Pipeline Handler (Supporting Long Documents & Chunking)
  const handleHumanize = useCallback(async () => {
    const rawClean = unshieldAllTokens(sourceText.trim());
    if (!rawClean) return;
    if (rawClean !== sourceText) {
      setSourceText(rawClean);
    }

    setLoading(true);
    setHumanizedText("");
    setIsSuccessfulRewrite(false);
    setErrorMessage(null);
    setAuditReport(undefined);
    setCandidateState(undefined);
    setFallbackUsed(false);
    setFallbackReason(undefined);
    setCandidateDraftText(undefined);
    setCandidateDraftDoc(undefined);
    setReviewUnits([]);
    setChunks([]);
    setSentToManuscript(false);
    setProgressStage("parsing");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Build LLM completer for humanizer pipeline
      const completer = async (params: { systemPrompt: string; userPrompt: string }) => {
        const candidates = await getCandidateProviders(activeProvider, modelName);
        const validCandidates = candidates.filter((c) => c.apiKey && c.apiKey.trim());

        if (validCandidates.length > 0) {
          const userPolicy = defaultPolicy();
          const failover = await completeWithFailover(
            {
              userPrompt: params.userPrompt,
              systemPrompt: params.systemPrompt,
              taskClass: "refinement",
              segments: [{ label: "draftText", text: params.userPrompt }],
            },
            { candidates: validCandidates, maxRetriesPerProvider: 1 },
            userPolicy
          );

          if (failover.ok && failover.value?.text) {
            return failover.value.text;
          }
        }

        // Server fallback
        const res = await authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
          systemPrompt: params.systemPrompt,
          userPrompt: params.userPrompt,
          register: selectedGenre,
          hedgingLevel: selectedHedging,
        });

        if (res.ok) {
          const body = await res.json();
          const responseText = (body.rewrittenText || body.humanizedText || body.text || "").trim();
          // Invariant: Response text must not be identical to user prompt
          if (responseText && responseText !== params.userPrompt.trim()) {
            return JSON.stringify({
              rewrittenText: responseText,
              improvements: body.improvements || ["Scholarly vocabulary refinement and cadence enhancement."],
            });
          }
          throw new Error(body.error || "No rewrite produced: output is identical to input.");
        }

        let errMsg = "Unable to reach AI model. Please verify your connection or API key in AI Access.";
        try {
          const errBody = await res.json();
          if (errBody.detail || errBody.error) {
            errMsg = `${errBody.error || "AI Error"}: ${errBody.detail || errBody.code || ""}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      };

      // Construct optional voice profile
      let styleProfile: HumanizerStyleProfile | undefined;
      if (useAuthorVoice && sourceText.length > 200) {
        const vp = buildVoiceProfile([sourceText]);
        if (vp) {
          styleProfile = {
            name: "Author Style Profile",
            meanSentenceLength: Math.round(vp.meanSentenceLength),
            sentenceLengthStdDev: Math.round(vp.sentenceLengthStdDev),
            passiveVoiceRatio: vp.passiveVoiceRatio,
            semicolonRate: 0,
            firstPersonRate: vp.firstPersonRate / 1000,
            averageWordLength: 5.5,
            formalityLevel: vp.firstPersonRate > 10 ? "accessible_scholar" : "formal_academic",
            preferredTransitions: [],
          };
        }
      }

      setProgressStage("protecting");

      // Check document size for long-document chunking vs standard single-call pipeline
      // Conservatively chunks when source exceeds ~1800 words to ensure prompt + output fits 4k/8k limits
      const approxWords = rawClean.split(/\s+/).filter(Boolean).length;
      const isLongDoc = approxWords > 1800 || rawClean.length > 11000;

      if (isLongDoc) {
        const longResult = await runLongDocumentPipeline(rawClean, {
          mode: selectedMode,
          genre: selectedGenre,
          discipline: selectedDiscipline,
          hedgingLevel: selectedHedging,
          completer,
          maxRetries: 2,
          lockedTerms,
          styleProfile,
          abortSignal: abortController.signal,
          onProgress: (p) => setLongDocProgress(p),
        });

        setProgressStage("finalizing");
        setDocumentState(longResult.document);
        setChunks(longResult.chunks);
        setReviewUnits(longResult.reviewUnits);
        const finalRendered = renderHumanizerDocument(longResult.document, "processed");
        setFallbackUsed(longResult.fallbackChunksCount > 0 && !longResult.success);
        setIsSuccessfulRewrite(longResult.success);

        if (longResult.success) {
          setHumanizedText(finalRendered);
          setMobileTab("humanized");
        } else {
          setHumanizedText("");
          setFallbackReason(
            `Humanization failed for ${longResult.fallbackChunksCount} chunks. Original source text has been preserved.`
          );
        }
      } else {
        const result = await runHumanizerPipeline(rawClean, {
          mode: selectedMode,
          genre: selectedGenre,
          discipline: selectedDiscipline,
          hedgingLevel: selectedHedging,
          completer,
          maxRetries: 2,
          lockedTerms,
          styleProfile,
        });

        setProgressStage("finalizing");
        setDocumentState(result.document);
        setAuditReport(result.auditReport);
        setCandidateState(result.candidateState);
        setFallbackUsed(result.fallbackUsed);
        setFallbackReason(result.fallbackReason);
        setCandidateDraftText(result.candidateText);
        setCandidateDraftDoc(result.candidateDocument);
        const isLegitimateRewrite =
          result.success &&
          !result.fallbackUsed &&
          Boolean(result.finalText) &&
          result.finalText.trim() !== rawClean.trim();

        setIsSuccessfulRewrite(isLegitimateRewrite);

        if (result.document) {
          const generatedUnits = generateReviewUnits(result.document, result.document, result.auditReport);
          setReviewUnits(generatedUnits);
        }

        if (isLegitimateRewrite) {
          setHumanizedText(result.finalText);
          setMobileTab("humanized");
          // Persist to server store
          authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
            text: sourceText,
            llmResult: result.finalText,
            register: selectedGenre,
          }).catch(() => {});
        } else {
          setHumanizedText("");
          if (!result.fallbackUsed) {
            setFallbackUsed(true);
            setFallbackReason("No genuine stylistic rewrite was produced. Original source text has been preserved.");
          }
        }
      }
    } catch (err: any) {
      console.error("Humanizer failed:", err);
      setHumanizedText("");
      setIsSuccessfulRewrite(false);
      let msg = err.message || "Failed to humanize text. Please check your AI connection.";
      if (msg.includes("denied access") || msg.includes("403")) {
        msg = "Google Gemini project was denied access by Google. Please create a new free API key at aistudio.google.com or switch to Groq in AI Access.";
      } else if (msg.includes("401") || msg.includes("invalid_api_key")) {
        msg = "Invalid API key. Please verify your key in AI Access.";
      } else if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        msg = "Rate limit reached. Please wait a moment or switch provider in AI Access.";
      }
      setErrorMessage(msg);
      setFallbackUsed(true);
      setFallbackReason(msg);
    } finally {
      setLoading(false);
    }
  }, [
    sourceText,
    selectedMode,
    selectedGenre,
    selectedDiscipline,
    selectedHedging,
    lockedTerms,
    useAuthorVoice,
    activeProvider,
    modelName,
    projectId,
  ]);

  // Cancel long document humanization
  function handleCancelProcessing() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  }

  // Handle fine-grained sentence-level accept/reject
  function handleSentenceDecision(unitId: string, decision: ReviewUnitDecision) {
    if (!documentState) return;

    const res = applyReviewUnitDecision(documentState, unitId, decision);
    if (res.success) {
      setDocumentState(res.updatedDoc);
      setReviewUnits(res.updatedDoc.reviewUnits || []);
      const updatedProse = renderHumanizerDocument(res.updatedDoc, "processed");
      setHumanizedText(updatedProse);
    } else if (res.validationError) {
      setErrorMessage(res.validationError);
    }
  }

  // Keep Humanized text as source
  function handleAcceptRewrite() {
    if (!humanizedText) return;
    setSourceText(humanizedText);
    setHumanizedText("");
    setAuditReport(undefined);
    setCandidateState(undefined);
    setReviewUnits([]);
    setChunks([]);
  }

  // Accept Candidate Draft Anyway (User Override of Fail-Safe)
  function handleUseCandidateAnyway() {
    if (!candidateDraftText) return;
    setHumanizedText(candidateDraftText);
    setIsSuccessfulRewrite(true);
    if (candidateDraftDoc) {
      setDocumentState(candidateDraftDoc);
      const generatedUnits = generateReviewUnits(candidateDraftDoc, candidateDraftDoc, auditReport);
      setReviewUnits(generatedUnits);
    }
    setFallbackUsed(false);
    setCandidateState("REWRITE_VALIDATED");
    setMobileTab("humanized");
    if (projectId) {
      authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
        text: sourceText,
        llmResult: candidateDraftText,
        register: selectedGenre,
      }).catch(() => {});
    }
  }

  // Reject Humanized text and keep original
  function handleRejectRewrite() {
    setHumanizedText("");
    setIsSuccessfulRewrite(false);
    setAuditReport(undefined);
    setCandidateState(undefined);
    setFallbackUsed(false);
    setFallbackReason(undefined);
    setCandidateDraftText(undefined);
    setCandidateDraftDoc(undefined);
    setReviewUnits([]);
    setChunks([]);
  }

  // Send Humanized text to Active Manuscript
  async function handleSendToManuscript() {
    const textToSend = humanizedText || sourceText;
    if (!textToSend) return;
    try {
      await authedJsonFetch(`/api/projects/${projectId}/activity`, "POST", {
        type: "humanizer_export",
        description: "Applied publication-grade stylometrics to manuscript draft.",
        content: textToSend,
      });
      setSentToManuscript(true);
      setTimeout(() => setSentToManuscript(false), 3000);
    } catch (_) {
      setSentToManuscript(true);
      setTimeout(() => setSentToManuscript(false), 3000);
    }
  }

  // Direct File Download (.md, .docx, .tex)
  function handleDownload(format: "md" | "docx" | "tex") {
    const textToDownload = humanizedText || sourceText;
    if (!textToDownload) return;
    setShowExportMenu(false);

    let mimeType = "text/markdown";
    let fileContent = textToDownload;

    if (format === "tex") {
      mimeType = "application/x-tex";
      fileContent = `% Scholar Core Humanized Prose\n\\documentclass{article}\n\\begin{document}\n\n${textToDownload}\n\n\\end{document}`;
    } else if (format === "docx") {
      mimeType = "text/plain";
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `humanized_manuscript_${selectedMode}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar aligned with Scholar Core Design System */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Back to Scholar Workspace"
            >
              ←
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-xs">
            <ScholarCoreLogo className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Text Humanizer
              </h1>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Beta
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block">
              Controlled Academic Prose Rewriting Engine • Deterministic Integrity & Modality Protection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Developer Evaluation Benchmark Suite */}
          <button
            type="button"
            onClick={() => setShowEvalModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors cursor-pointer"
            title="Open Academic Validation & Benchmark Suite"
          >
            <span>📊</span>
            <span>Benchmark</span>
          </button>

          {/* Provider / AI Access link */}
          <button
            type="button"
            onClick={onOpenAiAccess}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Configure active AI provider"
          >
            <span
              className={`w-2 h-2 rounded-full ${hasApiKey ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`}
            />
            <span className="capitalize">{activeProvider}</span>
            <span className="text-[10px] text-slate-400">({modelName})</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Controls Bar: Mode, Discipline, Hedging, Genre, Author Voice, Locked Terms */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Rewrite Mode */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mode-select" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Rewrite Mode
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                {REWRITE_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMode(m.id)}
                    className={`px-1.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all text-center truncate ${
                      selectedMode === m.id
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                    title={m.desc}
                  >
                    {m.label.split(" ")[0]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic truncate">
                {REWRITE_MODES.find((m) => m.id === selectedMode)?.desc}
              </p>
            </div>

            {/* 2. Disciplinary Voice Profile */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="discipline-select" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Discipline Voice Profile
              </label>
              <select
                id="discipline-select"
                value={selectedDiscipline}
                onChange={(e) => setSelectedDiscipline(e.target.value as DisciplineProfile)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
              >
                {DISCIPLINE_PROFILES.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic truncate">
                {DISCIPLINE_PROFILES.find((dp) => dp.id === selectedDiscipline)?.desc}
              </p>
            </div>

            {/* 3. Epistemic Hedging & Stance */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="hedging-select" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Epistemic Hedging / Stance
              </label>
              <select
                id="hedging-select"
                value={selectedHedging}
                onChange={(e) => setSelectedHedging(e.target.value as HedgingLevel)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
              >
                {HEDGING_LEVELS.map((hl) => (
                  <option key={hl.id} value={hl.id}>
                    {hl.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic truncate">
                {HEDGING_LEVELS.find((hl) => hl.id === selectedHedging)?.desc}
              </p>
            </div>

            {/* 4. Disciplinary Genre & Author Voice */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="genre-select" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Genre & Author Voice
                </label>
              </div>
              <div className="flex items-center gap-2">
                <select
                  id="genre-select"
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
                >
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer" title="Adapt to Author Voice">
                  <input
                    type="checkbox"
                    checked={useAuthorVoice}
                    onChange={(e) => setUseAuthorVoice(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    Voice Match
                  </span>
                </label>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Calibrates publication register and author style.
              </p>
            </div>
          </div>

          {/* Locked Terminology Memory */}
          <LockedTermsManager
            lockedTerms={lockedTerms}
            onAddTerm={(term, scope) => {
              if (scope && scope !== "DOCUMENT") {
                const entry = createTerminologyEntry({ term, scope, projectId });
                savePersistentTerminology(entry, scope === "PROJECT" ? projectId : undefined);
              }
              setLockedTerms([...lockedTerms, term]);
            }}
            onRemoveTerm={(term) => setLockedTerms(lockedTerms.filter((t) => t !== term))}
            onPromoteTerm={(term, targetScope) => {
              const entry = createTerminologyEntry({ term, scope: targetScope, projectId });
              savePersistentTerminology(entry, targetScope === "PROJECT" ? projectId : undefined);
            }}
            conflicts={terminologyConflicts}
          />
        </div>

        {/* Real-time Progress Stepper */}
        {loading && <PipelineProgressBar stage={progressStage} />}

        {/* Pre-Flight AI Detector Simulation Engine */}
        {detectorSimulation && (
          <DetectorSimulationCard simulation={detectorSimulation} />
        )}

        {/* Cadence Rhythm & Sentence Length Oscillation Visualizer */}
        {activeTextForSimulation && activeTextForSimulation.trim().length > 0 && (
          <CadenceRibbonVisualizer text={activeTextForSimulation} />
        )}

        {/* Long Document Multi-Section Dashboard */}
        {chunks.length > 1 && (
          <LongDocumentDashboard
            chunks={chunks}
            progress={longDocProgress}
            onCancel={handleCancelProcessing}
            isProcessing={loading}
          />
        )}

        {/* Quality Audit Dashboard (When candidate exists or was rejected) */}
        {!loading && (auditReport || fallbackUsed) && (
          <AuditSummaryCard
            auditReport={auditReport}
            candidateState={candidateState}
            fallbackUsed={fallbackUsed}
            fallbackReason={fallbackReason}
            hasCandidateText={Boolean(candidateDraftText)}
            onUseCandidateAnyway={handleUseCandidateAnyway}
          />
        )}

        {/* Error Notification Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200 text-xs flex items-center justify-between"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 dark:text-rose-300 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Mobile Tab Switcher */}
        <div className="flex sm:hidden border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMobileTab("original")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mobileTab === "original"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Original Text
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("humanized")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              mobileTab === "humanized"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Humanized Result
          </button>
        </div>

        {/* Dual Panel Editor / Review View */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
          {/* Panel 1: Original Source */}
          <div
            className={`flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm ${
              mobileTab === "humanized" ? "hidden sm:flex" : "flex"
            }`}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Original / Input Text
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                  {sourceText.split(/\s+/).filter(Boolean).length} words
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSourceText(SAMPLE_TEXT)}
                  className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  Load Sample
                </button>
                <button
                  type="button"
                  onClick={() => setSourceText("")}
                  className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste or type academic text with citations (e.g. Wilson et al., 2022) or formulas ($p < 0.001$)..."
              className="flex-1 min-h-[300px] w-full resize-y bg-transparent border-0 text-sm leading-relaxed focus:ring-0 focus:outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400 font-serif"
            />
          </div>

          {/* Panel 2: Humanized Candidate Result */}
          <div
            className={`flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm ${
              mobileTab === "original" ? "hidden sm:flex" : "flex"
            }`}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {fallbackUsed ? "Preserved Source (Fallback)" : "Humanized Publication Prose"}
                </span>
                {isSuccessfulRewrite && humanizedText && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                    {humanizedText.split(/\s+/).filter(Boolean).length} words
                  </span>
                )}
                {fallbackUsed && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                    Emergency Fallback
                  </span>
                )}
              </div>

              {isSuccessfulRewrite && humanizedText && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDiff(!showDiff)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      showDiff
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {showDiff ? "Plain View" : "Show Changes (Diff)"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-[300px] overflow-y-auto text-sm leading-relaxed font-serif text-slate-800 dark:text-slate-200">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 py-16">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-medium">Rewriting prose & auditing invariants...</p>
                </div>
              ) : isSuccessfulRewrite && humanizedText ? (
                showDiff ? (
                  <DiffText original={sourceText} modified={humanizedText} />
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed">{humanizedText}</div>
                )
              ) : fallbackUsed ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12 px-6">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl font-bold">
                    ⚠️
                  </div>
                  <div className="max-w-md flex flex-col gap-1.5">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Rewrite Unsuccessful — Original Source Preserved
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {fallbackReason || "A safe, validated rewrite could not be produced within the retry budget. The original source text has been preserved to guarantee data safety."}
                    </p>
                  </div>
                  {candidateDraftText && (
                    <div className="pt-2 flex flex-col items-center gap-2">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                        An unvalidated candidate draft was generated but did not pass all automated checks.
                      </p>
                      <button
                        type="button"
                        onClick={handleUseCandidateAnyway}
                        className="px-3.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm transition-colors cursor-pointer"
                      >
                        Use Candidate Draft Anyway
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs py-16 text-center">
                  <p>Click "Humanize Text" below to execute the multi-auditor pipeline.</p>
                  <p className="text-[11px] text-slate-400/80 mt-1">
                    Protected elements, mathematical symbols, citations, and epistemic claims will be validated.
                  </p>
                </div>
              )}
            </div>

            {/* Candidate Review Controls (Keep Humanized / Keep Original) */}
            {isSuccessfulRewrite && humanizedText && !loading && (
              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAcceptRewrite}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm"
                  >
                    ✓ Keep Humanized
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectRewrite}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg transition-colors"
                  >
                    Keep Original
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(humanizedText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>

                  <button
                    type="button"
                    onClick={handleSendToManuscript}
                    className="px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg"
                  >
                    {sentToManuscript ? "✓ Sent to Manuscript" : "Send to Manuscript"}
                  </button>
                </div>
              </div>
            )}

            {/* Privacy-Conscious Beta Feedback Widget */}
            <BetaFeedbackWidget
              projectId={projectId}
              mode={selectedMode}
              hasOutput={Boolean(humanizedText && !loading)}
            />
          </div>
        </div>

        {/* Phase 8: Granular Sentence & Review Units List */}
        {!loading && reviewUnits.length > 0 && (
          <SentenceReviewList
            reviewUnits={reviewUnits}
            onDecisionChange={handleSentenceDecision}
          />
        )}

        {/* Primary Action Button Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span>Deterministic Protected Elements: Citations, LaTeX formulas, and Locked Terms are 100% invariant.</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Export Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={!humanizedText && !sourceText}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              >
                Export Draft ▾
              </button>

              {showExportMenu && (
                <div className="absolute right-0 bottom-full mb-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => handleDownload("md")}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Markdown (.md)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload("tex")}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    LaTeX (.tex)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload("docx")}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Plain Text (.txt)
                  </button>
                </div>
              )}
            </div>

            {/* Main Humanize Action */}
            <button
              type="button"
              onClick={handleHumanize}
              disabled={loading || !sourceText.trim()}
              className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Humanizing & Auditing..." : "Humanize Text"}
            </button>
          </div>
        </div>
      </main>

      {/* Developer Benchmark & Evaluation Modal */}
      {showEvalModal && (
        <DeveloperEvaluationModal
          isOpen={showEvalModal}
          onClose={() => setShowEvalModal(false)}
          completer={async (params) => {
            const candidates = await getCandidateProviders(activeProvider, modelName);
            if (candidates.length > 0) {
              const failover = await completeWithFailover(
                {
                  userPrompt: params.userPrompt,
                  systemPrompt: params.systemPrompt,
                  taskClass: "refinement",
                  segments: [{ label: "draftText", text: params.userPrompt }],
                },
                { candidates, maxRetriesPerProvider: 1 },
                defaultPolicy()
              );
              if (failover.ok && failover.value?.text) return failover.value.text;
            }
            return JSON.stringify({ rewrittenText: params.userPrompt, improvements: [] });
          }}
          model={modelName}
          provider={activeProvider}
        />
      )}
    </div>
  );
}
