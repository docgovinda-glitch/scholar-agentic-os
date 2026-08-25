import React, { useState, useEffect, useCallback } from "react";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { authedJsonFetch } from "../api";
import { complete } from "../../platform/gateway/gateway";
import { loadUserAiSettings, readProviderKey } from "../../services/userAiSettings";
import { getCloudProvider } from "../../config/providerCatalog";

const SAMPLE_TEXT =
  "The cow is one of the most useful domestic animals in the world. It has been closely associated with human civilization for thousands of years. People keep cows for milk, farming, and other useful products. In many countries, especially in South Asia, cows are an important part of rural life.\n\nA cow is a herbivorous animal that mainly eats grass, hay, and other plant-based food. It has four legs, two horns, two ears, and a long tail. Cows are generally gentle and calm animals. They are commonly found on farms and in villages, where they are raised by farmers. Milk is one of the most important products obtained from cows. It is rich in nutrients such as protein, calcium, and vitamins and is used to make products such as curd, butter, cheese, ghee, and yogurt. Cow dung is also useful because it can be used as organic manure for agriculture and, in some places, as a source of biogas.\n\nCows have a special cultural and religious importance in Nepal and India. In Hindu traditions, the cow is regarded as a sacred and respected animal. In Nepal, the cow is also the national animal. The festival of Tihar includes a special day called Gai Tihar, when cows are worshipped and honored.\n\nCows contribute greatly to the livelihoods of farmers. However, they should not be treated merely as sources of economic benefit. They need adequate food, clean water, shelter, medical care, and humane treatment. Ultimately, the cow is a valuable and important animal. It provides food and useful agricultural resources and has deep cultural significance. We should recognize its contribution and treat cows with kindness and care.";

