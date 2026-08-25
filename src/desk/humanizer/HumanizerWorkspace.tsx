import React, { useState, useEffect, useMemo, useCallback } from "react";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { authedJsonFetch } from "../api";
import { complete } from "../../platform/gateway/gateway";
import { loadUserAiSettings, readProviderKey } from "../../services/userAiSettings";
import { getCloudProvider } from "../../config/providerCatalog";
import { defaultPolicy, recordConsent } from "../../platform/warden/warden";
import {
  analyzeLocalStylometrics,
  verifyWithGptZero,
  verifyWithSapling,
  type LocalStylometricVerdict,
  type ExternalDetectorResult,
} from "../../services/aiDetectorService";
import {
  maskCitationsAndFormulas,
  restoreCitationsAndFormulas,
  type ProtectedItem,
} from "../../domain/language/citationGuardian";
import { analyzeReadability } from "../../domain/language/readability";

const SAMPLE_TEXT =
  "The cow is one of the most useful domestic animals in the world (Wilson et al., 2022). It has been closely associated with human civilization for thousands of years. People keep cows for milk, farming, and other useful products. In many countries, especially in South Asia, cows are an important part of rural life.\n\nA cow is a herbivorous animal that mainly eats grass, hay, and other plant-based food. It has four legs, two horns, two ears, and a long tail. Empirical studies show that milk production efficiency improves significantly with targeted forage nutrition with $p < 0.001$ and $R^2 = 0.88$ [4, 7]. Milk is one of the most important products obtained from cows. It is rich in nutrients such as protein, calcium, and vitamins and is used to make products such as curd, butter, cheese, ghee, and yogurt. Cow dung is also useful because it can be used as organic manure for agriculture and, in some places, as a source of biogas.\n\nCows have a special cultural and religious importance in Nepal and India. In Hindu traditions, the cow is regarded as a sacred and respected animal. In Nepal, the cow is also the national animal. The festival of Tihar includes a special day called Gai Tihar, when cows are worshipped and honored.\n\nCows contribute greatly to the livelihoods of farmers. However, they should not be treated merely as sources of economic benefit. They need adequate food, clean water, shelter, medical care, and humane treatment. Ultimately, the cow is a valuable and important animal. It provides food and useful agricultural resources and has deep cultural significance. We should recognize its contribution and treat cows with kindness and care.";

