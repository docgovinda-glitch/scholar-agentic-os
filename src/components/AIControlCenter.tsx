import React, { useState, useEffect } from "react";
import { PaperProject, AISettings } from "../types";
import { useFocusOnNavigate } from "../hooks/useFocusOnNavigate";
import { encryptDataAsync, decryptDataAsync } from "../utils/crypto";
import { setVaultPassphrase, getVaultPassphrase, isVaultUnlocked } from "../services/vaultPassphrase";
import {
  Key, 
  Cpu, 
  TrendingUp, 
  Table, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Activity, 
  Wifi, 
  WifiOff, 
  Database, 
  Sparkles, 
  Info, 
  HelpCircle,
  Clock,
  DollarSign
} from "lucide-react";
import AIGateway from "../services/aiGateway";
import { saveModelPreferences, saveApiKeys } from "../services/supabaseAuthService";
import { AI_MODES, getAIMode, getModeForProvider, AIModeId } from "../config/aiModes";
import AIModeCard from "./ai/AIModeCard";
import type { HealthStatus } from "../types";

type SettingsSubTab = "mode" | "status" | "credentials" | "local" | "keys" | "advanced" | "diagnostics";

interface AIControlCenterProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onRequireVault?: () => void;
  // Navigation overhaul (docs/planning/navigation-scoping.md) — optionally
  // CONTROLLED sub-tab: App.tsx passes both to hash-sync the settings
  // sub-tab (deep links, browser back/forward). Callers that omit them
  // (existing tests, any future standalone usage) keep the original
  // self-contained useState behavior unchanged.
  activeSubTab?: SettingsSubTab;
  onSubTabChange?: (tab: SettingsSubTab) => void;
}

