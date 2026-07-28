import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Cloud, Server, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Key, Cpu, Zap, Search, Loader2, BookOpen, Sparkles } from 'lucide-react';
import { PaperProject, AISettings, HealthStatus, AIProviderInfo } from '../types';
import AIGateway, { AI_PROVIDERS } from '../services/aiGateway';
import { encryptDataAsync, decryptDataAsync } from '../utils/crypto';
import { setVaultPassphrase, getVaultPassphrase, isVaultUnlocked } from '../services/vaultPassphrase';
import { AI_MODES, getAIMode, AIModeId } from '../config/aiModes';
import AIModeCard from './ai/AIModeCard';

interface AISetupWizardProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onComplete: (readiness: 'validated' | 'simulated', nextChoice: 'vault' | 'skip') => void;
  onBack?: () => void;
}

// AI modes redesign (2026-07-28) — replaces the old internal 3-tier
// selection screen ("Local Router" / "Free-Tier BYOK" / "Heavy BYOK") with
// the 5 user-facing AI Mode cards from src/config/aiModes.ts. See
// docs/planning/ai-modes-reconciliation.md for how these map onto
// ai-gateway.md's tier model — this component only ever deals in AIModeId
// and the config's own provider option lists now, never a raw pricingTier
// filter. Smart AI is the one mode with a genuinely different flow (no
// provider selection, no key entry, no vault interaction at all) — see
// handleSelectMode below.