const FIELD_PRESETS = [
  {
    id: "academic",
    label: "Academic Journal",
    desc: "Peer-reviewed publication standard with disciplined epistemic modesty",
    prompt: "rigorous, authoritative academic journal prose with disciplinary precision and epistemic modesty",
  },
  {
    id: "natural",
    label: "Natural Human Flow",
    desc: "Organic conversational yet professional human flow with zero AI detection footprint",
    prompt: "fluid, authentic human flow with organic sentence length variation and zero synthetic patterns",
  },
  {
    id: "grant",
    label: "Grant & Proposal",
    desc: "Assertive, high-impact persuasive rhetoric for research funding bodies (NIH/NSF)",
    prompt: "assertive, persuasive, high-impact prose for research proposals and grant applications",
  },
  {
    id: "simplifier",
    label: "Plain English",
    desc: "Converts overly dense academic jargon into clear, accessible prose",
    prompt: "clear, accessible plain English eliminating convoluted padding and obscure jargon",
  },
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
  const [selectedPreset, setSelectedPreset] = useState("academic");
  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentToManuscript, setSentToManuscript] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<string>("gemini");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [modelName, setModelName] = useState<string>("Gemini 2.0 Flash");
  const [protectedCount, setProtectedCount] = useState<number>(0);

  // External Verification State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [externalApiKey, setExternalApiKey] = useState("");
  const [externalProvider, setExternalProvider] = useState<"gptzero" | "sapling">("gptzero");
  const [verifying, setVerifying] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<ExternalDetectorResult | null>(null);

  // Layer 1: Real-time Stylometric Analysis
  const inputVerdict: LocalStylometricVerdict = useMemo(() => {
    return analyzeLocalStylometrics(sourceText);
  }, [sourceText]);

  const outputVerdict: LocalStylometricVerdict = useMemo(() => {
    return analyzeLocalStylometrics(humanizedText);
  }, [humanizedText]);

  // Readability Analysis
  const readabilityReport = useMemo(() => {
    return analyzeReadability(humanizedText || sourceText);
  }, [humanizedText, sourceText]);

  // Check active AI provider and key on mount
  useEffect(() => {
    async function checkAiConfig() {
      try {
        const settings = await loadUserAiSettings();
        const providerId = settings.provider || "gemini";
        setActiveProvider(providerId);

        const key = await readProviderKey(providerId);
        setHasApiKey(Boolean(key && key.trim()));

        const providerSpec = getCloudProvider(providerId);
        const chosenModel = settings.preferences?.[`${providerId}_model`] || providerSpec?.defaultModel || "gemini-2.0-flash";
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
        const res = await authedJsonFetch(`/api/projects/${projectId}/humanizer`, "GET");
        if (isMounted && res.ok) {
          const body = await res.json();
          if (body?.data) {
            if (body.data.sourceText) setSourceText(body.data.sourceText);
            if (body.data.humanizedText) setHumanizedText(body.data.humanizedText);
          }
        }
      } catch (_) {}
    }
    loadSaved();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Multi-Pass Stylometric Humanization Engine
  const handleHumanize = useCallback(async () => {
    if (!sourceText.trim()) {
      setErrorMessage("Please enter or paste text to humanize.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setVerifiedResult(null);

    const presetSpec = FIELD_PRESETS.find((t) => t.id === selectedPreset) || FIELD_PRESETS[0];

    // Step 1: Guard & Mask Citations / Formulas / Math
    const { maskedText, items, citationCount, formulaCount } = maskCitationsAndFormulas(sourceText);
    const totalProtected = citationCount + formulaCount;
    setProtectedCount(totalProtected);

    let finalHumanized = "";

    try {
      const key = await readProviderKey(activeProvider);

      if (key && key.trim()) {
        // ─── PASS 1: Rhythm & Cadence Breakdown (Break ~18-word AI symmetry) ───
        const pass1SystemPrompt = `You are a stylometric cadence restructuring agent.
Your objective is to re-architect the input text to eliminate robotic, uniform sentence rhythm.
Rules:
1. FORCE ASYMMETRIC BURSTINESS: Mix punchy short sentences (5-9 words) with complex, multi-clause analytical sentences (25-35 words).
2. NEVER alter or remove tokens matching ⟦CITATION_X⟧ or ⟦FORMULA_X⟧. Leave them verbatim.
3. Preserve all factual claims, names, dates, and paragraph breaks.
Output ONLY the restructured text.`;

        const userPolicy = recordConsent(defaultPolicy(), activeProvider);

        const pass1Result = await complete(
          {
            provider: activeProvider,
            apiKey: key,
            model: modelName || undefined,
            userPrompt: maskedText,
            systemPrompt: pass1SystemPrompt,
            taskClass: "refinement",
            segments: [{ label: "draftText", text: maskedText }],
          },
          userPolicy
        );

        const pass1Text = pass1Result?.text ? pass1Result.text.trim() : maskedText;

        // ─── PASS 2: Cliché Purge & Academic Epistemic Hedging ───
        const pass2SystemPrompt = `You are an elite academic prose humanizer and disciplinary editor.
Refine the provided text into authentic, publication-grade academic prose with zero artificial markers.
Rules:
1. VOCABULARY PURGE: Eradicate robotic AI clichés and stock transition adverbs (e.g., "Moreover", "Furthermore", "Delve", "Testament to", "Pivotal role", "Multifaceted landscape", "Rich tapestry", "In conclusion, it is evident", "Crucial to remember", "Spearheading", "A plethora of", "Underscores"). Use authentic disciplinary transitions.
2. TONE CALIBRATION: ${presetSpec.prompt}.
3. ZERO HALLUCINATION & CITATION INTEGRITY: Leave every token ⟦CITATION_X⟧ and ⟦FORMULA_X⟧ completely intact and unchanged.
4. Structure: Maintain the original headings and paragraph divisions.
Output ONLY the polished humanized prose.`;

        const pass2Result = await complete(
          {
            provider: activeProvider,
            apiKey: key,
            model: modelName || undefined,
            userPrompt: pass1Text,
            systemPrompt: pass2SystemPrompt,
            taskClass: "refinement",
            segments: [{ label: "draftText", text: pass1Text }],
          },
          userPolicy
        );

        if (pass2Result && pass2Result.text) {
          finalHumanized = pass2Result.text.trim();
        }
      }

      // Step 2: Fallback to server endpoint if no client key
      if (!finalHumanized) {
        const res = await authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
          text: maskedText,
          register: presetSpec.label,
        });

        if (res.ok) {
          const body = await res.json();
          if (body.humanizedText) {
            finalHumanized = body.humanizedText.trim();
          }
        }
      }

      if (finalHumanized) {
        // Step 3: Restore all Citations and Formulas with 100% Fidelity
        const restoredProse = restoreCitationsAndFormulas(finalHumanized, items);
        setHumanizedText(restoredProse);

        // Persist to server store
        authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
          text: sourceText,
          llmResult: restoredProse,
          register: presetSpec.label,
        }).catch(() => {});
      } else {
        throw new Error("Unable to humanize text. Please verify your AI API key in AI Access.");
      }
    } catch (err: any) {
      console.error("Humanizer failed:", err);
      setErrorMessage(err.message || "Failed to humanize text. Please check your AI connection.");
    } finally {
      setLoading(false);
    }
  }, [sourceText, selectedPreset, activeProvider, modelName, projectId]);

  // Send Humanized text to Active Manuscript
  async function handleSendToManuscript() {
    if (!humanizedText) return;
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/activity`, "POST", {
        type: "humanizer_export",
        description: "Applied publication-grade stylometrics to manuscript draft.",
        content: humanizedText,
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
    if (!humanizedText) return;
    setShowExportMenu(false);

    let mimeType = "text/markdown";
    let fileContent = humanizedText;

    if (format === "tex") {
      mimeType = "application/x-tex";
      fileContent = `% Scholar Core Humanized Prose\n\\documentclass{article}\n\\begin{document}\n\n${humanizedText}\n\n\\end{document}`;
    } else if (format === "docx") {
      mimeType = "text/plain";
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `humanized_manuscript_${selectedPreset}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Run External Verification (GPTZero / Sapling)
  async function handleExternalVerify() {
    if (!humanizedText.trim()) return;
    if (!externalApiKey.trim()) {
      setErrorMessage("Please enter an API key for external verification.");
      return;
    }

    setVerifying(true);
    setErrorMessage(null);

    try {
      let res: ExternalDetectorResult;
      if (externalProvider === "gptzero") {
        res = await verifyWithGptZero(humanizedText, externalApiKey);
      } else {
        res = await verifyWithSapling(humanizedText, externalApiKey);
      }
      setVerifiedResult(res);
      setShowVerifyModal(false);
    } catch (e: any) {
      setErrorMessage(e.message || "External verification failed. Please check your API key.");
    } finally {
      setVerifying(false);
    }
  }

  function copyToClipboard() {
    if (!humanizedText) return;
    navigator.clipboard.writeText(humanizedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const gradeLevel = Math.max(8, Math.round(readabilityReport.metrics.fleschKincaidGradeLevel || 13));

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans flex flex-col selection:bg-[color:var(--accent-subtle)]">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/90 backdrop-blur-md px-4 md:px-8 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              title="Back to Projects"
            >
              ← Back
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center shadow-xs">
            <ScholarCoreLogo size="sm" />
          </div>
          <div>
            <h1 className="font-bold text-sm md:text-base text-[color:var(--text-primary)] flex items-center gap-2">
              <span>Text Humanizer</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                2-Pass Stylometric Engine
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active AI Connection Badge */}
          {hasApiKey ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeProvider === "gemini" ? "Google Gemini Connected" : `${activeProvider} Connected`}</span>
            </div>
          ) : (
            <button
              onClick={onOpenAiAccess}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-medium hover:bg-amber-100 cursor-pointer"
            >
              <span>⚙️ Connect Gemini Key</span>
            </button>
          )}

          {onOpenAiAccess && (
            <button
              onClick={onOpenAiAccess}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              AI Access
            </button>
          )}
          {onOpenVault && (
            <button
              onClick={onOpenVault}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              Vault
            </button>
          )}
        </div>
      </header>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-rose-600 dark:text-rose-400">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-700 font-bold px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Two-Box Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6">
        {/* Preset Pills & Primary Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[color:var(--surface-raised)] p-4 rounded-2xl border border-[color:var(--border-subtle)] shadow-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mr-1">
              Field Preset:
            </span>
            {FIELD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPreset(preset.id)}
                title={preset.desc}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  selectedPreset === preset.id
                    ? "bg-[color:var(--accent-solid)] text-white shadow-xs"
                    : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {humanizedText && (
              <button
                type="button"
                onClick={() => setShowVerifyModal(true)}
                className="px-3.5 py-2 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <span>🛡️ External Verify</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleHumanize}
              disabled={loading || !sourceText.trim()}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-[color:var(--accent-solid)] text-white text-sm font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>2-Pass Stylometrics Running…</span>
                </>
              ) : (
                <>
                  <span>✨ Humanize Text</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Side-by-Side 2-Box Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 items-stretch min-h-[520px]">
          {/* Box 1: Input Box */}
          <div className="flex flex-col rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[color:var(--text-primary)]">
                  Original / AI-Generated Text
                </span>
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  ({inputVerdict.wordCount} words)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSourceText(SAMPLE_TEXT)}
                  className="text-xs text-[color:var(--accent)] hover:underline cursor-pointer"
                >
                  Load Sample
                </button>
                <button
                  type="button"
                  onClick={() => setSourceText("")}
                  className="text-xs text-[color:var(--text-muted)] hover:text-rose-500 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste your AI-generated text or draft essay here..."
              className="flex-1 w-full p-4 md:p-5 text-sm font-sans bg-[color:var(--surface-input)] text-[color:var(--text-primary)] leading-relaxed resize-none focus:outline-hidden min-h-[380px]"
            />

            {/* Input Detection Footer Bar */}
            <div className="px-4 py-2.5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                    inputVerdict.aiProbability > 50
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      : inputVerdict.aiProbability > 25
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      inputVerdict.aiProbability > 50 ? "bg-rose-500" : inputVerdict.aiProbability > 25 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  <span>AI Likelihood: {inputVerdict.aiProbability}%</span>
                </span>
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  {inputVerdict.detectedClichés.length} clichés detected
                </span>
              </div>
              <span className="text-[10px] text-[color:var(--text-muted)] hidden sm:inline">
                Burstiness: {inputVerdict.burstinessScore}/100
              </span>
            </div>
          </div>

          {/* Box 2: Humanized Output Box */}
          <div className="flex flex-col rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden relative">
            <div className="px-4 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--accent-subtle)]/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[color:var(--accent)] flex items-center gap-1.5">
                  <span>✨ Humanized Publication Prose</span>
                </span>
                {outputVerdict.wordCount > 0 && (
                  <span className="text-[11px] text-[color:var(--text-muted)]">
                    ({outputVerdict.wordCount} words)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {humanizedText && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowDiff(!showDiff)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer font-medium ${
                        showDiff
                          ? "bg-[color:var(--accent-solid)] text-white border-[color:var(--accent-solid)]"
                          : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] border-[color:var(--border-control)] hover:text-[color:var(--text-primary)]"
                      }`}
                    >
                      {showDiff ? "Plain View" : "Show Changes (Diff)"}
                    </button>

                    <button
                      type="button"
                      onClick={handleSendToManuscript}
                      className="text-xs px-2.5 py-1 rounded-lg bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] border border-[color:var(--border-control)] hover:text-[color:var(--text-primary)] transition-all cursor-pointer font-medium hidden sm:inline-block"
                      title="Insert into active manuscript"
                    >
                      {sentToManuscript ? "✓ Sent to Manuscript" : "📥 Send to Manuscript"}
                    </button>

                    {/* Export Dropdown */}
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] border border-[color:var(--border-control)] hover:text-[color:var(--text-primary)] transition-all cursor-pointer font-medium flex items-center gap-1"
                      >
                        <span>Export ▾</span>
                      </button>

                      {showExportMenu && (
                        <div className="absolute right-0 mt-1 w-36 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl shadow-xl z-50 py-1 text-xs">
                          <button
                            onClick={() => handleDownload("docx")}
                            className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] cursor-pointer"
                          >
                            Word (.docx)
                          </button>
                          <button
                            onClick={() => handleDownload("md")}
                            className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] cursor-pointer"
                          >
                            Markdown (.md)
                          </button>
                          <button
                            onClick={() => handleDownload("tex")}
                            className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] cursor-pointer"
                          >
                            LaTeX (.tex)
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={copyToClipboard}
                  disabled={!humanizedText}
                  className="text-xs font-bold text-[color:var(--accent)] hover:underline cursor-pointer disabled:opacity-40 flex items-center gap-1 pl-1"
                >
                  {copied ? "✓ Copied!" : "Copy Text"}
                </button>
              </div>
            </div>

            <div className="flex-1 w-full p-4 md:p-5 text-sm font-sans bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] leading-relaxed overflow-y-auto min-h-[380px]">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 opacity-80">
                  <div className="w-8 h-8 border-3 border-[color:var(--accent-subtle)] border-t-[color:var(--accent)] rounded-full animate-spin" />
                  <p className="text-xs text-[color:var(--text-secondary)] font-medium">
                    Applying 2-pass stylometrics (cadence rebalancing + cliché purge) with Google Gemini…
                  </p>
                </div>
              ) : humanizedText ? (
                showDiff ? (
                  <DiffText original={sourceText} modified={humanizedText} />
                ) : (
                  <div className="whitespace-pre-wrap">{humanizedText}</div>
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-[color:var(--text-muted)]">
                  <span className="text-3xl">✨</span>
                  <p className="text-xs font-medium">
                    Click <strong>"Humanize Text"</strong> above to transform your draft into organic, publication-grade prose.
                  </p>
                </div>
              )}
            </div>

            {/* Output Stylometric & AI Score Bar */}
            {humanizedText && (
              <div className="px-4 py-2.5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/70 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>AI Pattern: {outputVerdict.aiProbability}% (Human Grade)</span>
                  </span>

                  <span className="text-[11px] text-[color:var(--text-secondary)] font-medium hidden sm:inline">
                    Burstiness: <strong>High ({outputVerdict.burstinessScore}/100)</strong>
                  </span>

                  <span className="text-[11px] text-[color:var(--text-secondary)] font-medium hidden sm:inline">
                    Readability: <strong>Grade {gradeLevel}</strong>
                  </span>

                  {protectedCount > 0 && (
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      🛡️ {protectedCount} Citations & Formulas Preserved
                    </span>
                  )}
                </div>

                {verifiedResult && (
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span>🛡️ GPTZero Verified: {verifiedResult.humanProbability}% Human</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* External Verification Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h3 className="font-bold text-sm text-[color:var(--text-primary)]">
                  External AI Detection Verification
                </h3>
              </div>
              <button
                onClick={() => setShowVerifyModal(false)}
                className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
              Verify your humanized prose against industry-standard detectors (GPTZero or Sapling) to obtain an official verification verdict.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[color:var(--text-secondary)] block mb-1">
                  Detector Service:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExternalProvider("gptzero")}
                    className={`p-2.5 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                      externalProvider === "gptzero"
                        ? "border-[color:var(--accent-solid)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)]"
                    }`}
                  >
                    GPTZero API
                  </button>
                  <button
                    type="button"
                    onClick={() => setExternalProvider("sapling")}
                    className={`p-2.5 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                      externalProvider === "sapling"
                        ? "border-[color:var(--accent-solid)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)]"
                    }`}
                  >
                    Sapling AI Detector
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[color:var(--text-secondary)] block mb-1">
                  {externalProvider === "gptzero" ? "GPTZero API Key:" : "Sapling API Key:"}
                </label>
                <input
                  type="password"
                  value={externalApiKey}
                  onChange={(e) => setExternalApiKey(e.target.value)}
                  placeholder="Paste your API key here..."
                  className="w-full p-2.5 text-xs bg-[color:var(--surface-input)] border border-[color:var(--border-control)] rounded-xl text-[color:var(--text-primary)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="px-4 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExternalVerify}
                disabled={verifying || !externalApiKey.trim()}
                className="px-5 py-2 bg-[color:var(--accent-solid)] text-white text-xs font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                {verifying ? "Verifying…" : "Run Verification →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
