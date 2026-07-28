import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Cloud, Server, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Key, Cpu, Zap, Search, Loader2, BookOpen } from 'lucide-react';
import { PaperProject, AISettings, HealthStatus, AIProviderInfo } from '../types';
import AIGateway, { AI_PROVIDERS } from '../services/aiGateway';
import { encryptDataAsync, decryptDataAsync } from '../utils/crypto';
import { setVaultPassphrase, getVaultPassphrase, isVaultUnlocked } from '../services/vaultPassphrase';

interface AISetupWizardProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onComplete: (readiness: 'validated' | 'simulated', nextChoice: 'vault' | 'skip') => void;
  onBack?: () => void;
}

// Stage 2 (target-workflow.md) — 5-tier BYOK model (docs/planning/ai-gateway.md).
// Concretely, per that doc: tiers differ in *where compute runs and who pays*,
// not in model class. Only 3 are a real selectable technical flow here:
// - Tier 1 (+5a, mechanically identical): local router (Ollama/custom), no key, free.
// - Tier 2: free-tier BYOK — cloud providers with pricingTier "freemium" (Gemini today).
// - Tier 3: heavy BYOK — cloud providers with pricingTier "paid" (OpenAI, Claude, etc.).
// Tier 4 (affiliate-linked subscription) is explicitly NOT a technical AI-calling
// tier per the doc — it's a sponsored-placement signup flow (sponsored-placements.md),
// shown here only as an informational, non-selectable "coming soon" card.
// Tier 5b (in-browser WebGPU/WASM inference) is explicitly experimental/lower-priority
// per the doc and is not built here.
type AiTier = "local" | "free-byok" | "heavy-byok";

function providerMatchesTier(provider: AIProviderInfo, tier: AiTier): boolean {
  if (tier === "local") return provider.type === "local";
  if (tier === "free-byok") return provider.type === "cloud" && provider.pricingTier === "freemium";
  return provider.type === "cloud" && provider.pricingTier === "paid";
}

