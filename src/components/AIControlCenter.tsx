import React, { useState, useEffect } from "react";
import { PaperProject, AISettings } from "../types";
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

interface AIControlCenterProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onRequireVault?: () => void;
}

export default function AIControlCenter({ project, updateProject, onRequireVault }: AIControlCenterProps) {
  const [activeSubTab, setActiveSubTab] = useState<"credentials" | "ollama" | "usage" | "comparison">("credentials");

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

  // Calculate cost summary metrics
  const totalCalls = project.costMetrics?.totalCalls || 0;
  const totalCost = project.costMetrics?.totalCost || 0;
  const logs = project.usageLogs || [];

  return (
    <div id="ai-control-center" className="os-card glass-effect p-6 space-y-6">
      {/* Tab Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-100 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#1A365D] font-display flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#C08A3E]" />
            AI Control Center & Gateway
          </h2>
          <p className="text-xs text-gray-500">
            Configure encrypted credentials, specialized routing, local engines, and track estimated API costs.
          </p>
        </div>
        
        {/* Sub Navigation Tabs */}
        <div className="flex gap-1.5 bg-[#FAF9F6] border border-gray-200/60 p-1 rounded-xl shrink-0 overflow-x-auto">
          {[
            { id: "credentials", name: "Credentials", icon: Key },
            { id: "ollama", name: "Ollama Local", icon: Database },
            { id: "usage", name: "Analytics & Costs", icon: TrendingUp },
            { id: "comparison", name: "Provider Matrix", icon: Table }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-mono font-semibold uppercase tracking-wider rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? "bg-[#1A365D] text-white shadow-sm"
                    : "text-[#6B665E] hover:text-[#1A365D] hover:bg-neutral-100"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB TAB 1: API CREDENTIALS MANAGER */}
      {activeSubTab === "credentials" && !vaultUnlocked && (
        <div className="space-y-6 animate-fade-in max-w-xl mx-auto text-center py-8">
          <div className="w-14 h-14 bg-[#1A365D]/5 border border-gray-200 rounded-full flex items-center justify-center mx-auto">
            <Key className="w-7 h-7 text-[#C08A3E]" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-serif text-[#1A365D] mb-3">Unlock Your Key Vault</h3>
            <p className="text-[#6B665E] text-sm">
              Enter your vault passphrase to view or edit your encrypted provider API keys. It's held
              only in this browser tab's memory for this session — never written to disk or synced.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlockVault()}
              placeholder="Vault passphrase"
              className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all font-mono text-sm"
            />
            <button
              onClick={handleUnlockVault}
              disabled={!vaultInput.trim()}
              className="px-5 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-bold text-white text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 uppercase tracking-wider font-mono"
            >
              Unlock Vault
            </button>
          </div>
        </div>
      )}

      {activeSubTab === "credentials" && vaultUnlocked && (
        <div className="space-y-6 animate-fade-in">
          {/* Info Alert Box */}
          <div className="p-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl flex gap-3 items-start">
            <Info className="w-4 h-4 text-[#C08A3E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#1A365D] uppercase tracking-wider font-mono block">Synchronous XOR Cipher Encryption</span>
              <p className="text-[11px] text-gray-600 leading-normal font-sans">
                To prevent accidental key exposure in local storage exports or browser caches, all API credentials entered below are encrypted using a symmetric XOR cipher keyed to your vault passphrase — a separate secret from your login, held only in this browser tab's memory for this session. They are decrypted on the fly only at the moment of request dispatch.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left side: Provider Selector & Custom overrides */}
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider mb-1.5">
                  AI Model Gateway Mode
                </label>
                <select
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
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
                <span className="text-[9px] text-[#76726A] mt-1.5 block leading-normal">
                  In **Auto Mode**, requests automatically route to DeepSeek for grounding/reasoning, Qwen for section drafting, and Gemini for data discovery and citation lookups.
                </span>
              </div>

              {/* Conditional Model Selectors */}
              {project.aiSettings?.provider === "openai" && (
                <div className="space-y-2 border-t border-gray-100 pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                    OpenAI Chat Model
                  </label>
                  <select
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
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
              )}

              {project.aiSettings?.provider === "claude" && (
                <div className="space-y-2 border-t border-gray-100 pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                    Anthropic Claude Model
                  </label>
                  <select
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
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
              )}

              {project.aiSettings?.provider === "deepseek" && (
                <div className="space-y-2 border-t border-gray-100 pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                    DeepSeek Model
                  </label>
                  <select
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                    value={project.aiSettings?.deepseekModel || "deepseek-chat"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, deepseekModel: e.target.value } });
                    }}
                  >
                    <option value="deepseek-chat">DeepSeek-V3 Chat (Recommended)</option>
                    <option value="deepseek-reasoner">DeepSeek-R1 Reasoner</option>
                  </select>
                </div>
              )}

              {project.aiSettings?.provider === "qwen" && (
                <div className="space-y-2 border-t border-gray-100 pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                    Qwen Model
                  </label>
                  <select
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
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
              )}

              {project.aiSettings?.provider === "cohere" && (
                <div className="space-y-2 border-t border-gray-100 pt-3 animate-fade-in">
                  <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                    Cohere Model
                  </label>
                  <select
                    className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                    value={project.aiSettings?.cohereModel || "command-r-plus"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, cohereModel: e.target.value } });
                    }}
                  >
                    <option value="command-r-plus">Command R+ (Large Model)</option>
                    <option value="command-r">Command R (Fast/Medium)</option>
                  </select>
                </div>
              )}

              {project.aiSettings?.provider === "custom" && (
                <div className="space-y-3 border-t border-gray-100 pt-3 animate-fade-in text-xs font-mono">
                  <div>
                    <label className="block text-[10px] font-bold text-[#76726A] uppercase mb-1">
                      Local Proxy Endpoint
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-mono text-[#1A365D] focus:outline-none focus:border-[#C08A3E]"
                      value={project.aiSettings?.customEndpoint || "http://localhost:1234/v1"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, customEndpoint: e.target.value } });
                      }}
                      placeholder="e.g. http://localhost:1234/v1"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#76726A] uppercase mb-1">
                      Custom Model Name
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-mono text-[#1A365D] focus:outline-none focus:border-[#C08A3E]"
                      value={project.aiSettings?.customModel || "llama3"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, customModel: e.target.value } });
                      }}
                      placeholder="e.g. llama-3-8b-instruct"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right side: API Keys Inputs */}
            <div className="space-y-4 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-5">
              <h3 className="text-xs font-bold font-mono text-[#76726A] uppercase tracking-wider border-b border-gray-50 pb-1 flex items-center justify-between">
                <span>API Keys Configuration</span>
                <span className="text-[9px] text-[#946A30] lowercase normal-case italic font-sans font-normal">XOR encrypted</span>
              </h3>

              {/* Gemini key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-gray-500 uppercase">Google Gemini</label>
                  <button 
                    onClick={() => handleTestConnection("gemini")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[#C08A3E] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "gemini" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
              </div>

              {/* OpenAI key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-gray-500 uppercase">OpenAI ChatGPT</label>
                  <button 
                    onClick={() => handleTestConnection("openai")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[#C08A3E] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "openai" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                />
              </div>

              {/* Claude key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-gray-500 uppercase">Anthropic Claude</label>
                  <button 
                    onClick={() => handleTestConnection("claude")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[#C08A3E] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "claude" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                  value={claudeKey}
                  onChange={(e) => setClaudeKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
              </div>

              {/* DeepSeek key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-gray-500 uppercase">DeepSeek API</label>
                  <button 
                    onClick={() => handleTestConnection("deepseek")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[#C08A3E] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "deepseek" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              {/* Qwen key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-gray-500 uppercase">Qwen API (Alibaba)</label>
                  <button 
                    onClick={() => handleTestConnection("qwen")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[#C08A3E] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "qwen" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                  value={qwenKey}
                  onChange={(e) => setQwenKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              {/* Cohere key input */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold font-mono text-gray-500 uppercase">Cohere AI</label>
                  <button 
                    onClick={() => handleTestConnection("cohere")}
                    disabled={testingProvider !== null}
                    className="text-[9px] font-mono text-[#C08A3E] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    {testingProvider === "cohere" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : "Test connection"}
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-white border border-[#CBD5E1] rounded-lg px-3 py-1.5 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                  value={cohereKey}
                  onChange={(e) => setCohereKey(e.target.value)}
                  placeholder="Enter key..."
                />
              </div>
            </div>
          </div>

          {/* Test connection results display */}
          {testResult.status && (
            <div className={`p-3 rounded-lg border text-xs font-sans flex items-center gap-2 animate-fade-in ${
              testResult.status === "success" 
                ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                : "bg-red-50 border-red-200 text-red-800"
            }`}>
              {testResult.status === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Save Action Bar */}
          <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
            <button
              onClick={() => handleTestConnection("server")}
              disabled={testingProvider !== null}
              className="px-4 py-2 border border-gray-200 hover:bg-[#FAF9F6] text-[#1A365D] text-xs font-mono font-semibold uppercase tracking-wider rounded-xl transition-all duration-150 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {testingProvider === "server" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              Test Server Proxy
            </button>

            <button
              onClick={handleSaveCredentials}
              className="px-6 py-2.5 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all duration-150 inline-flex items-center gap-2 cursor-pointer"
            >
              <Key className="w-4 h-4" />
              Save Encrypted Credentials
            </button>
          </div>
        </div>
      )}

      {/* SUB TAB 2: OLLAMA LOCAL MANAGER */}
      {activeSubTab === "ollama" && (
        <div className="space-y-6 animate-fade-in font-sans">
          <div className="p-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl flex gap-3 items-start">
            <Database className="w-4 h-4 text-[#C08A3E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#1A365D] uppercase tracking-wider font-mono block">Local Offline Generation Engine</span>
              <p className="text-[11px] text-gray-600 leading-normal font-sans">
                Connect your workspace directly to local LLMs running on your own hardware via Ollama. Ideal for completely offline, cost-free generation with absolute data privacy. Local routing bypasses Vercel proxy.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider mb-1">
                  Ollama Service URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="grow bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-mono text-[#1A365D] focus:outline-none focus:border-[#C08A3E]"
                    value={project.aiSettings?.ollamaEndpoint || "http://localhost:11434"}
                    onChange={(e) => {
                      updateProject({ aiSettings: { ...project.aiSettings, ollamaEndpoint: e.target.value } });
                    }}
                    placeholder="http://localhost:11434"
                  />
                  <button
                    onClick={checkOllamaHealth}
                    disabled={scanningOllama}
                    className="px-4 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white text-xs font-mono font-semibold uppercase tracking-wider rounded-lg flex items-center justify-center cursor-pointer gap-1.5 shadow-sm min-w-[100px]"
                  >
                    {scanningOllama ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Scan Tags"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider mb-1">
                  Selected Local model tag
                </label>
                <div className="flex gap-2">
                  {ollamaModels.length > 0 ? (
                    <select
                      className="grow bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-mono"
                      value={project.aiSettings?.ollamaModel || "llama3"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, ollamaModel: e.target.value } });
                      }}
                    >
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="grow bg-white border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs font-mono text-[#1A365D] focus:outline-none focus:border-[#C08A3E]"
                      value={project.aiSettings?.ollamaModel || "llama3"}
                      onChange={(e) => {
                        updateProject({ aiSettings: { ...project.aiSettings, ollamaModel: e.target.value } });
                      }}
                      placeholder="e.g. deepseek-r1:7b"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Health monitor status dashboard */}
            <div className="bg-[#FAF9F6] border border-gray-200 p-5 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <h3 className="text-xs font-bold font-mono text-[#76726A] uppercase tracking-wider border-b border-gray-200/50 pb-1">
                  Ollama Status Dashboard
                </h3>
                
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-sans">Service Connection:</span>
                  {ollamaStatus === "online" ? (
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold uppercase rounded-md flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      ONLINE
                    </span>
                  ) : ollamaStatus === "offline" ? (
                    <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-mono font-bold uppercase rounded-md flex items-center gap-1">
                      <WifiOff className="w-3 h-3" />
                      OFFLINE
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-gray-100 text-gray-800 text-[10px] font-mono font-bold uppercase rounded-md">
                      UNCHECKED
                    </span>
                  )}
                </div>

                {ollamaLatency !== null && (
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-xs text-gray-500 font-sans">Ping Latency:</span>
                    <span className="text-xs font-mono font-bold text-[#1A365D]">{ollamaLatency} ms</span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-gray-500 font-sans">Installed Local Models:</span>
                  <span className="px-2 py-0.5 bg-[#1A365D]/10 text-[#1A365D] text-xs font-mono font-bold rounded-md">
                    {ollamaModels.length} Found
                  </span>
                </div>
              </div>

              {ollamaStatus === "offline" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 items-start text-[10px] text-amber-800 leading-normal font-sans">
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
      {activeSubTab === "usage" && (
        <div className="space-y-6 animate-fade-in font-sans">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Metric 1 */}
            <div className="bg-[#FAF9F6] border border-gray-200 p-4 rounded-xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#1A365D]/10 text-[#1A365D] flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider block">Total AI Calls</span>
                <span className="text-xl font-bold text-[#1A365D] font-mono">{totalCalls}</span>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="bg-[#FAF9F6] border border-gray-200 p-4 rounded-xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#C08A3E]/10 text-[#946A30] flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider block">Estimated API Expenses</span>
                <span className="text-xl font-bold text-[#1A365D] font-mono">${totalCost.toFixed(5)}</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="bg-[#FAF9F6] border border-gray-200 p-4 rounded-xl flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider block">Active Session Provider</span>
                <span className="text-sm font-bold text-emerald-800 font-mono uppercase">{project.aiSettings?.provider || "gemini"}</span>
              </div>
            </div>
          </div>

          {/* Usage Chart (Styled markup bar) */}
          <div className="border border-gray-200 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold font-mono text-[#76726A] uppercase tracking-wider border-b border-gray-100 pb-2">
              Expense Distribution by Task Type
            </h3>
            
            {logs.length === 0 ? (
              <p className="text-xs text-gray-400 font-mono italic text-center py-8">
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
                          <span className="text-gray-500 uppercase">{task}</span>
                          <span className="font-bold text-[#1A365D]">${cost.toFixed(5)}</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-[#C08A3E] h-full rounded-full transition-all duration-300"
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
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <h3 className="text-xs font-bold font-mono text-[#76726A] uppercase tracking-wider p-4 bg-[#FAF9F6] border-b border-gray-200">
              API Generation Audit Log
            </h3>
            
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F6] border-b border-gray-200 text-[#76726A] font-mono text-[10px] uppercase font-bold">
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
                    <tr key={i} className="border-b border-gray-100 hover:bg-neutral-50/55 text-gray-700">
                      <td className="p-3 font-mono text-[10px] text-gray-400">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="p-3 font-mono font-bold text-[#1A365D] uppercase">{log.provider}</td>
                      <td className="p-3 font-mono text-gray-500 text-[11px]">{log.model}</td>
                      <td className="p-3 uppercase text-[10px] font-mono text-gray-500">
                        <span className="px-1.5 py-0.5 bg-neutral-100 rounded border border-neutral-200/50">
                          {log.taskType}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-gray-500">
                        {log.inputWords + log.outputWords} words
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-[#946A30]">
                        ${log.estimatedCost.toFixed(5)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-400 italic">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 4: MODEL COMPARISON MATRIX */}
      {activeSubTab === "comparison" && (
        <div className="space-y-6 animate-fade-in font-sans">
          <div className="p-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl flex gap-3 items-start">
            <HelpCircle className="w-4 h-4 text-[#C08A3E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-[#1A365D] uppercase tracking-wider font-mono block">Optimal Orchestration Matrix</span>
              <p className="text-[11px] text-gray-600 leading-normal font-sans">
                Each model has specialized strengths. In Auto Mode, the platform selects the ideal model based on this matrix to guarantee maximum academic rigor, citation validity, and writing fluidity, without requiring manual switching.
              </p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-gray-200 text-[#76726A] font-mono text-[10px] uppercase font-bold">
                  <th className="p-4">Provider / Model</th>
                  <th className="p-4">Specialized Task Category</th>
                  <th className="p-4">Strengths</th>
                  <th className="p-4 text-center">Auto Assigned</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 hover:bg-neutral-50/50">
                  <td className="p-4 font-bold text-[#1A365D] font-mono">DeepSeek Chat (V3/R1)</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-mono font-bold rounded">
                      Rigor & Audits
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">
                    High mathematical/logical reasoning. Ideal for mapping academic constructs, auditing citation continuity, validating research questions, and checking theoretical gap alignment.
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold rounded-md">
                      YES
                    </span>
                  </td>
                </tr>

                <tr className="border-b border-gray-100 hover:bg-neutral-50/50">
                  <td className="p-4 font-bold text-[#1A365D] font-mono">Qwen Plus / Max</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-mono font-bold rounded">
                      Prose Drafting
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">
                    Excellent translation alignment, multilingual reasoning, and fluid, natural academic prose drafting. Ideal for literature reviews, introduction writing, and outlining.
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold rounded-md">
                      YES
                    </span>
                  </td>
                </tr>

                <tr className="border-b border-gray-100 hover:bg-neutral-50/50">
                  <td className="p-4 font-bold text-[#1A365D] font-mono">Google Gemini 3.5</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold rounded">
                      Discovery & Citations
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">
                    Massive context window, lightning-fast execution, and access to search/citation lookups. Ideal for data catalog matching, journal index searching, and parsing guideline templates.
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold rounded-md">
                      YES
                    </span>
                  </td>
                </tr>

                <tr className="border-b border-gray-100 hover:bg-neutral-50/50">
                  <td className="p-4 font-bold text-[#1A365D] font-mono">Ollama Local</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-mono font-bold rounded">
                      Offline Fallback
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">
                    Local model serving. Replaces cloud API calls automatically when the device is disconnected from the internet, protecting data privacy.
                  </td>
                  <td className="p-4 text-center text-gray-400 font-mono text-[10px]">
                    ON DISCONNECT
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