const TONES = [
  { id: "academic", label: "Academic / Scholarly", prompt: "rigorous, authoritative academic prose with authentic disciplinary cadence" },
  { id: "natural", label: "Natural & Clear", prompt: "fluid, conversational yet professional human flow with varied sentence lengths" },
  { id: "formal", label: "Formal Research", prompt: "formal research-grade publication prose with precise epistemic nuance" },
  { id: "concise", label: "Concise & Direct", prompt: "direct, crisp, high-impact prose eliminating fluff and robotic padding" },
];

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
  const [selectedTone, setSelectedTone] = useState("academic");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<string>("gemini");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [modelName, setModelName] = useState<string>("Gemini 2.0 Flash");

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
      } catch (_) {
        // Fallback
      }
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

  // Main Humanize Function
  const handleHumanize = useCallback(async () => {
    if (!sourceText.trim()) {
      setErrorMessage("Please enter or paste text to humanize.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const toneSpec = TONES.find((t) => t.id === selectedTone) || TONES[0];
    let generatedHumanized = "";

    try {
      // 1. Check if user has a client-side API key (like Gemini)
      const key = await readProviderKey(activeProvider);

      if (key && key.trim()) {
        const systemPrompt = `You are an expert AI text humanizer and academic prose rewriter.
Your task is to rewrite the input text so it reads authentically like a human wrote it, eliminating any artificial or robotic patterns.

Guidelines:
1. Sentence Variation & Burstiness: Radically vary sentence structure and length. Combine short punchy observations with complex, multi-clause analytical sentences to break predictable robotic rhythms.
2. Natural Vocabulary: Eliminate robotic AI clichés (e.g., "Moreover", "Furthermore", "Delve into", "Testament to", "Plays a pivotal role", "Multifaceted landscape", "Rich tapestry", "In conclusion, it is evident", "It is crucial to remember", "A plethora of", "Spearheading"). Use varied, natural transitions and vocabulary.
3. Tone: ${toneSpec.prompt}.
4. Factual Precision: Preserve 100% of facts, entities, numbers, citations, names, and cultural/technical concepts. Do not fabricate new facts or remove existing information.
5. Structure: Maintain the original paragraph breaks and headings.

Return ONLY the humanized rewritten text. Do not include introductory remarks, markdown code blocks around the full text, or explanatory commentary.`;

        const result = await complete({
          provider: activeProvider,
          apiKey: key,
          model: modelName || undefined,
          userPrompt: sourceText,
          systemPrompt,
          taskClass: "refinement",
        });

        if (result && result.text) {
          generatedHumanized = result.text.trim();
        }
      }

      // 2. Fallback to server endpoint if no client key or if client call failed
      if (!generatedHumanized) {
        const res = await authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
          text: sourceText,
          register: toneSpec.label,
        });

        if (res.ok) {
          const body = await res.json();
          if (body.humanizedText) {
            generatedHumanized = body.humanizedText.trim();
          }
        }
      }

      if (generatedHumanized) {
        setHumanizedText(generatedHumanized);
        // Persist to server store
        authedJsonFetch(`/api/projects/${projectId}/humanizer/humanize`, "POST", {
          text: sourceText,
          llmResult: generatedHumanized,
          register: toneSpec.label,
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
  }, [sourceText, selectedTone, activeProvider, modelName, projectId]);

  function copyToClipboard() {
    if (!humanizedText) return;
    navigator.clipboard.writeText(humanizedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sourceWordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;
  const humanizedWordCount = humanizedText.trim() ? humanizedText.trim().split(/\s+/).length : 0;

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
                Language & Voice Studio
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* AI Connection Badge */}
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
        {/* Controls & Tone Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[color:var(--surface-raised)] p-4 rounded-2xl border border-[color:var(--border-subtle)] shadow-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mr-1">
              Tone:
            </span>
            {TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                onClick={() => setSelectedTone(tone.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  selectedTone === tone.id
                    ? "bg-[color:var(--accent-solid)] text-white shadow-xs"
                    : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                }`}
              >
                {tone.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleHumanize}
            disabled={loading || !sourceText.trim()}
            className="w-full sm:w-auto px-6 py-2.5 bg-[color:var(--accent-solid)] text-white text-sm font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Humanizing with AI…</span>
              </>
            ) : (
              <>
                <span>✨ Humanize Text</span>
              </>
            )}
          </button>
        </div>

        {/* Side-by-Side 2-Box Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 items-stretch min-h-[500px]">
          {/* Box 1: Input Box */}
          <div className="flex flex-col rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[color:var(--text-primary)]">
                  Original / AI-Generated Text
                </span>
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  ({sourceWordCount} words)
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
          </div>

          {/* Box 2: Output Box */}
          <div className="flex flex-col rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden relative">
            <div className="px-4 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--accent-subtle)]/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[color:var(--accent)] flex items-center gap-1.5">
                  <span>✨ Humanized Publication Prose</span>
                </span>
                {humanizedWordCount > 0 && (
                  <span className="text-[11px] text-[color:var(--text-muted)]">
                    ({humanizedWordCount} words)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={copyToClipboard}
                disabled={!humanizedText}
                className="text-xs font-bold text-[color:var(--accent)] hover:underline cursor-pointer disabled:opacity-40 flex items-center gap-1"
              >
                {copied ? "✓ Copied!" : "Copy Text"}
              </button>
            </div>

            <div className="flex-1 w-full p-4 md:p-5 text-sm font-sans bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] leading-relaxed overflow-y-auto whitespace-pre-wrap min-h-[380px]">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 opacity-80">
                  <div className="w-8 h-8 border-3 border-[color:var(--accent-subtle)] border-t-[color:var(--accent)] rounded-full animate-spin" />
                  <p className="text-xs text-[color:var(--text-secondary)] font-medium">
                    Calibrating natural sentence cadence and removing AI clichés with Google Gemini…
                  </p>
                </div>
              ) : humanizedText ? (
                humanizedText
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-[color:var(--text-muted)]">
                  <span className="text-3xl">✨</span>
                  <p className="text-xs font-medium">
                    Click <strong>"Humanize Text"</strong> above to transform your draft into organic, publication-grade prose.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