export default function AISetupWizard({ project, updateProject, onComplete, onBack }: AISetupWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState<AIModeId | null>(null);
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

  // Smart AI's whole premise is "continue → done": no provider list, no key
  // entry, no vault interaction (docs/planning/ai-modes-reconciliation.md
  // §4 — Smart AI never touches the vault, there's no key to protect).
  // Still runs one REAL health check before marking readiness — never an
  // optimistic "Connected" — self-contained rather than reusing
  // runFinalValidation() because that function reads `selectedProviders`
  // from closure state, which setSelectedProviders() wouldn't update
  // synchronously in the same click handler.
  const handleSelectSmartAI = async () => {
    setSelectedMode("smart");
    setSelectedProviders(["pollinations"]);
    setIsTesting(true);
    try {
      const testSettings: AISettings = { ...settings, provider: "pollinations", fallbackOrder: ["pollinations"] };
      const results = await AIGateway.healthCheckAll(testSettings);
      setHealthResults(prev => ({ ...prev, ...results }));
      const newSettings: AISettings = {
        ...testSettings,
        providerHealth: results,
        aiReadiness: results.pollinations?.status === "online" ? "validated" : "simulated"
      };
      updateProject({ aiSettings: newSettings });
      setSettings(newSettings);
      setStep(3);
    } catch (e) {
      console.error("Smart AI validation failed", e);
      setStep(3);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSelectMode = (id: AIModeId) => {
    if (id === "smart") {
      handleSelectSmartAI();
      return;
    }
    setSelectedMode(id);
    setSelectedProviders([]);
    setStep(1);
  };

  const renderStep0 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">How would you like your AI assistant to work?</h2>
        <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
          Pick a connection method below. You can change this later in AI Settings.
        </p>
      </div>

      {/* Recommendation banner — per docs/planning/ai-modes-reconciliation.md
          §1, Smart AI is genuinely working but rate-limited to ~1 req/15s and
          not meant for heavy use, so it's framed as "fastest to try", not "the"
          universal recommendation. Cloud AI Providers (a real, dedicated free
          tier) is the recommended path for regular drafting work. */}
      <div className="max-w-2xl mx-auto p-4 bg-[color:var(--color-cyan-accent)]/5 border border-[color:var(--color-cyan-accent)]/30 rounded-xl flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-[color:var(--color-cyan-accent-dim)] shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-[#1A365D] mb-1">Not sure which option to choose?</h4>
          <p className="text-xs text-[#475569] leading-relaxed">
            Try <strong>Smart AI</strong> right now — no setup at all — to see the assistant in action. For regular drafting work,
            <strong> Cloud AI Providers</strong> gives you a free, dedicated connection that won't run into Smart AI's shared rate limit.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {AI_MODES.map((mode) => (
          <AIModeCard
            key={mode.id}
            mode={mode}
            isSelected={selectedMode === mode.id}
            onSelect={handleSelectMode}
          />
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => {
    const modeConfig = selectedMode ? getAIMode(selectedMode) : undefined;
    const isLocalMode = selectedMode === "local";

    // Local AI's provider list has duplicate provider ids by design (LM
    // Studio / OmniRoute / Custom server all resolve to the "custom"
    // adapter, just with a different default local port — see
    // src/config/aiModes.ts's AIModeProviderOption.defaultEndpoint and
    // docs/planning/ai-modes-reconciliation.md §3). Selecting one of those
    // presets a single settings.customEndpoint rather than adding several
    // independent "custom" entries to selectedProviders.
    const handleLocalOptionToggle = (option: { id: string; label: string; defaultEndpoint?: string }) => {
      if (option.id !== "custom") {
        handleProviderToggle(option.id);
        return;
      }
      if (option.defaultEndpoint) {
        setSettings(prev => ({ ...prev, customEndpoint: option.defaultEndpoint }));
      }
      setSelectedProviders(prev => (prev.includes("custom") ? prev : [...prev, "custom"]));
    };

    return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-serif text-[#1A365D] mb-3">
          {modeConfig ? modeConfig.title : "Choose Your Providers"}
        </h2>
        <p className="text-[#6B665E] max-w-2xl mx-auto text-sm">
          {modeConfig ? modeConfig.description : "Select one or more providers below. We will automatically route requests to the best available model."}
        </p>
        {selectedMode && (
          <button
            onClick={() => setStep(0)}
            className="mt-3 text-xs text-[#C08A3E] hover:text-[#A87630] font-mono underline cursor-pointer"
          >
            ← Change AI Mode
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-2xl mx-auto">
        {isLocalMode && !isDetecting && (
          <div className="p-3 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl flex items-start gap-2 text-xs text-[#475569]">
            <Shield className="w-4 h-4 text-[#C08A3E] shrink-0 mt-0.5" />
            <span>Nothing you write or generate leaves your computer with Local AI — this app talks directly to the program you choose below, running on your own machine.</span>
          </div>
        )}
        {(modeConfig?.providers || []).map((option, idx) => {
          const isSelected = isLocalMode && option.id === "custom"
            ? selectedProviders.includes("custom") && settings.customEndpoint === (option.defaultEndpoint || settings.customEndpoint)
            : selectedProviders.includes(option.id);
          const isDetected = healthResults[option.id]?.status === 'online';
          return (
            <div
              key={`${option.id}-${idx}`}
              role="button"
              tabIndex={0}
              onClick={() => isLocalMode ? handleLocalOptionToggle(option) : handleProviderToggle(option.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  isLocalMode ? handleLocalOptionToggle(option) : handleProviderToggle(option.id);
                }
              }}
              className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                isSelected
                  ? 'bg-[color:var(--color-cyan-accent)]/5 border-[color:var(--color-cyan-accent)] shadow-sm'
                  : 'bg-[#FAF8F5] border-[#E2E8F0] hover:border-[#C08A3E]/30 hover:bg-[#FAF8F5]/50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[#1A365D] text-sm">{option.label}</h4>
                    {isSelected && <CheckCircle2 className="text-[color:var(--color-cyan-accent-dim)] w-5 h-5 animate-scale-in" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {option.noAccountRequired && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> No account needed
                      </span>
                    )}
                    {isLocalMode && (isDetecting ? (
                      <span className="text-[10px] flex items-center gap-1 text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                      </span>
                    ) : isDetected ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--color-cyan-accent)]/10 text-[#0E7490] border border-[color:var(--color-cyan-accent)]/30 flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 bg-[color:var(--color-cyan-accent)] rounded-full animate-pulse"></span>
                        Detected running
                      </span>
                    ) : null)}
                    {!isLocalMode && option.getKeyUrl && (
                      <a
                        href={option.getKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-[#C08A3E] hover:text-[#A87630] underline font-mono"
                      >
                        Get your API key →
                      </a>
                    )}
                  </div>
                  {isLocalMode && option.installGuidance && (
                    <p className="text-[10px] text-gray-500 mt-2 leading-relaxed border-t border-[#E2E8F0] pt-2">
                      {option.installGuidance}
                      {option.installUrl && (
                        <>
                          {" "}
                          <a
                            href={option.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#C08A3E] hover:text-[#A87630] underline font-mono"
                          >
                            Download →
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-8 border-t border-gray-150 max-w-2xl mx-auto">
        <p className="text-xs text-gray-500 font-mono">
          Selected: <span className="font-bold text-[#1A365D]">{selectedProviders.length} providers</span>
        </p>
        <button
          onClick={() => setStep(2)}
          disabled={selectedProviders.length === 0}
          className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider font-mono text-white bg-[#1A365D] hover:bg-[#122847] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
    );
  };

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
        {/* Progress Tracker — only shown once an AI mode is picked (step > 0); the mode-selection screen itself isn't part of this 3-step tracker. */}
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