export default function AISetupWizard({ project, updateProject, onComplete, onBack }: AISetupWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedTier, setSelectedTier] = useState<AiTier | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [settings, setSettings] = useState<AISettings>(project.aiSettings || { provider: 'auto', fallbackOrder: [] });
  const [isDetecting, setIsDetecting] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<string, HealthStatus>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Task 3 (BYOK vault passphrase) — a separate, in-memory-only secret used to
  // encrypt provider API keys, distinct from the login passcode. See
  // src/services/vaultPassphrase.ts for why: the login passcodeHash used to be
  // reused as the encryption secret, but it's stored in the same localStorage
  // blob as the encrypted keys (and isn't even really hashed), which defeated
  // the point of encrypting at all.
  const [vaultUnlocked, setVaultUnlocked] = useState(isVaultUnlocked());
  const [vaultInput, setVaultInput] = useState("");
  const vaultSecret = getVaultPassphrase() || "";

  const handleUnlockVault = () => {
    if (!vaultInput.trim()) return;
    setVaultPassphrase(vaultInput);
    setVaultUnlocked(true);
    setVaultInput("");
  };

  // Check if Gemini key is set on the server via .env on mount
  useEffect(() => {
    const checkServerKey = async () => {
      try {
        const resp = await fetch("/api/health");
        if (resp.ok) {
          const data = await resp.json();
          if (data.geminiKeySet) {
            // Automatically pre-select Gemini
            setSelectedProviders(prev => Array.from(new Set([...prev, "gemini"])));
            
            // Pre-fill geminiApiKey with "defined_on_server" dummy key
            const encryptedDummy = await encryptDataAsync("defined_on_server", vaultSecret);
            setSettings(prev => ({
              ...prev,
              geminiApiKey: encryptedDummy
            }));
          }
        }
      } catch (e) {
        console.error("Failed to query health endpoint for fallback key verification:", e);
      }
    };
    checkServerKey();
  }, [vaultSecret]);

  // Step 1: Detect local servers on mount
  useEffect(() => {
    const detectLocal = async () => {
      try {
        const results = await AIGateway.detectLocalServers();
        const autoSelected = [];
        if (results.ollama.status === 'online') autoSelected.push('ollama');
        if (results.custom.status === 'online') autoSelected.push('custom');
        
        if (autoSelected.length > 0) {
          setSelectedProviders(prev => Array.from(new Set([...prev, ...autoSelected])));
        }
        setHealthResults(prev => ({ ...prev, ...results }));
      } catch (e) {
        console.error("Failed to detect local servers", e);
      } finally {
        setIsDetecting(false);
      }
    };
    detectLocal();
  }, []);

  const handleProviderToggle = (id: string) => {
    setSelectedProviders(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // Task 2 (AES-GCM upgrade, 2026-07-24 follow-up session): decryption is now
  // async (encryptDataAsync/decryptDataAsync, Web Crypto AES-GCM) — can no
  // longer be called inline inside JSX's `value={...}`. decryptedKeys mirrors
  // the plaintext for display, kept in sync by the effect below; typing
  // updates it optimistically here so the input feels instant, without
  // waiting on the encrypt round-trip before echoing what was typed.
  const [decryptedKeys, setDecryptedKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        AI_PROVIDERS.filter(p => p.requiresApiKey).map(async (p) => {
          const cipher = (settings as any)[`${p.id}ApiKey`];
          if (!cipher) return [p.id, ""] as const;
          try {
            const plain = await decryptDataAsync(cipher, vaultSecret);
            return [p.id, plain === "defined_on_server" ? "Defined on Server (.env)" : plain] as const;
          } catch {
            // Wrong/missing vault passphrase, or old pre-AES-GCM ciphertext —
            // same "treat as unset" handling as aiGateway.ts's getApiKey.
            return [p.id, ""] as const;
          }
        })
      );
      if (!cancelled) setDecryptedKeys(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [settings, vaultSecret]);

  const handleSettingChange = async (provider: string, field: string, value: string) => {
    if (field.toLowerCase().includes('apikey')) {
      setDecryptedKeys(prev => ({ ...prev, [provider]: value }));
      const finalValue = value ? await encryptDataAsync(value, vaultSecret) : "";
      setSettings(prev => ({ ...prev, [`${provider}${field}`]: finalValue }));
      return;
    }

    setSettings(prev => ({
      ...prev,
      [`${provider}${field}`]: value
    }));
  };

  const testConnection = async (providerId: string) => {
    setIsTesting(true);
    try {
      const result = await AIGateway.healthCheckProvider(providerId, settings);
      setHealthResults(prev => ({ ...prev, [providerId]: result }));
      
      // If Ollama is online, fetch models
      if (providerId === 'ollama' && result.status === 'online') {
        const models = await AIGateway.getOllamaModels(settings.ollamaEndpoint);
        if (models.length > 0 && !settings.ollamaModel) {
          setSettings(prev => ({ ...prev, ollamaModel: models[0] }));
        }
      }
    } catch (e) {
      setHealthResults(prev => ({ 
        ...prev, 
        [providerId]: { provider: providerId, status: 'offline', error: 'Connection failed' } 
      }));
    } finally {
      setIsTesting(false);
    }
  };

  const runFinalValidation = async () => {
    setIsTesting(true);
    try {
      // Create a test settings object with only selected providers
      const testSettings = { ...settings, fallbackOrder: selectedProviders };
      const results = await AIGateway.healthCheckAll(testSettings);
      setHealthResults(prev => ({ ...prev, ...results }));
      
      // Determine overall readiness
      const onlineCount = selectedProviders.filter(p => results[p]?.status === 'online').length;
      
      const newSettings: AISettings = {
        ...testSettings,
        providerHealth: results,
        aiReadiness: onlineCount > 0 ? 'validated' : 'simulated'
      };
      
      updateProject({ aiSettings: newSettings });
      setSettings(newSettings);
      setStep(3);
    } catch (e) {
      console.error("Validation failed", e);
    } finally {
      setIsTesting(false);
    }
  };

  const TIER_CARDS: { id: AiTier; label: string; description: string; icon: React.ReactNode }[] = [
    {
      id: "local",
      label: "Local Router",
      description: "Free, no sign-up, no API key. Run models on your own machine (Ollama, LM Studio, or a custom local server) — completely private, zero cost.",
      icon: <Server className="w-6 h-6" />,
    },
    {
      id: "free-byok",
      label: "Free-Tier BYOK",
      description: "Free signup required. Bring your own API key from a provider with a usable free tier (currently Google Gemini).",
      icon: <Key className="w-6 h-6" />,
    },
    {
      id: "heavy-byok",
      label: "Heavy BYOK",
      description: "You pay your provider directly. Bring your own paid-tier API key (OpenAI, Anthropic, DeepSeek, Qwen, Cohere) for full-capability access.",
      icon: <Cloud className="w-6 h-6" />,
    },
  ];

  const renderStep0 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">Choose Your AI Access Tier</h2>
        <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
          You bring your own AI access — pick how you want to connect. You can change this later in AI Settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIER_CARDS.map((tier) => (
          <div
            key={tier.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setSelectedTier(tier.id);
              setStep(1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedTier(tier.id);
                setStep(1);
              }
            }}
            className="p-5 rounded-xl border cursor-pointer transition-all duration-300 bg-[#FAF8F5] border-[#E2E8F0] hover:border-[#C08A3E]/50 hover:bg-white"
          >
            <div className="text-[#946A30] mb-3">{tier.icon}</div>
            <h4 className="font-bold text-[#1A365D] text-sm mb-2">{tier.label}</h4>
            <p className="text-xs text-gray-500 leading-relaxed">{tier.description}</p>
          </div>
        ))}

        {/* Tier 4 (affiliate-linked subscription) is a sponsored-placement signup
            flow, not a technical AI-calling mechanism (see ai-gateway.md §4) —
            shown here as an informational, non-selectable card only. */}
        <div className="p-5 rounded-xl border border-dashed border-gray-250 bg-gray-50 opacity-70 cursor-not-allowed">
          <div className="text-gray-400 mb-3">
            <Zap className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-gray-500 text-sm mb-2">Affiliate Subscription <span className="text-[10px] font-mono uppercase">(Coming Soon)</span></h4>
          <p className="text-xs text-gray-400 leading-relaxed">
            Get AI access without configuring your own key, via a partnered subscription offer.
          </p>
        </div>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">Initialize AI Intelligence</h2>
        <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
          The Doctoral Assistant requires an AI engine to analyze your dissertation and draft the journal article.
          Select one or more providers below. We will automatically route requests to the best available model.
        </p>
        {selectedTier && (
          <button
            onClick={() => setStep(0)}
            className="mt-3 text-xs text-[#C08A3E] hover:text-[#A87630] font-mono underline cursor-pointer"
          >
            ← Change Tier
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Cloud Providers — hidden entirely when the "local" tier is selected */}
        {selectedTier !== "local" && (
        <div className="space-y-4">
          <h3 className="text-lg font-serif font-bold text-[#1A365D] flex items-center gap-2">
            <Cloud className="text-[#C08A3E]" /> Cloud AI Providers
          </h3>
          <div className="grid gap-3">
            {AI_PROVIDERS.filter(p => p.type === 'cloud').filter(p => !selectedTier || providerMatchesTier(p, selectedTier)).map(provider => (
              <div
                key={provider.id}
                role="button"
                tabIndex={0}
                onClick={() => handleProviderToggle(provider.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleProviderToggle(provider.id);
                  }
                }}
                className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                  selectedProviders.includes(provider.id)
                    ? 'bg-[color:var(--color-cyan-accent)]/5 border-[color:var(--color-cyan-accent)] shadow-sm'
                    : 'bg-[#FAF8F5] border-[#E2E8F0] hover:border-[#C08A3E]/30 hover:bg-[#FAF8F5]/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl bg-white border border-[#E2E8F0] p-2 rounded-lg">{provider.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-[#1A365D] text-sm">{provider.name}</h4>
                      {selectedProviders.includes(provider.id) && (
                        <CheckCircle2 className="text-[color:var(--color-cyan-accent-dim)] w-5 h-5 animate-scale-in" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {provider.pricingTier === 'free' ? 'Free Tier' : provider.pricingTier === 'freemium' ? 'Freemium' : 'API Key Req'}
                      </span>
                      {provider.id === 'server' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                          Recommended
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Local Servers — hidden entirely when a BYOK (cloud) tier is selected */}
        {(!selectedTier || selectedTier === "local") && (
        <div className="space-y-4">
          <h3 className="text-lg font-serif font-bold text-[#1A365D] flex items-center gap-2">
            <Server className="text-[#C08A3E]" /> Local AI Servers
          </h3>
          <div className="grid gap-3">
            {AI_PROVIDERS.filter(p => p.type === 'local').map(provider => {
              const isDetected = healthResults[provider.id]?.status === 'online';
              return (
                <div
                  key={provider.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleProviderToggle(provider.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleProviderToggle(provider.id);
                    }
                  }}
                  className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                    selectedProviders.includes(provider.id)
                      ? 'bg-[color:var(--color-cyan-accent)]/5 border-[color:var(--color-cyan-accent)] shadow-sm'
                      : 'bg-[#FAF8F5] border-[#E2E8F0] hover:border-[#C08A3E]/30 hover:bg-[#FAF8F5]/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl bg-white border border-[#E2E8F0] p-2 rounded-lg">{provider.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-[#1A365D] text-sm">{provider.name}</h4>
                        {selectedProviders.includes(provider.id) && (
                          <CheckCircle2 className="text-[color:var(--color-cyan-accent-dim)] w-5 h-5 animate-scale-in" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                          <Shield className="w-3 h-3" /> 100% Private
                        </span>
                        {isDetecting ? (
                          <span className="text-[10px] flex items-center gap-1 text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                          </span>
                        ) : isDetected ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--color-cyan-accent)]/10 text-[#0E7490] border border-[color:var(--color-cyan-accent)]/30 flex items-center gap-1 font-bold">
                            <span className="w-1.5 h-1.5 bg-[color:var(--color-cyan-accent)] rounded-full animate-pulse"></span>
                            Detected
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      <div className="flex justify-between items-center pt-8 border-t border-gray-150">
        <p className="text-xs text-gray-500 font-mono">
          Selected: <span className="font-bold text-[#1A365D]">{selectedProviders.length} providers</span>
        </p>
        <button
          onClick={() => setStep(2)}
          disabled={selectedProviders.length === 0}
          className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider font-mono text-white bg-[#1A365D] hover:bg-[#122847] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          Configure Providers <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const selected = AI_PROVIDERS.filter(p => selectedProviders.includes(p.id));
    const needsVault = selected.some(p => p.requiresApiKey);

    if (needsVault && !vaultUnlocked) {
      return (
        <div className="space-y-6 animate-fade-in max-w-xl mx-auto text-center">
          <div className="w-14 h-14 bg-[#1A365D]/5 border border-gray-200 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-[#C08A3E]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-serif text-[#1A365D] mb-3">Unlock Your Key Vault</h2>
            <p className="text-[#6B665E] text-sm">
              Choose a vault passphrase. It encrypts your provider API keys and is held only in this
              browser tab's memory — never written to disk or synced anywhere. Closing or reloading
              the tab locks the vault again; you'll enter this passphrase each session before your
              keys can be used. There is no recovery if you forget it — you'd re-enter your API keys.
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
      );
    }

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">Configure Connections</h2>
          <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
            Provide the necessary API keys or endpoint URLs for your selected AI engines.
            Keys are XOR-encrypted locally and never stored in plain text.
          </p>
        </div>

        <div className="grid gap-6 max-w-3xl mx-auto">
          {selected.map(provider => {
            const health = healthResults[provider.id];
            
            return (
              <div key={provider.id} className="bg-[#FAF8F5] border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <h3 className="text-base font-serif font-bold text-[#1A365D]">{provider.name}</h3>
                  </div>
                  {health && (
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      health.status === 'online' ? 'bg-[color:var(--color-cyan-accent)]/10 text-[#0E7490] border border-[color:var(--color-cyan-accent)]/30' :
                      health.status === 'offline' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {health.status === 'online' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {health.status.toUpperCase()}
                      {health.latencyMs && <span className="ml-1 opacity-75">({health.latencyMs}ms)</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* API Key Input for Cloud */}
                  {provider.requiresApiKey && provider.id !== 'server' && (
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Key className="w-4 h-4 text-[#C08A3E]" /> API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys[provider.id] ? "text" : "password"}
                          placeholder={`Enter ${provider.name} API Key`}
                          value={decryptedKeys[provider.id] ?? ""}
                          className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all font-mono text-sm placeholder:text-gray-400"
                          onChange={(e) => handleSettingChange(provider.id, 'ApiKey', e.target.value)}
                        />
                        <button 
                          onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-gray-400 hover:text-[#1A365D] cursor-pointer"
                        >
                          {showKeys[provider.id] ? 'HIDE' : 'SHOW'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Endpoint Input for Local */}
                  {provider.type === 'local' && (
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#C08A3E]" /> Server Endpoint URL
                      </label>
                      <input
                        type="text"
                        placeholder={provider.id === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1'}
                        value={(settings as any)[provider.id + 'Endpoint'] || (provider.id === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234/v1')}
                        onChange={(e) => handleSettingChange(provider.id, 'Endpoint', e.target.value)}
                        className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all font-mono text-sm placeholder:text-gray-400"
                      />
                    </div>
                  )}

                  {/* Model Selector */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-[#C08A3E]" /> Default Model
                      </label>
                      <select
                        value={(settings as any)[provider.id + 'Model'] || provider.defaultModel}
                        onChange={(e) => handleSettingChange(provider.id, 'Model', e.target.value)}
                        className="w-full bg-white border border-[#D1CEC7] rounded-xl py-2.5 px-4 text-[#1A365D] focus:outline-none focus:ring-2 focus:ring-[#1A365D]/10 focus:border-[#1A365D] transition-all text-sm cursor-pointer"
                      >
                        {health?.models?.length ? (
                          health.models.map((m: string) => <option key={m} value={m}>{m}</option>)
                        ) : (
                          provider.availableModels.map((m: string) => <option key={m} value={m}>{m}</option>)
                        )}
                      </select>
                    </div>
                    
                    <div className="flex items-end">
                      <button
                        onClick={() => testConnection(provider.id)}
                        disabled={isTesting}
                        className="w-full py-2.5 px-4 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-gray-700 bg-white border border-[#E2E8F0] hover:bg-neutral-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                      >
                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Test Connection
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-8 border-t border-[#E2E8F0] max-w-3xl mx-auto">
          <button
            onClick={() => setStep(1)}
            className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider border border-[#E2E8F0] bg-white text-gray-600 hover:bg-neutral-50 cursor-pointer transition-all"
          >
            Back
          </button>
          <button
            onClick={runFinalValidation}
            disabled={isTesting}
            className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-white bg-[#1A365D] hover:bg-[#122847] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            {isTesting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Validating...</>
            ) : (
              <>Validate & Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const isReady = settings.aiReadiness === 'validated';
    
    return (
      <div className="space-y-8 animate-fade-in max-w-2xl mx-auto text-center py-4">
        <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
          <div className={`absolute inset-0 rounded-full opacity-20 animate-ping ${isReady ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
          <div className={`relative w-full h-full rounded-full flex items-center justify-center ${isReady ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`}>
            {isReady ? <CheckCircle2 className="w-10 h-10 text-white" /> : <AlertTriangle className="w-10 h-10 text-white" />}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1A365D] mb-3">
            {isReady ? 'Systems Validated' : 'No Providers Online'}
          </h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {isReady 
              ? "Your AI Gateway is configured and ready. The system will intelligently route requests across your selected models to optimize cost and performance."
              : "We couldn't verify a connection to any of your selected AI providers. You can proceed, but the system will use a highly limited simulated fallback mode."}
          </p>
        </div>

        <div className="bg-[#FAF8F5] rounded-2xl p-6 border border-[#E2E8F0] text-left">
          <h4 className="text-xs font-bold font-mono text-[#6B665E] uppercase tracking-wider mb-4">Gateway Diagnostics</h4>
          <div className="space-y-3">
            {selectedProviders.map(id => {
              const pInfo = AI_PROVIDERS.find(p => p.id === id);
              const status = healthResults[id]?.status || 'offline';
              return (
                <div key={id} className="flex items-center justify-between py-2 border-b border-gray-150 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{pInfo?.icon}</span>
                    <span className="font-bold text-[#1A365D] text-sm">{pInfo?.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {status === 'online' && healthResults[id]?.latencyMs && (
                      <span className="text-xs font-mono text-gray-500">{healthResults[id].latencyMs}ms</span>
                    )}
                    <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-full ${
                      status === 'online' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-6 space-y-3">
          <button
            onClick={() => onComplete(isReady ? 'validated' : 'simulated', 'vault')}
            className={`w-full py-3.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
              isReady 
                ? 'bg-emerald-600 hover:bg-emerald-750'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            {isReady ? 'Proceed to Knowledge Vault' : 'Proceed with Simulated AI'}
            <ChevronRight className="w-4 h-4" />
          </button>
          
          <div className="flex items-center justify-between pt-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-xs font-mono font-bold text-gray-400 hover:text-[#1A365D] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Login
              </button>
            )}
            {!isReady && (
              <button
                onClick={() => setStep(2)}
                className="text-xs font-mono font-bold text-gray-400 hover:text-[#1A365D] transition-colors cursor-pointer ml-auto"
              >
                Return to Configuration
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full text-[#1A365D] font-sans selection:bg-[#1A365D] selection:text-white">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Progress Tracker — only shown once a tier is picked (step > 0); the tier-selection screen itself isn't part of this 3-step tracker. */}
        {step > 0 && (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(num => (
              <React.Fragment key={num}>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border text-xs font-mono font-bold transition-all duration-350 ${
                  step >= num
                    ? 'border-[color:var(--color-cyan-accent-dim)] bg-[color:var(--color-cyan-accent-dim)] text-white shadow-sm'
                    : 'border-gray-300 text-gray-400 bg-white'
                }`}>
                  {num}
                </div>
                {num < 3 && (
                  <div className={`w-12 h-[1px] transition-all duration-350 ${
                    step > num ? 'bg-[color:var(--color-cyan-accent-dim)]' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        )}

        {/* Wizard Content Card */}
        <div className="bg-white/95 border border-[#E2E8F0] rounded-3xl shadow-xl p-8 md:p-10 space-y-6">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.3s ease-out forwards; }
      `}} />
    </div>
  );
}