export default function AIControlCenter({ project, updateProject, onRequireVault, activeSubTab: controlledSubTab, onSubTabChange }: AIControlCenterProps) {
  // AI modes redesign (2026-07-28), Step 5 — settings sub-navigation matches
  // the task's own exact 7-tab spec: AI Mode / Current Status / Providers /
  // Local Models / API Keys / Advanced / Diagnostics. "credentials" kept as
  // the internal id for the Providers tab (least-churn rename, its
  // connect/configure/test logic is unchanged) — the OLD "usage" (Analytics
  // & Costs) and "comparison" (Provider Matrix) tabs' real content moved
  // into "diagnostics" and "advanced" respectively rather than deleted, per
  // this project's standing rule against removing working functionality.
  const [internalSubTab, setInternalSubTab] = useState<SettingsSubTab>("mode");
  const activeSubTab = controlledSubTab ?? internalSubTab;
  const subTabContentRef = useFocusOnNavigate<HTMLDivElement>(activeSubTab);
  const setActiveSubTab = (tab: SettingsSubTab) => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  // Local Models tab — real detection state for every Local AI backend
  // (Ollama, LM Studio, OmniRoute, generic custom), not just Ollama.
  const [localBackendStatus, setLocalBackendStatus] = useState<Record<string, HealthStatus>>({});
  const [scanningLocalBackends, setScanningLocalBackends] = useState(false);

  // AI modes redesign (2026-07-28), Step 4 — real connection status for the
  // "Current AI Mode" card, fetched fresh whenever this tab is viewed. Never
  // an optimistic guess: unchecked until the real request resolves.
  const [currentModeStatus, setCurrentModeStatus] = useState<HealthStatus | null>(null);
  const [checkingCurrentMode, setCheckingCurrentMode] = useState(false);

  useEffect(() => {
    if (activeSubTab !== "mode" && activeSubTab !== "status") return;
    let cancelled = false;
    (async () => {
      setCheckingCurrentMode(true);
      try {
        const result = await AIGateway.healthCheckProvider(project.aiSettings?.provider || "gemini", project.aiSettings || { provider: "gemini" });
        if (!cancelled) setCurrentModeStatus(result);
      } catch {
        if (!cancelled) setCurrentModeStatus({ provider: project.aiSettings?.provider || "gemini", status: "offline", error: "Check failed" });
      } finally {
        if (!cancelled) setCheckingCurrentMode(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeSubTab, project.aiSettings?.provider]);

  // Task 3 (BYOK vault passphrase, 2026-07-24) — this used to decrypt/encrypt
  // provider keys with the user's login passcodeHash, falling back to a
  // HARDCODED literal ("scholar_agentic_fallback_secret_salt_123") whenever
  // passcodeHash wasn't loaded yet. That fallback defeated the encryption
  // entirely — anyone could decrypt stored keys offline with a known constant.
  // Now uses vaultPassphrase.ts's in-memory-only passphrase; no fallback.
  const [vaultUnlocked, setVaultUnlockedState] = useState(isVaultUnlocked());
  const [vaultInput, setVaultInput] = useState("");

  // Decrypted keys state
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [qwenKey, setQwenKey] = useState("");
  const [cohereKey, setCohereKey] = useState("");

  // Testing connection states
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ status: "success" | "error" | null; message: string }>({ status: null, message: "" });

  // Ollama states
  const [ollamaStatus, setOllamaStatus] = useState<"unchecked" | "online" | "offline">("unchecked");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLatency, setOllamaLatency] = useState<number | null>(null);
  const [scanningOllama, setScanningOllama] = useState(false);

  const handleUnlockVault = () => {
    if (!vaultInput.trim()) return;
    setVaultPassphrase(vaultInput);
    setVaultUnlockedState(true);
    setVaultInput("");
  };

  // Decrypt existing keys once the vault is unlocked (or whenever settings change while unlocked).
  // Task 2 (AES-GCM upgrade, 2026-07-24 follow-up session): decryptDataAsync
  // (Web Crypto AES-GCM) has no synchronous form, unlike the legacy XOR
  // cipher this replaced — each key is decrypted independently so one bad/
  // old-format ciphertext doesn't block the others from loading.
  useEffect(() => {
    if (!vaultUnlocked) return;
    let cancelled = false;
    (async () => {
      const secret = getVaultPassphrase() || "";
      const settings = (project.aiSettings || {}) as import("../types").AISettings;
      const decryptOrEmpty = async (cipher?: string) => {
        if (!cipher) return "";
        try {
          return await decryptDataAsync(cipher, secret);
        } catch {
          return "";
        }
      };
      const [gemini, openai, claude, deepseek, qwen, cohere] = await Promise.all([
        decryptOrEmpty(settings.geminiApiKey),
        decryptOrEmpty(settings.openaiApiKey),
        decryptOrEmpty(settings.claudeApiKey),
        decryptOrEmpty(settings.deepseekApiKey),
        decryptOrEmpty(settings.qwenApiKey),
        decryptOrEmpty(settings.cohereApiKey),
      ]);
      if (cancelled) return;
      if (gemini) setGeminiKey(gemini);
      if (openai) setOpenaiKey(openai);
      if (claude) setClaudeKey(claude);
      if (deepseek) setDeepseekKey(deepseek);
      if (qwen) setQwenKey(qwen);
      if (cohere) setCohereKey(cohere);
    })();
    return () => { cancelled = true; };
  }, [vaultUnlocked, project.aiSettings]);

  // Automatically check Ollama status when scanning or mounting
  useEffect(() => {
    checkOllamaHealth();
  }, [project.aiSettings?.ollamaEndpoint]);

  const checkOllamaHealth = async () => {
    setScanningOllama(true);
    const endpoint = project.aiSettings?.ollamaEndpoint || "http://localhost:11434";
    try {
      const health = await AIGateway.healthCheckProvider('ollama', { ...project.aiSettings, ollamaEndpoint: endpoint } as AISettings);
      if (health.status === 'online') {
        setOllamaStatus("online");
        setOllamaLatency(health.latencyMs || null);
        setOllamaModels(health.availableModels || []);
      } else {
        setOllamaStatus("offline");
        setOllamaLatency(null);
      }
    } catch (err) {
      setOllamaStatus("offline");
      setOllamaLatency(null);
    } finally {
      setScanningOllama(false);
    }
  };

  // Local Models tab — real detection across every Local AI backend the
  // onboarding flow offers (Ollama, LM Studio, generic custom), per
  // docs/planning/ai-modes-reconciliation.md's Local AI mode. LM Studio/
  // custom both resolve to the "custom" adapter at different default
  // ports, so each is checked with that specific default endpoint rather
  // than whatever's currently saved in settings.
  //
  // Follow-up correction (2026-07-28): OmniRoute is deliberately NOT listed
  // here — it moved out of "Local AI" into its own top-level mode ("Smart
  // Gateway"), since it doesn't do local/private inference the way this
  // tab's other entries do (only its routing is local; inference happens
  // in the cloud via whichever provider it selects). Its own connection
  // status is visible via the AI Mode/Current Status/Diagnostics tabs like
  // any other mode, through the same getModeForProvider resolution.
  const LOCAL_BACKENDS = [
    { key: "ollama", label: "Ollama", providerId: "ollama", endpoint: project.aiSettings?.ollamaEndpoint || "http://localhost:11434" },
    { key: "lmstudio", label: "LM Studio", providerId: "custom", endpoint: "http://localhost:1234/v1" },
    { key: "custom", label: "Custom server", providerId: "custom", endpoint: project.aiSettings?.customEndpoint || "" }
  ];

  const checkAllLocalBackends = async () => {
    setScanningLocalBackends(true);
    try {
      const results = await Promise.all(
        LOCAL_BACKENDS.map(async (backend) => {
          if (backend.key === "custom" && !backend.endpoint) {
            return [backend.key, { provider: "custom", status: "unchecked" as const, error: "No custom endpoint configured" }] as const;
          }
          const settingsForCheck = backend.providerId === "ollama"
            ? { ...project.aiSettings, ollamaEndpoint: backend.endpoint }
            : { ...project.aiSettings, customEndpoint: backend.endpoint };
          const health = await AIGateway.healthCheckProvider(backend.providerId, settingsForCheck as AISettings);
          return [backend.key, health] as const;
        })
      );
      setLocalBackendStatus(Object.fromEntries(results));
    } finally {
      setScanningLocalBackends(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "local") checkAllLocalBackends();
  }, [activeSubTab]);

  // Test provider connection
  const handleTestConnection = async (targetProvider: string) => {
    setTestingProvider(targetProvider);
    setTestResult({ status: null, message: "" });

    try {
      // Build temp aiSettings configuration for validation test — only the
      // provider actually being tested needs a freshly-encrypted key; every
      // other provider's key passes through already-encrypted, untouched.
      const secret = getVaultPassphrase() || "";
      const keyByProvider: Record<string, string> = {
        gemini: geminiKey, openai: openaiKey, claude: claudeKey,
        deepseek: deepseekKey, qwen: qwenKey, cohere: cohereKey,
      };
      const encryptedTestKey = keyByProvider[targetProvider] ? await encryptDataAsync(keyByProvider[targetProvider], secret) : undefined;
      const settingsCopy: AISettings = {
        ...project.aiSettings,
        provider: targetProvider as any,
        geminiApiKey: targetProvider === "gemini" ? encryptedTestKey : project.aiSettings?.geminiApiKey,
        openaiApiKey: targetProvider === "openai" ? encryptedTestKey : project.aiSettings?.openaiApiKey,
        claudeApiKey: targetProvider === "claude" ? encryptedTestKey : project.aiSettings?.claudeApiKey,
        deepseekApiKey: targetProvider === "deepseek" ? encryptedTestKey : project.aiSettings?.deepseekApiKey,
        qwenApiKey: targetProvider === "qwen" ? encryptedTestKey : project.aiSettings?.qwenApiKey,
        cohereApiKey: targetProvider === "cohere" ? encryptedTestKey : project.aiSettings?.cohereApiKey,
      } as AISettings;

      const result = await AIGateway.healthCheckProvider(targetProvider, settingsCopy);

      if (result.status === "online") {
        setTestResult({ status: "success", message: `Connection successful! (${result.latencyMs}ms)` });
      } else {
        setTestResult({ status: "error", message: result.error || "Connection failed." });
      }
    } catch (err: any) {
      console.error(err);
      setTestResult({ status: "error", message: err.message || "Failed to make connection check request." });
    } finally {
      setTestingProvider(null);
    }
  };

  // Save credentials encrypted
  const handleSaveCredentials = async () => {
    const secret = getVaultPassphrase() || "";
    const [gemini, openai, claude, deepseek, qwen, cohere] = await Promise.all([
      encryptDataAsync(geminiKey, secret),
      encryptDataAsync(openaiKey, secret),
      encryptDataAsync(claudeKey, secret),
      encryptDataAsync(deepseekKey, secret),
      encryptDataAsync(qwenKey, secret),
      encryptDataAsync(cohereKey, secret),
    ]);
    const updatedSettings: AISettings = {
      ...project.aiSettings,
      geminiApiKey: gemini,
      openaiApiKey: openai,
      claudeApiKey: claude,
      deepseekApiKey: deepseek,
      qwenApiKey: qwen,
      cohereApiKey: cohere,
    };

    updateProject({ aiSettings: updatedSettings });

    const user = localStorage.getItem("phd_active_session_username") || "";
    if (user) {
      try {
        const prefsResult = await saveModelPreferences({
          provider: project.aiSettings?.provider || "gemini",
          openaiModel: project.aiSettings?.openaiModel || "",
          claudeModel: project.aiSettings?.claudeModel || "",
          deepseekModel: project.aiSettings?.deepseekModel || "",
          qwenModel: project.aiSettings?.qwenModel || "",
          cohereModel: project.aiSettings?.cohereModel || ""
        });
        if (!prefsResult.success) {
          console.error("Failed to sync model preferences to Supabase:", prefsResult.error);
        }

        const apiKeysResult = await saveApiKeys({
          gemini: geminiKey,
          openai: openaiKey,
          claude: claudeKey,
          deepseek: deepseekKey,
          qwen: qwenKey,
          cohere: cohereKey
        });
        if (!apiKeysResult.success) {
          console.error("Failed to sync API keys to Supabase:", apiKeysResult.error);
        }
      } catch (err) {
        console.error("Failed to sync AI settings to server database:", err);
      }
    }

    alert("AI settings and encrypted API credentials saved successfully (locally and synced to server)!");
    if (!project.knowledgeVault?.files?.some((f: any) => f.isActive)) {
      if (onRequireVault) onRequireVault();
    }
  };

  // API Keys tab (Step 5) — mask + per-key test/remove, real state.
  const KEY_FIELDS: { id: string; label: string; value: string; setValue: (v: string) => void }[] = [
    { id: "gemini", label: "Google Gemini", value: geminiKey, setValue: setGeminiKey },
    { id: "openai", label: "OpenAI ChatGPT", value: openaiKey, setValue: setOpenaiKey },
    { id: "claude", label: "Anthropic Claude", value: claudeKey, setValue: setClaudeKey },
    { id: "deepseek", label: "DeepSeek API", value: deepseekKey, setValue: setDeepseekKey },
    { id: "qwen", label: "Qwen API (Alibaba)", value: qwenKey, setValue: setQwenKey },
    { id: "cohere", label: "Cohere AI", value: cohereKey, setValue: setCohereKey },
  ];

  const maskKey = (key: string) => (key.length <= 6 ? "••••••" : `${key.slice(0, 3)}${"•".repeat(Math.min(key.length - 6, 12))}${key.slice(-3)}`);

  const handleRemoveKey = async (field: typeof KEY_FIELDS[number]) => {
    field.setValue("");
    const secret = getVaultPassphrase() || "";
    const emptyCipher = await encryptDataAsync("", secret);
    updateProject({ aiSettings: { ...project.aiSettings, [`${field.id}ApiKey`]: emptyCipher } as AISettings });
  };

  // Calculate cost summary metrics
  const totalCalls = project.costMetrics?.totalCalls || 0;
  const totalCost = project.costMetrics?.totalCost || 0;
  const logs = project.usageLogs || [];

  return (
    <div id="ai-control-center" className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl shadow-sm p-6 space-y-6">
      {/* Tab Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[color:var(--color-navy-4)] pb-4 gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#E2E8F0] font-display flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            AI Control Center & Gateway
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Configure encrypted credentials, specialized routing, local engines, and track estimated API costs.
          </p>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex gap-1.5 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] p-1 rounded-xl shrink-0 overflow-x-auto">
          {[
            { id: "mode", name: "AI Mode", icon: Sparkles },
            { id: "status", name: "Current Status", icon: Activity },
            { id: "credentials", name: "Providers", icon: Key },
            { id: "local", name: "Local Models", icon: Database },
            { id: "keys", name: "API Keys", icon: Key },
            { id: "advanced", name: "Advanced", icon: Table },
            { id: "diagnostics", name: "Diagnostics", icon: HelpCircle }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wider rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? "bg-[color:var(--color-luminous-blue-dim)] text-white shadow-sm"
                    : "text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[color:var(--color-navy-3)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation overhaul (docs/planning/navigation-scoping.md) — focus lands
          here on every sub-tab switch (deep link, back/forward, or a click),
          so it's never silently lost to <body>. */}
      <div ref={subTabContentRef} tabIndex={-1} className="focus:outline-none">
      {/* SUB TAB 0: AI MODE (mirrors onboarding — docs/planning/ai-modes-reconciliation.md Step 4) */}
      {activeSubTab === "mode" && (() => {
        const currentProvider = project.aiSettings?.provider || "gemini";
        const currentModeId = getModeForProvider(currentProvider);
        const currentMode = currentModeId ? AI_MODES.find(m => m.id === currentModeId) : undefined;
        const statusLabel = checkingCurrentMode ? "Checking..." : (currentModeStatus?.status || "unchecked");
        const statusIsOnline = statusLabel === "online";
        const statusIsOffline = statusLabel === "offline" || statusLabel === "degraded";

        return (
          <div className="space-y-6 animate-fade-in">
            {/* Current AI Mode status card */}
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block">Current AI Mode</span>
                  <h3 className="text-lg font-bold text-[#E2E8F0]">
                    {currentMode ? currentMode.title : "Not configured yet"}
                  </h3>
                  <p className="text-xs text-[#94A3B8] mt-1 max-w-md">
                    {currentMode
                      ? currentMode.description
                      : "Choose an AI mode below to get started."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                  statusIsOnline ? "bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border border-[color:var(--color-luminous-blue)]/20" :
                  statusIsOffline ? "bg-red-500/10 text-red-400 border border-red-500/30" :
                  "bg-[color:var(--color-navy-3)] text-[#94A3B8] border border-[color:var(--color-navy-4)]"
                }`}>
                  {checkingCurrentMode ? <Loader2 className="w-3 h-3 animate-spin" /> : (statusIsOnline ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />)}
                  {statusLabel}
                </span>
                <button
                  onClick={() => setActiveSubTab("credentials")}
                  className="px-3 py-1.5 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-2)] text-[#E2E8F0] text-xs font-mono font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer whitespace-nowrap"
                >
                  Change Mode
                </button>
              </div>
            </div>

            {/* Same 5 mode cards as onboarding — identical terminology and hierarchy */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {AI_MODES.map((mode) => (
                <AIModeCard
                  key={mode.id}
                  mode={mode}
                  isSelected={currentModeId === mode.id}
                  onSelect={() => setActiveSubTab("credentials")}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* SUB TAB: CURRENT STATUS (Step 5 — lean real-time readout; deeper history lives in Diagnostics) */}
      {activeSubTab === "status" && (() => {
        const currentProvider = project.aiSettings?.provider || "gemini";
        const currentModeId = getModeForProvider(currentProvider);
        const currentMode = currentModeId ? AI_MODES.find(m => m.id === currentModeId) : undefined;
        const statusLabel = checkingCurrentMode ? "Checking..." : (currentModeStatus?.status || "unchecked");
        const statusIsOnline = statusLabel === "online";

        return (
          <div className="space-y-4 animate-fade-in font-sans max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-4">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block mb-1">Active AI Mode</span>
                <span className="text-sm font-bold text-[#E2E8F0]">{currentMode ? currentMode.title : "Not configured"}</span>
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-4">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block mb-1">Active Provider</span>
                <span className="text-sm font-bold text-[#E2E8F0] uppercase font-mono">{currentProvider}</span>
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-4">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block mb-1">Connection State</span>
                <span className={`text-sm font-bold font-mono uppercase flex items-center gap-1.5 ${statusIsOnline ? "text-[color:var(--color-luminous-blue)]" : "text-[#94A3B8]"}`}>
                  {checkingCurrentMode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (statusIsOnline ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />)}
                  {statusLabel}
                </span>
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-4">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block mb-1">Latency</span>
                <span className="text-sm font-bold text-[#E2E8F0] font-mono">
                  {currentModeStatus?.latencyMs ? `${currentModeStatus.latencyMs}ms` : "—"}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SUB TAB 1: API CREDENTIALS MANAGER */}
      {activeSubTab === "credentials" && !vaultUnlocked && (
        <div className="space-y-6 animate-fade-in max-w-xl mx-auto text-center py-8">
          <div className="w-14 h-14 bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-navy-4)] rounded-full flex items-center justify-center mx-auto">
            <Key className="w-7 h-7 text-[color:var(--color-luminous-blue)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#E2E8F0] mb-3">Unlock Your Key Vault</h3>
            <p className="text-[#94A3B8] text-sm">
              Enter your vault passphrase to view or edit your encrypted provider API keys. It's held
              only in this browser tab's memory for this session — never written to disk or synced.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] focus-within:ring-2 focus-within:ring-[color:var(--color-luminous-blue)]/20">
              <input
                type="password"
                value={vaultInput}
                onChange={(e) => setVaultInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlockVault()}
                placeholder="Vault passphrase"
                className="border-0 bg-transparent w-full rounded-xl py-2.5 px-4 text-[#E2E8F0] focus:outline-none transition-all font-mono text-sm"
              />
            </div>
            <button
              onClick={handleUnlockVault}
              disabled={!vaultInput.trim()}
              className="px-5 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-bold text-white text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 uppercase tracking-wider font-mono"
            >
              Unlock Vault
            </button>
          </div>
        </div>
      )}

      {activeSubTab === "credentials" && vaultUnlocked && (
        <div className="space-y-6 animate-fade-in">
          {/* Info Alert Box */}
          <div className="p-4 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl flex gap-3 items-start">
            <Info className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#E2E8F0] uppercase tracking-wider font-mono block">Synchronous XOR Cipher Encryption</span>
              <p className="text-[11px] text-[#94A3B8] leading-normal font-sans">
                To prevent accidental key exposure in local storage exports or browser caches, all API credentials entered below are encrypted using a symmetric XOR cipher keyed to your vault passphrase — a separate secret from your login, held only in this browser tab's memory for this session. They are decrypted on the fly only at the moment of request dispatch.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left side: Provider Selector & Custom overrides */}
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-1.5">
                  AI Model Gateway Mode
                </label>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <select
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={project.aiSettings?.provider || "gemini"}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    updateProject({ aiSettings: { ...project.aiSettings, provider: val } });
                  }}
                >
                  <option value="auto">Auto Mode (Task-Based Specialized Routing)</option>
                  <option value="server">Server Proxy (Zero-Config Default)</option>
                  <option value="gemini">Google Gemini 3.5</option>
                  <option value="openai">OpenAI ChatGPT</option>
                  <option value="claude">Anthropic Claude</option>
                  <option value="deepseek">DeepSeek API</option>
                  <option value="qwen">Qwen API (DashScope)</option>
                  <option value="cohere">Cohere Command</option>
                  <option value="ollama">Ollama Local LLM</option>
                  <option value="custom">Custom Local API Proxy</option>
                </select>
                </div>
                <span className="text-[9px] text-[#94A3B8] mt-1.5 block leading-normal">
                  In **Auto Mode**, requests automatically route to DeepSeek for grounding/reasoning, Qwen for section drafting, and Gemini for data discovery and citation lookups.
                </span>
              </div>

              {/* Conditional Model Selectors */}
              {project.aiSettings?.provider === "openai" && (
                <div className="space-y-2 border-t border-[color:var(--color-navy-4)] pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    OpenAI Chat Model
                  </label>
                  <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                    value={project.aiSettings?.openaiModel || "gpt-4o-mini"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, openaiModel: e.target.value } });
                    }}
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Fast & Extremely Cost-Efficient)</option>
                    <option value="gpt-4o">gpt-4o (Premium Balanced)</option>
                    <option value="o1-mini">o1-mini (Complex Reasoning)</option>
                  </select>
                  </div>
                </div>
              )}

              {project.aiSettings?.provider === "claude" && (
                <div className="space-y-2 border-t border-[color:var(--color-navy-4)] pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    Anthropic Claude Model
                  </label>
                  <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                    value={project.aiSettings?.claudeModel || "claude-3-5-sonnet-20241022"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, claudeModel: e.target.value } });
                    }}
                  >
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Recommended)</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Fast)</option>
                    <option value="claude-3-opus-20240229">Claude 3 Opus (Highly Rigorous)</option>
                  </select>
                  </div>
                </div>
              )}

              {project.aiSettings?.provider === "deepseek" && (
                <div className="space-y-2 border-t border-[color:var(--color-navy-4)] pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    DeepSeek Model
                  </label>
                  <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                    value={project.aiSettings?.deepseekModel || "deepseek-chat"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, deepseekModel: e.target.value } });
                    }}
                  >
                    <option value="deepseek-chat">DeepSeek-V3 Chat (Recommended)</option>
                    <option value="deepseek-reasoner">DeepSeek-R1 Reasoner</option>
                  </select>
                  </div>
                </div>
              )}

              {project.aiSettings?.provider === "qwen" && (
                <div className="space-y-2 border-t border-[color:var(--color-navy-4)] pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    Qwen Model
                  </label>
                  <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                    value={project.aiSettings?.qwenModel || "qwen-plus"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, qwenModel: e.target.value } });
                    }}
                  >
                    <option value="qwen-plus">Qwen Plus (Optimized for Drafting)</option>
                    <option value="qwen-turbo">Qwen Turbo (Super Fast)</option>
                    <option value="qwen-max">Qwen Max (High Rigor)</option>
                  </select>
                  </div>
                </div>
              )}

              {project.aiSettings?.provider === "cohere" && (
                <div className="space-y-2 border-t border-[color:var(--color-navy-4)] pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
                    Cohere Model
                  </label>
                  <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                    value={project.aiSettings?.cohereModel || "command-r-plus"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, cohereModel: e.target.value } });
                    }}
                  >
                    <option value="command-r-plus">Command R+ (Large Model)</option>
                    <option value="command-r">Command R (Fast/Medium)</option>
                  </select>
                  </div>
                </div>
              )}

              {project.aiSettings?.provider === "custom" && (
                <div className="space-y-3 border-t border-[color:var(--color-navy-4)] pt-3 animate-fade-in text-xs font-mono">
                  <div>
                    <label className="block text-[10px] font-bold text-[#94A3B8] uppercase mb-1">
                      Local Proxy Endpoint
                    </label>
                    <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                    <input
                      type="text"
                      className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs font-mono text-[#E2E8F0] focus:outline-none"
                      value={project.aiSettings?.customEndpoint || "http://localhost:1234/v1"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, customEndpoint: e.target.value } });
                      }}
                      placeholder="e.g. http://localhost:1234/v1"
                    />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#94A3B8] uppercase mb-1">
                      Custom Model Name
                    </label>
                    <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                    <input
                      type="text"
                      className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs font-mono text-[#E2E8F0] focus:outline-none"
                      value={project.aiSettings?.customModel || "llama3"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, customModel: e.target.value } });
                      }}
                      placeholder="e.g. llama-3-8b-instruct"
                    />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: API Keys Inputs */}
            <div className="space-y-4 border-t md:border-t-0 md:border-l border-[color:var(--color-navy-4)] pt-4 md:pt-0 md:pl-5">
              <h3 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider border-b border-[color:var(--color-navy-4)]/60 pb-1 flex items-center justify-between">
                <span>API Keys Configuration</span>
                <span className="text-[9px] text-[color:var(--color-luminous-blue)] lowercase normal-case italic font-sans font-normal">XOR encrypted</span>
              </h3>

              {/* Gemini key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">Google Gemini</label>
                  <button 
                    onClick={() => handleTestConnection("gemini")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "gemini" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <input
                  type="password"
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-1.5 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
                </div>
              </div>

              {/* OpenAI key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">OpenAI ChatGPT</label>
                  <button 
                    onClick={() => handleTestConnection("openai")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "openai" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <input
                  type="password"
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-1.5 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                />
                </div>
              </div>

              {/* Claude key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">Anthropic Claude</label>
                  <button 
                    onClick={() => handleTestConnection("claude")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "claude" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <input
                  type="password"
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-1.5 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                </div>
              </div>

              {/* DeepSeek key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">DeepSeek API</label>
                  <button 
                    onClick={() => handleTestConnection("deepseek")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "deepseek" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <input
                  type="password"
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-1.5 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder="sk-..."
                />
                </div>
              </div>

              {/* Qwen key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">Qwen API (Alibaba)</label>
                  <button 
                    onClick={() => handleTestConnection("qwen")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "qwen" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <input
                  type="password"
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-1.5 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={qwenKey}
                  onChange={(e) => setQwenKey(e.target.value)}
                  placeholder="sk-..."
                />
                </div>
              </div>

              {/* Cohere key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">Cohere AI</label>
                  <button 
                    onClick={() => handleTestConnection("cohere")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[color:var(--color-luminous-blue)] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "cohere" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                <input
                  type="password"
                  className="border-0 bg-transparent w-full rounded-lg px-3 py-1.5 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                  value={cohereKey}
                  onChange={(e) => setCohereKey(e.target.value)}
                  placeholder="Enter key..."
                />
                </div>
              </div>
            </div>
          </div>

          {/* Test connection results display */}
          {testResult.status && (
            <div className={`p-3 rounded-lg border text-xs font-sans flex items-center gap-2 animate-fade-in ${
              testResult.status === "success" 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}>
              {testResult.status === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Save Action Bar */}
          <div className="pt-4 border-t border-[color:var(--color-navy-4)] flex justify-between items-center">
            <button
              onClick={() => handleTestConnection("server")}
              disabled={testingProvider !== null}
              className="px-4 py-2 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[#E2E8F0] text-xs font-mono font-semibold uppercase tracking-wider rounded-xl transition-all duration-150 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {testingProvider === "server" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              Test Server Proxy
            </button>

            <button
              onClick={handleSaveCredentials}
              className="px-6 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all duration-150 inline-flex items-center gap-2 cursor-pointer"
            >
              <Key className="w-4 h-4" />
              Save Encrypted Credentials
            </button>
          </div>
        </div>
      )}

      {/* SUB TAB: API KEYS (Step 5 — grouped, always masked, behind the same vault gate as Providers) */}
      {activeSubTab === "keys" && !vaultUnlocked && (
        <div className="space-y-6 animate-fade-in max-w-xl mx-auto text-center py-8">
          <div className="w-14 h-14 bg-[color:var(--color-luminous-blue)]/15 border border-[color:var(--color-navy-4)] rounded-full flex items-center justify-center mx-auto">
            <Key className="w-7 h-7 text-[color:var(--color-luminous-blue)]" />
          </div>
          <h3 className="text-xl font-bold text-[#E2E8F0] mb-1">Unlock Your Key Vault</h3>
          <p className="text-[#94A3B8] text-sm">Enter your vault passphrase to view your configured API keys (masked).</p>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] focus-within:ring-2 focus-within:ring-[color:var(--color-luminous-blue)]/20">
            <input
              type="password"
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlockVault()}
              placeholder="Vault passphrase"
              className="border-0 bg-transparent w-full rounded-xl py-2.5 px-4 text-[#E2E8F0] focus:outline-none transition-all font-mono text-sm"
            />
            </div>
            <button
              onClick={handleUnlockVault}
              disabled={!vaultInput.trim()}
              className="px-5 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-bold text-white text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 uppercase tracking-wider font-mono"
            >
              Unlock Vault
            </button>
          </div>
        </div>
      )}

      {activeSubTab === "keys" && vaultUnlocked && (
        <div className="space-y-4 animate-fade-in max-w-2xl">
          <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl text-[11px] text-[#94A3B8]">
            Keys are grouped by provider and always shown masked. Test verifies the key still works; Remove clears it (encrypted empty value saved, same as clearing the field in Providers).
          </div>
          <div className="border border-[color:var(--color-navy-4)] rounded-2xl divide-y divide-[color:var(--color-navy-4)] overflow-hidden">
            {KEY_FIELDS.map((field) => {
              const configured = !!field.value;
              return (
                <div key={field.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-sm font-bold text-[#E2E8F0] block">{field.label}</span>
                    <span className="text-[11px] font-mono text-[#94A3B8]">
                      {configured ? maskKey(field.value) : "Not configured"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTestConnection(field.id)}
                      disabled={!configured || testingProvider !== null}
                      className="px-2.5 py-1 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[10px] font-mono font-semibold uppercase text-[#94A3B8] rounded-lg cursor-pointer disabled:opacity-40"
                    >
                      {testingProvider === field.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
                    </button>
                    <button
                      onClick={() => handleRemoveKey(field)}
                      disabled={!configured}
                      className="px-2.5 py-1 border border-red-500/30 hover:bg-red-500/10 text-[10px] font-mono font-semibold uppercase text-red-400 rounded-lg cursor-pointer disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {testResult.status && (
            <div className={`p-3 rounded-lg border text-xs font-sans flex items-center gap-2 animate-fade-in ${
              testResult.status === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}>
              {testResult.status === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB: LOCAL MODELS (Step 5 — real detection across every Local AI backend) */}
      {activeSubTab === "local" && (
        <div className="space-y-6 animate-fade-in font-sans">
          <div className="p-4 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl flex gap-3 items-start">
            <Database className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#E2E8F0] uppercase tracking-wider font-mono block">Local Offline Generation Engines</span>
              <p className="text-[11px] text-[#94A3B8] leading-normal font-sans">
                Connect your workspace directly to local LLMs running on your own hardware. Ideal for completely offline, cost-free generation with absolute data privacy.
              </p>
            </div>
          </div>

          <div className="border border-[color:var(--color-navy-4)] rounded-2xl overflow-hidden">
            <div className="p-4 bg-[color:var(--color-navy-2)] border-b border-[color:var(--color-navy-4)] flex items-center justify-between">
              <h3 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider">Detected Backends</h3>
              <button
                onClick={checkAllLocalBackends}
                disabled={scanningLocalBackends}
                className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[#0891B2] text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {scanningLocalBackends ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                Refresh
              </button>
            </div>
            <div className="divide-y divide-[color:var(--color-navy-4)]">
              {LOCAL_BACKENDS.map((backend) => {
                const health = localBackendStatus[backend.key];
                const modeConfig = getAIMode("local");
                const optionGuidance = modeConfig?.providers.find(p => p.label === backend.label);
                const status = scanningLocalBackends ? "checking" : (health?.status || "unchecked");
                return (
                  <div key={backend.key} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-sm font-bold text-[#E2E8F0] block">{backend.label}</span>
                      <span className="text-[10px] text-[#94A3B8] font-mono">{backend.endpoint || "No endpoint configured"}</span>
                      {optionGuidance?.installUrl && status !== "online" && (
                        <a href={optionGuidance.installUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[color:var(--color-luminous-blue)] hover:underline block mt-0.5">
                          Launch guide →
                        </a>
                      )}
                    </div>
                    <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 ${
                      status === "online" ? "bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border border-[color:var(--color-luminous-blue)]/20" :
                      status === "checking" ? "bg-[color:var(--color-navy-3)] text-[#94A3B8] border border-[color:var(--color-navy-4)]" :
                      status === "unchecked" ? "bg-[color:var(--color-navy-3)] text-[#94A3B8] border border-[color:var(--color-navy-4)]" :
                      "bg-red-500/10 text-red-400 border border-red-500/30"
                    }`}>
                      {status === "checking" ? <Loader2 className="w-3 h-3 animate-spin" /> : status === "online" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {status === "online" ? "Running" : status === "checking" ? "Checking" : status === "unchecked" ? "Not configured" : "Stopped"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
                  Ollama Service URL
                </label>
                <div className="flex gap-2">
                  <div className="grow rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                  <input
                    type="text"
                    className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs font-mono text-[#E2E8F0] focus:outline-none"
                    value={project.aiSettings?.ollamaEndpoint || "http://localhost:11434"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, ollamaEndpoint: e.target.value } });
                    }}
                    placeholder="http://localhost:11434"
                  />
                  </div>
                  <button
                    onClick={checkOllamaHealth}
                    disabled={scanningOllama}
                    className="px-4 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-mono font-semibold uppercase tracking-wider rounded-lg flex items-center justify-center cursor-pointer gap-1.5 shadow-sm min-w-[100px]"
                  >
                    {scanningOllama ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Scan Tags"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
                  Selected Local model tag
                </label>
                <div className="flex gap-2">
                  {ollamaModels.length > 0 ? (
                    <div className="grow rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                    <select
                      className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
                      value={project.aiSettings?.ollamaModel || "llama3"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, ollamaModel: e.target.value } });
                      }}
                    >
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    </div>
                  ) : (
                    <div className="grow rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
                    <input
                      type="text"
                      className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs font-mono text-[#E2E8F0] focus:outline-none"
                      value={project.aiSettings?.ollamaModel || "llama3"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, ollamaModel: e.target.value } });
                      }}
                      placeholder="e.g. deepseek-r1:7b"
                    />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Health monitor status dashboard */}
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] p-5 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <h3 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider border-b border-[color:var(--color-navy-4)]/50 pb-1">
                  Ollama Status Dashboard
                </h3>
                
                <div className="flex items-center justify-between py-1 border-b border-[color:var(--color-navy-4)]">
                  <span className="text-xs text-[#94A3B8] font-sans">Service Connection:</span>
                  {ollamaStatus === "online" ? (
                    <span className="px-2.5 py-0.5 bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)] text-[10px] font-mono font-bold uppercase rounded-md flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      ONLINE
                    </span>
                  ) : ollamaStatus === "offline" ? (
                    <span className="px-2.5 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-mono font-bold uppercase rounded-md flex items-center gap-1">
                      <WifiOff className="w-3 h-3" />
                      OFFLINE
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-[color:var(--color-navy-3)] text-[#94A3B8] text-[10px] font-mono font-bold uppercase rounded-md">
                      UNCHECKED
                    </span>
                  )}
                </div>

                {ollamaLatency !== null && (
                  <div className="flex items-center justify-between py-1 border-b border-[color:var(--color-navy-4)]">
                    <span className="text-xs text-[#94A3B8] font-sans">Ping Latency:</span>
                    <span className="text-xs font-mono font-bold text-[#E2E8F0]">{ollamaLatency} ms</span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-[#94A3B8] font-sans">Installed Local Models:</span>
                  <span className="px-2 py-0.5 bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] text-xs font-mono font-bold rounded-md">
                    {ollamaModels.length} Found
                  </span>
                </div>
              </div>

              {ollamaStatus === "offline" && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex gap-2 items-start text-[10px] text-amber-300 leading-normal font-sans">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    <strong>Cannot reach local service.</strong> Make sure Ollama application is running on your machine and CORS requests are accepted. (Run `OLLAMA_ORIGINS="*" ollama serve` if blocked by browser policies).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 3: COST & USAGE DASHBOARD */}
      {activeSubTab === "diagnostics" && (() => {
        // Step 6 — AI Mode / gateway diagnostics from REAL tracked data only:
        // fallbackOrder and usageLogs already exist and are populated by
        // real requests (aiGateway.ts / draftSection) — nothing here is a
        // plausible-looking placeholder. lastSuccessfulRequest is simply the
        // most recent real usageLogs entry, or omitted (not fabricated) if
        // none exist yet.
        const fallbackOrder = project.aiSettings?.fallbackOrder || [];
        const lastRequest = logs.length > 0 ? logs[logs.length - 1] : null;

        return (
        <div className="space-y-6 animate-fade-in font-sans">
          <div className="border border-[color:var(--color-navy-4)] rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">Gateway Diagnostics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between border-b border-[color:var(--color-navy-4)]/60 py-1.5">
                <span className="text-[#94A3B8]">Current provider</span>
                <span className="font-mono font-bold text-[#E2E8F0] uppercase">{project.aiSettings?.provider || "gemini"}</span>
              </div>
              <div className="flex justify-between border-b border-[color:var(--color-navy-4)]/60 py-1.5">
                <span className="text-[#94A3B8]">Current model</span>
                <span className="font-mono font-bold text-[#E2E8F0]">
                  {(project.aiSettings as any)?.[`${project.aiSettings?.provider}Model`] || "default"}
                </span>
              </div>
              <div className="flex justify-between border-b border-[color:var(--color-navy-4)]/60 py-1.5">
                <span className="text-[#94A3B8]">Fallback availability</span>
                <span className="font-mono font-bold text-[#E2E8F0]">
                  {fallbackOrder.length > 0 ? `${fallbackOrder.length} configured` : "None configured"}
                </span>
              </div>
              <div className="flex justify-between border-b border-[color:var(--color-navy-4)]/60 py-1.5">
                <span className="text-[#94A3B8]">Connection status</span>
                <span className="font-mono font-bold text-[#E2E8F0] uppercase">{checkingCurrentMode ? "checking" : (currentModeStatus?.status || "unchecked")}</span>
              </div>
              <div className="flex justify-between border-b border-[color:var(--color-navy-4)]/60 py-1.5 sm:col-span-2">
                <span className="text-[#94A3B8]">Last successful request</span>
                <span className="font-mono font-bold text-[#E2E8F0]">
                  {lastRequest ? `${lastRequest.provider} · ${new Date(lastRequest.timestamp).toLocaleString()}` : "No requests recorded yet"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Metric 1 */}
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] p-4 rounded-xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block">Total AI Calls</span>
                <span className="text-xl font-bold text-[#E2E8F0] font-mono">{totalCalls}</span>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] p-4 rounded-xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block">Estimated API Expenses</span>
                <span className="text-xl font-bold text-[#E2E8F0] font-mono">${totalCost.toFixed(5)}</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] p-4 rounded-xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block">Active Session Provider</span>
                <span className="text-sm font-bold text-[color:var(--color-luminous-blue)] font-mono uppercase">{project.aiSettings?.provider || "gemini"}</span>
              </div>
            </div>
          </div>

          {/* Usage Chart (Styled markup bar) */}
          <div className="border border-[color:var(--color-navy-4)] rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
              Expense Distribution by Task Type
            </h3>
            
            {logs.length === 0 ? (
              <p className="text-xs text-[#94A3B8] font-mono italic text-center py-8">
                No usage logs recorded yet in this workspace. Call generative agents to populate metrics.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Cost bar calculation */}
                {(() => {
                  const tasks = Array.from(new Set(logs.map((l) => l.taskType)));
                  const costsByTask = tasks.map((t) => {
                    const sum = logs.filter((l) => l.taskType === t).reduce((acc, curr) => acc + curr.estimatedCost, 0);
                    return { task: t, cost: sum };
                  }).sort((a, b) => b.cost - a.cost);

                  const maxCost = Math.max(...costsByTask.map((c) => c.cost), 0.00001);

                  return costsByTask.map(({ task, cost }) => {
                    const percent = Math.round((cost / maxCost) * 100);
                    return (
                      <div key={task} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-[#94A3B8] uppercase">{task}</span>
                          <span className="font-bold text-[#E2E8F0]">${cost.toFixed(5)}</span>
                        </div>
                        <div className="w-full bg-[color:var(--color-navy-4)] h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-[color:var(--color-luminous-blue)] h-full rounded-full transition-all duration-200"
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Detailed usage logs table */}
          <div className="border border-[color:var(--color-navy-4)] rounded-2xl overflow-hidden">
            <h3 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider p-4 bg-[color:var(--color-navy-2)] border-b border-[color:var(--color-navy-4)]">
              API Generation Audit Log
            </h3>
            
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[color:var(--color-navy-2)] border-b border-[color:var(--color-navy-4)] text-[#94A3B8] font-mono text-[10px] uppercase font-bold">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Provider</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Task Type</th>
                    <th className="p-3 text-right">Tokens/Words</th>
                    <th className="p-3 text-right">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice().reverse().map((log, i) => (
                    <tr key={i} className="border-b border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]/60 text-[#94A3B8]">
                      <td className="p-3 font-mono text-[10px] text-[#94A3B8]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-3 font-mono font-bold text-[#E2E8F0] uppercase">{log.provider}</td>
                      <td className="p-3 font-mono text-[#94A3B8] text-[11px]">{log.model}</td>
                      <td className="p-3 uppercase text-[10px] font-mono text-[#94A3B8]">
                        <span className="px-1.5 py-0.5 bg-[color:var(--color-navy-3)] rounded border border-[color:var(--color-navy-4)]/50">
                          {log.taskType}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-[#94A3B8]">
                        {log.inputWords + log.outputWords} words
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-[color:var(--color-luminous-blue)]">
                        ${log.estimatedCost.toFixed(5)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-[#94A3B8] italic">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        );
      })()}

      {/* SUB TAB: ADVANCED (Step 5 — gateway routing mode + the former Provider Matrix, moved here rather than deleted) */}
      {activeSubTab === "advanced" && (
        <div className="space-y-6 animate-fade-in font-sans">
          <div className="border border-[color:var(--color-navy-4)] rounded-2xl p-5 space-y-2 max-w-xl">
            <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider">
              AI Model Gateway Mode
            </label>
            <div className="rounded-lg border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)]">
            <select
              className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] focus:outline-none font-mono"
              value={project.aiSettings?.provider || "gemini"}
              onChange={(e) => {
                const val = e.target.value as any;
                updateProject({ aiSettings: { ...project.aiSettings, provider: val } });
              }}
            >
              <option value="auto">Auto Mode (Task-Based Specialized Routing)</option>
              <option value="server">Server Proxy (Zero-Config Default)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI ChatGPT</option>
              <option value="claude">Anthropic Claude</option>
              <option value="deepseek">DeepSeek API</option>
              <option value="qwen">Qwen API (DashScope)</option>
              <option value="cohere">Cohere Command</option>
              <option value="groq">Groq</option>
              <option value="together">Together AI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="omniroute">OmniRoute (Smart Gateway)</option>
              <option value="ollama">Ollama Local LLM</option>
              <option value="custom">Custom Local API Proxy</option>
            </select>
            </div>
            <span className="text-[9px] text-[#94A3B8] mt-1.5 block leading-normal">
              In Auto Mode, requests automatically route to DeepSeek for grounding/reasoning, Qwen for section drafting, and Gemini for data discovery and citation lookups.
            </span>
          </div>

          <div className="p-4 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl flex gap-3 items-start">
            <HelpCircle className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#E2E8F0] uppercase tracking-wider font-mono block">Optimal Orchestration Matrix</span>
              <p className="text-[11px] text-[#94A3B8] leading-normal font-sans">
                Each model has specialized strengths. In Auto Mode, the platform selects the ideal model based on this matrix to guarantee maximum academic rigor, citation validity, and writing fluidity, without requiring manual switching.
              </p>
            </div>
          </div>

          <div className="border border-[color:var(--color-navy-4)] rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[color:var(--color-navy-2)] border-b border-[color:var(--color-navy-4)] text-[#94A3B8] font-mono text-[10px] uppercase font-bold">
                  <th className="p-4">Provider / Model</th>
                  <th className="p-4">Specialized Task Category</th>
                  <th className="p-4">Strengths</th>
                  <th className="p-4 text-center">Auto Assigned</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]/60">
                  <td className="p-4 font-bold text-[#E2E8F0] font-mono">DeepSeek Chat (V3/R1)</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-mono font-bold rounded">
                      Rigor & Audits
                    </span>
                  </td>
                  <td className="p-4 text-[#94A3B8]">
                    High mathematical/logical reasoning. Ideal for mapping academic constructs, auditing citation continuity, validating research questions, and checking theoretical gap alignment.
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold rounded-md">
                      YES
                    </span>
                  </td>
                </tr>

                <tr className="border-b border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]/60">
                  <td className="p-4 font-bold text-[#E2E8F0] font-mono">Qwen Plus / Max</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-mono font-bold rounded">
                      Prose Drafting
                    </span>
                  </td>
                  <td className="p-4 text-[#94A3B8]">
                    Excellent translation alignment, multilingual reasoning, and fluid, natural academic prose drafting. Ideal for literature reviews, introduction writing, and outlining.
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold rounded-md">
                      YES
                    </span>
                  </td>
                </tr>

                <tr className="border-b border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]/60">
                  <td className="p-4 font-bold text-[#E2E8F0] font-mono">Google Gemini 3.5</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold rounded">
                      Discovery & Citations
                    </span>
                  </td>
                  <td className="p-4 text-[#94A3B8]">
                    Massive context window, lightning-fast execution, and access to search/citation lookups. Ideal for data catalog matching, journal index searching, and parsing guideline templates.
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold rounded-md">
                      YES
                    </span>
                  </td>
                </tr>

                <tr className="border-b border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]/60">
                  <td className="p-4 font-bold text-[#E2E8F0] font-mono">Ollama Local</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold rounded">
                      Offline Fallback
                    </span>
                  </td>
                  <td className="p-4 text-[#94A3B8]">
                    Local model serving. Replaces cloud API calls automatically when the device is disconnected from the internet, protecting data privacy.
                  </td>
                  <td className="p-4 text-center text-[#94A3B8] font-mono text-[10px]">
                    ON DISCONNECT
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
