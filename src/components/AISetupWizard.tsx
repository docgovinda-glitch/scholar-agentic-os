import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Cloud, Server, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, Key, Cpu, Zap, Search, Loader2, BookOpen } from 'lucide-react';
import { PaperProject, AISettings, HealthStatus, AIProviderInfo } from '../types';
import AIGateway, { AI_PROVIDERS } from '../services/aiGateway';
import { encryptDataAsync, decryptDataAsync } from '../utils/crypto';
import { setVaultPassphrase, getVaultPassphrase, isVaultUnlocked } from '../services/vaultPassphrase';
import { AI_MODES, getAIMode, AIModeId } from '../config/aiModes';
import AIModeAccordion from './ai/AIModeAccordion';
import { resolveWizardRoute } from '../utils/aiSetupWizardRouting';
import { useFocusOnNavigate } from '../hooks/useFocusOnNavigate';
import telemetry from '../services/telemetryService';

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
// filter.
//
// Follow-up correction (2026-07-28): the old "Smart AI" mode (Pollinations-
// backed) was confirmed to only simulate success in some paths rather than
// reliably deliver, and has been removed — along with its special-cased
// "continue → done" shortcut that skipped provider selection/connection
// testing entirely. OmniRoute replaces it as Option 1 and goes through the
// SAME standard select-mode → detect/configure → test → continue flow as
// every other mode (it is not zero-install, so a shortcut would misrepresent
// it exactly the way the old Smart AI shortcut did).

export default function AISetupWizard({ project, updateProject, onComplete, onBack }: AISetupWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState<AIModeId | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [settings, setSettings] = useState<AISettings>(project.aiSettings || { provider: 'auto', fallbackOrder: [] });
  const [isDetecting, setIsDetecting] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [healthResults, setHealthResults] = useState<Record<string, HealthStatus>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  // Surfaced next to Validate & Continue — see runFinalValidation for why a
  // silent failure there read as a dead button.
  const [validationError, setValidationError] = useState<string | null>(null);

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

  // Navigation overhaul Phase 2 (docs/planning/navigation-scoping.md) — hash
  // reflection for this wizard's own step/mode/providers, previously
  // entirely local state invisible to the URL. Deliberately does NOT touch
  // vaultUnlocked in either direction: that's a real, stateless fact
  // (isVaultUnlocked()) seeded once above and re-checked live by
  // handleUnlockVault — a crafted or restored hash can never mark a vault
  // "unlocked". See src/utils/aiSetupWizardRouting.ts for the pure resolver
  // (unit-tested in isolation) this reads from.
  //
  // Hash -> state: mount + hashchange only (deps: [] — this wizard only ever
  // exists while onboardingStep === "ai-setup", set once by the parent's own
  // useHashNavigation; re-subscribing per-render risks the exact unstable-
  // effect-dependency infinite loop already found and fixed once this
  // session in App.tsx's phase-workflow wiring).
  useEffect(() => {
    const parseAndApply = () => {
      const hash = window.location.hash;
      const bareHash = "#onboarding/ai-setup";
      const prefix = `${bareHash}/`;
      // Real bug caught by a failing browser-back test, not assumed: the
      // bare hash (no sub-segments — the state a real browser-back to
      // mode-selection actually lands on) doesn't start with the trailing-
      // slash prefix, so it was being silently ignored entirely, leaving
      // the wizard stuck on whatever step it was on before. Both shapes
      // must resolve, not just the sub-segmented one.
      if (hash !== bareHash && !hash.startsWith(prefix)) return;
      const rest = hash === bareHash ? "" : hash.slice(prefix.length);
      const [modeSeg, stepSeg, providersSeg] = rest.split("/");
      const resolved = resolveWizardRoute(modeSeg, stepSeg, providersSeg);
      setSelectedMode(resolved.mode);
      setStep(resolved.step);
      setSelectedProviders(resolved.providers);
    };
    parseAndApply();
    window.addEventListener("hashchange", parseAndApply);
    return () => window.removeEventListener("hashchange", parseAndApply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State -> hash: writes back whenever the user's real position in the
  // wizard changes. Guards every write against the hash already matching,
  // same defense-in-depth discipline as the phase-workflow fix.
  useEffect(() => {
    const targetHash = selectedMode
      ? `#onboarding/ai-setup/${selectedMode}/${step}/${selectedProviders.join(",")}`
      : "#onboarding/ai-setup";
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, [selectedMode, step, selectedProviders.join(",")]);

  // Focus management — lands on the wizard content card on every step
  // change (including the vault-gate variant of step 2, which swaps content
  // without changing `step` itself, hence including vaultUnlocked in the key).
  const wizardContentRef = useFocusOnNavigate<HTMLDivElement>(`${step}:${vaultUnlocked}`);

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
            
            // Pre-fill geminiApiKey with "defined_on_server" dummy key.
            // Requires an unlocked vault — encryptDataAsync refuses an empty
            // secret — so this becomes effective on unlock, when vaultSecret
            // changes and re-runs this effect.
            if (!vaultSecret) return;
            const encryptedDummy = await encryptDataAsync("defined_on_server", vaultSecret);
            setSettings(prev => ({
              ...prev,
              geminiApiKey: encryptedDummy
            }));
            // The hydration effect now keys off vaultSecret alone, so it will
            // not observe this write — reflect the display label directly.
            setDecryptedKeys(prev =>
              prev.gemini ? prev : { ...prev, gemini: "Defined on Server (.env)" }
            );
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
        const autoSelected: string[] = [];
        if (results.ollama.status === 'online') autoSelected.push('ollama');
        if (results.custom.status === 'online') autoSelected.push('custom');
        if (results.omniroute.status === 'online') autoSelected.push('omniroute');

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

  // Fields the user is actively editing. A ref, not state, so marking one
  // dirty never re-runs the hydration effect below.
  const dirtyKeysRef = React.useRef<Record<string, boolean>>({});

  // Mirror of `settings` for the commit path, which must read the newest value
  // synchronously — setSettings is async, so a Test Connection fired right
  // after a blur would otherwise encrypt against a stale object.
  const settingsRef = React.useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  /**
   * Hydrate the visible plaintext from stored ciphertext.
   *
   * Bug fix (2026-07-31) — this used to depend on `[settings, vaultSecret]`,
   * which made API-key entry unusable. Every keystroke encrypted the field
   * (PBKDF2, 100k iterations, ~55ms) and wrote `settings`; that write re-ran
   * this effect, which decrypted EVERY key-requiring provider and then
   * overwrote `decryptedKeys` wholesale — clobbering what the user had typed
   * in the meantime with a value one round-trip out of date. Measured cost of
   * entering one 73-character key: ~4s of encryption plus ~104s of decryption,
   * on the main thread, while characters visibly disappeared from the field.
   *
   * Expanding the provider catalog from 12 to 26 tripled the decrypt half of
   * that, turning a slow path into a completely blocked one.
   *
   * Now it depends on `[vaultSecret]` alone: hydration happens once when the
   * vault unlocks, which is the only moment stored ciphertext can newly become
   * readable. Typing performs no cryptography at all (see handleSettingChange);
   * encryption happens once, on blur, in commitApiKey.
   */
  useEffect(() => {
    if (!vaultSecret) {
      setDecryptedKeys({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        AI_PROVIDERS.filter(p => p.requiresApiKey).map(async (p) => {
          const cipher = (settingsRef.current as any)[`${p.id}ApiKey`];
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
      if (cancelled) return;
      setDecryptedKeys(prev => {
        const next: Record<string, string> = Object.fromEntries(entries);
        // Never overwrite a field mid-edit — the whole failure above.
        for (const id of Object.keys(dirtyKeysRef.current)) {
          if (dirtyKeysRef.current[id]) next[id] = prev[id] ?? "";
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [vaultSecret]);

  /** Typing is pure state — no cryptography on the keystroke path. */
  const handleSettingChange = (provider: string, field: string, value: string) => {
    if (field.toLowerCase().includes('apikey')) {
      dirtyKeysRef.current[provider] = true;
      setDecryptedKeys(prev => ({ ...prev, [provider]: value }));
      return;
    }

    setSettings(prev => ({
      ...prev,
      [`${provider}${field}`]: value
    }));
  };

  /**
   * Encrypt every edited key exactly once and fold it into settings.
   *
   * Returns the resulting settings rather than relying on the state update,
   * so callers that immediately need it (connection tests, Continue) act on
   * the committed values instead of a stale render.
   */
  const commitApiKeys = useCallback(async (): Promise<AISettings> => {
    const dirty = Object.keys(dirtyKeysRef.current).filter(id => dirtyKeysRef.current[id]);
    if (dirty.length === 0) return settingsRef.current;

    let next: AISettings = { ...settingsRef.current };
    for (const provider of dirty) {
      const plain = decryptedKeys[provider] ?? "";
      // The server-key placeholder is a display label, not a credential —
      // encrypting it literally would store a key that cannot work.
      if (plain === "Defined on Server (.env)") {
        dirtyKeysRef.current[provider] = false;
        continue;
      }
      const cipher = plain ? await encryptDataAsync(plain, vaultSecret) : "";
      next = { ...next, [`${provider}ApiKey`]: cipher };
      dirtyKeysRef.current[provider] = false;
    }

    settingsRef.current = next;
    setSettings(next);
    return next;
  }, [decryptedKeys, vaultSecret]);

  /**
   * Where "back" goes from the current step, and what to call it.
   *
   * Named after the destination rather than just "Back" so the control says
   * where it leads before it is pressed — on the vault screen in particular,
   * an unlabelled Back reads as though it might discard the passphrase.
   */
  const { goBack, backLabel } = React.useMemo(() => {
    if (step >= 3) return { goBack: () => setStep(2), backLabel: "Back to setup" };
    if (step === 2) return { goBack: () => setStep(1), backLabel: "Back to providers" };
    return { goBack: () => setStep(0), backLabel: "Back to AI modes" };
  }, [step]);

  const testConnection = async (providerId: string) => {
    setIsTesting(true);
    try {
      // Encrypt anything still being edited first — otherwise a user who
      // types a key and clicks Test without leaving the field would be
      // testing the previous (or empty) value.
      const committed = await commitApiKeys();
      const result = await AIGateway.healthCheckProvider(providerId, committed);
      setHealthResults(prev => ({ ...prev, [providerId]: result }));
      
      // If Ollama is online, fetch models
      if (providerId === 'ollama' && result.status === 'online') {
        const models = await AIGateway.getOllamaModels(committed.ollamaEndpoint);
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

  /**
   * Validate the chosen providers and move on.
   *
   * Bug fix (2026-07-31): "Validate & Continue" could appear completely dead.
   * Two causes, both fixed here.
   *
   * 1. Any throw landed in a catch that only called console.error — no
   *    message, no state change, no advance. From the user's side the button
   *    simply did nothing, with the reason visible only in devtools.
   *    Validation is now per-provider and settled individually, so one failing
   *    provider can never abort the whole step, and the wizard ALWAYS advances:
   *    a provider that cannot be reached is a reason to continue in simulated
   *    mode, not a reason to trap someone on this screen.
   *
   * 2. It called healthCheckAll, which probes every local runner in the
   *    catalog plus every cloud provider holding a key. After the catalog grew
   *    that meant ~9 loopback probes (3s timeout each) and a round of proxy
   *    calls the user never asked for — slow enough to look hung, and prone to
   *    tripping the server's own rate limiter (the 429s on /api/generate in the
   *    reported console). Only the selected providers are checked now.
   */
  const runFinalValidation = async () => {
    setIsTesting(true);
    setValidationError(null);
    try {
      const committed = await commitApiKeys();
      const testSettings = { ...committed, fallbackOrder: selectedProviders };

      const settled = await Promise.allSettled(
        selectedProviders.map(id => AIGateway.healthCheckProvider(id, testSettings))
      );

      const results: Record<string, HealthStatus> = {};
      settled.forEach((outcome, i) => {
        const id = selectedProviders[i];
        results[id] = outcome.status === "fulfilled"
          ? outcome.value
          : {
              provider: id,
              status: "offline",
              lastChecked: new Date().toISOString(),
              error: (outcome.reason as Error)?.message || "Connection check failed",
            };
      });
      setHealthResults(prev => ({ ...prev, ...results }));

      const onlineCount = selectedProviders.filter(p => results[p]?.status === 'online').length;
      if (onlineCount === 0) {
        setValidationError(
          "None of the selected providers responded. You can continue anyway — the app will run in simulated mode until a provider connects."
        );
      }

      const newSettings: AISettings = {
        ...testSettings,
        providerHealth: results,
        aiReadiness: onlineCount > 0 ? 'validated' : 'simulated'
      };

      updateProject({ aiSettings: newSettings });
      setSettings(newSettings);
      setStep(3);
    } catch (e) {
      // Reaching here means something outside the per-provider checks failed
      // (e.g. encryption). Say so instead of leaving a dead button.
      console.error("Validation failed", e);
      setValidationError(
        e instanceof Error ? `Could not finish setting up: ${e.message}` : "Could not finish setting up."
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleSelectMode = (id: AIModeId) => {
    setSelectedMode(id);
    setSelectedProviders([]);
    setStep(1);
    telemetry.record('onboarding:ai_mode_selected', { mode: id });
  };

  const renderStep0 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-serif text-[#E2E8F0] mb-3">How would you like your AI assistant to work?</h2>
        <p className="text-[#94A3B8] max-w-2xl mx-auto text-sm">
          Pick a connection method below. You can change this later in AI Settings.
        </p>
      </div>

      {/* Recommendation banner — re-resolved after removing the old Smart AI
          mode (docs/planning/ai-modes-reconciliation.md, follow-up
          correction). The old banner recommended Smart AI specifically
          because it needed zero setup; that's no longer true of Option 1
          (OmniRoute needs a real, ~5-minute local install). Cloud AI
          Providers is the new default recommendation — genuinely
          lower-friction than OmniRoute (a free account, no local install)
          and proven reliable this session, per the task's own guidance. */}
      <div className="max-w-2xl mx-auto p-4 bg-[color:var(--color-luminous-blue)]/5 border border-[color:var(--color-luminous-blue)]/30 rounded-xl flex items-start gap-3">
        <Cloud className="w-5 h-5 text-[color:var(--color-luminous-blue-dim)] shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-[#E2E8F0] mb-1">Not sure which option to choose?</h4>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            <strong>Cloud AI Providers</strong> is the best starting point for most people — a free account with a provider
            like Google Gemini or OpenRouter, no local install required. Already pay for OpenAI, Anthropic, or another
            provider? <strong>Bring Your Own AI</strong> connects it directly.
          </p>
        </div>
      </div>

      {/* Redesign (2026-07-31): this was a grid of five AIModeCards that
          collapsed to one full-width column below `md`, producing the long
          scroll this step was known for — five tall cards before reaching
          anything else. Now the same accordion used by AIControlCenter's AI
          Mode tab, so onboarding and settings present the modes identically
          and the desktop-only rules (Smart Gateway and Local AI need a locally
          running program) apply in both places rather than only in settings. */}
      <AIModeAccordion selectedMode={selectedMode ?? undefined} onSelectMode={handleSelectMode} />
    </div>
  );

  const renderStep1 = () => {
    const modeConfig = selectedMode ? getAIMode(selectedMode) : undefined;
    const isLocalMode = selectedMode === "local";
    // OmniRoute is auto-detected the same way Ollama/LM Studio are (a real
    // running-process check, docs/planning/ai-modes-reconciliation.md's
    // follow-up correction) even though it isn't grouped under the "Local
    // AI" mode — it's a local *router*, not local *inference*, so it must
    // NOT show Local AI's "nothing leaves your computer" privacy banner
    // (that claim is false for OmniRoute — only the routing is local).
    const usesAutoDetection = isLocalMode || selectedMode === "omniroute";

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
        <h2 className="text-3xl font-bold font-serif text-[#E2E8F0] mb-3">
          {modeConfig ? modeConfig.title : "Choose Your Providers"}
        </h2>
        <p className="text-[#94A3B8] max-w-2xl mx-auto text-sm">
          {modeConfig ? modeConfig.description : "Select one or more providers below. We will automatically route requests to the best available model."}
        </p>
        {selectedMode && (
          <button
            onClick={() => setStep(0)}
            className="mt-3 text-xs text-[color:var(--color-luminous-blue)] hover:text-[color:var(--color-luminous-blue-dim)] font-mono underline cursor-pointer"
          >
            ← Change AI Mode
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 max-w-2xl mx-auto">
        {isLocalMode && !isDetecting && (
          <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl flex items-start gap-2 text-xs text-[#94A3B8]">
            <Shield className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
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
              className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-[color:var(--color-luminous-blue)]/5 border-[color:var(--color-luminous-blue)] shadow-sm'
                  : 'bg-[color:var(--color-navy-1)] border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)]/40 hover:bg-[color:var(--color-navy-1)]/50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-[#E2E8F0] text-sm">{option.label}</h4>
                    {isSelected && <CheckCircle2 className="text-[color:var(--color-luminous-blue-dim)] w-5 h-5 animate-scale-in" />}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{option.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {option.noAccountRequired && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--color-navy-3)] text-[#94A3B8] flex items-center gap-1">
                        <Shield className="w-3 h-3" /> No account needed
                      </span>
                    )}
                    {usesAutoDetection && (isDetecting ? (
                      <span className="text-[10px] flex items-center gap-1 text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                      </span>
                    ) : isDetected ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border border-[color:var(--color-luminous-blue)]/30 flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 bg-[color:var(--color-luminous-blue)] rounded-full animate-pulse"></span>
                        Detected running
                      </span>
                    ) : null)}
                    {!usesAutoDetection && option.getKeyUrl && (
                      <a
                        href={option.getKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-[color:var(--color-luminous-blue)] hover:text-[color:var(--color-luminous-blue-dim)] underline font-mono"
                      >
                        Get your API key →
                      </a>
                    )}
                  </div>
                  {usesAutoDetection && option.installGuidance && (
                    <p className="text-[10px] text-gray-400 mt-2 leading-relaxed border-t border-[color:var(--color-navy-4)] pt-2">
                      {option.installGuidance}
                      {option.installUrl && (
                        <>
                          {" "}
                          <a
                            href={option.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[color:var(--color-luminous-blue)] hover:text-[color:var(--color-luminous-blue-dim)] underline font-mono"
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

      <div className="flex justify-between items-center pt-8 border-t border-[color:var(--color-navy-4)] max-w-2xl mx-auto">
        <p className="text-xs text-gray-400 font-mono">
          Selected: <span className="font-bold text-[#E2E8F0]">{selectedProviders.length} providers</span>
        </p>
        <button
          onClick={() => setStep(2)}
          disabled={selectedProviders.length === 0}
          className="px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider font-mono text-white bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
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
          <div className="w-14 h-14 bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-navy-4)] rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-[color:var(--color-luminous-blue)]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-serif text-[#E2E8F0] mb-3">Unlock Your Key Vault</h2>
            <p className="text-[#94A3B8] text-sm">
              Choose a vault passphrase. It encrypts your provider API keys and is held only in this
              browser tab's memory — never written to disk or synced anywhere. Closing or reloading
              the tab locks the vault again; you'll enter this passphrase each session before your
              keys can be used. There is no recovery if you forget it — you'd re-enter your API keys.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {/* index.css's global input[type=password] override forces a
                white background with !important, exempted only by
                .border-0/.bg-transparent — the same bug already found and
                fixed on the dashboard's inputs and ActiveAgentsPanel's
                textarea. Wrapper carries the visual field look instead of
                combining border-0 with a conflicting border utility. */}
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
      );
    }

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold font-serif text-[#E2E8F0] mb-3">Configure Connections</h2>
          <p className="text-[#94A3B8] max-w-2xl mx-auto text-sm">
            Provide the necessary API keys or endpoint URLs for your selected AI engines.
            Keys are XOR-encrypted locally and never stored in plain text.
          </p>
        </div>

        <div className="grid gap-6 max-w-3xl mx-auto">
          {selected.map(provider => {
            const health = healthResults[provider.id];
            
            return (
              <div key={provider.id} className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[color:var(--color-navy-4)]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <h3 className="text-base font-serif font-bold text-[#E2E8F0]">{provider.name}</h3>
                  </div>
                  {health && (
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      health.status === 'online' ? 'bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border border-[color:var(--color-luminous-blue)]/30' :
                      health.status === 'offline' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {health.status === 'online' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                      {health.status.toUpperCase()}
                      {health.latencyMs && <span className="ml-1 opacity-75">({health.latencyMs}ms)</span>}
                    </div>
                  )}
                </div>

                {/* Diagnostics (2026-07-31): the status pill above shows only
                    the word OFFLINE, and health.error — which now carries a
                    specific, actionable reason from src/services/aiErrors.ts
                    ("Invalid API key", "Quota exhausted", "Blocked by the
                    browser (CORS)" plus what to do) — was being discarded.
                    A user whose key was fine but whose selected model was
                    paid-only had no way to tell that apart from a bad key. */}
                {health && health.status !== "online" && health.error && (
                  <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-[#E2E8F0] leading-relaxed">{health.error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* API Key Input for Cloud */}
                  {provider.requiresApiKey && provider.id !== 'server' && (
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Key className="w-4 h-4 text-[color:var(--color-luminous-blue)]" /> API Key
                      </label>
                      {/* Same global input-override exemption as the vault
                          passphrase field above — visual field look moves
                          to this existing relative wrapper. */}
                      <div className="relative rounded-xl border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] focus-within:ring-2 focus-within:ring-[color:var(--color-luminous-blue)]/20">
                        <input
                          type={showKeys[provider.id] ? "text" : "password"}
                          placeholder={`Enter ${provider.name} API Key`}
                          value={decryptedKeys[provider.id] ?? ""}
                          className="border-0 bg-transparent w-full rounded-xl py-2.5 px-4 text-[#E2E8F0] focus:outline-none transition-all font-mono text-sm placeholder:text-gray-400"
                          onChange={(e) => handleSettingChange(provider.id, 'ApiKey', e.target.value)}
                          onBlur={() => { void commitApiKeys(); }}
                        />
                        <button
                          onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-gray-400 hover:text-[#E2E8F0] cursor-pointer"
                        >
                          {showKeys[provider.id] ? 'HIDE' : 'SHOW'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Endpoint Input for Local */}
                  {provider.type === 'local' && (
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Server className="w-4 h-4 text-[color:var(--color-luminous-blue)]" /> Server Endpoint URL
                      </label>
                      <div className="rounded-xl border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] focus-within:ring-2 focus-within:ring-[color:var(--color-luminous-blue)]/20">
                        <input
                          type="text"
                          placeholder={
                            provider.id === 'ollama' ? 'http://localhost:11434' :
                            provider.id === 'omniroute' ? 'http://localhost:20128/v1' :
                            'http://localhost:1234/v1'
                          }
                          value={(settings as any)[provider.id + 'Endpoint'] || (
                            provider.id === 'ollama' ? 'http://localhost:11434' :
                            provider.id === 'omniroute' ? 'http://localhost:20128/v1' :
                            'http://localhost:1234/v1'
                          )}
                          onChange={(e) => handleSettingChange(provider.id, 'Endpoint', e.target.value)}
                          className="border-0 bg-transparent w-full rounded-xl py-2.5 px-4 text-[#E2E8F0] focus:outline-none transition-all font-mono text-sm placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Model Selector */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-[color:var(--color-luminous-blue)]" /> Default Model
                      </label>
                      <div className="rounded-xl border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] focus-within:ring-2 focus-within:ring-[color:var(--color-luminous-blue)]/20">
                        <select
                          value={(settings as any)[provider.id + 'Model'] || provider.defaultModel}
                          onChange={(e) => handleSettingChange(provider.id, 'Model', e.target.value)}
                          className="border-0 bg-transparent w-full rounded-xl py-2.5 px-4 text-[#E2E8F0] focus:outline-none transition-all text-sm cursor-pointer"
                        >
                          {health?.models?.length ? (
                            health.models.map((m: string) => <option key={m} value={m}>{m}</option>)
                          ) : (
                            provider.availableModels.map((m: string) => <option key={m} value={m}>{m}</option>)
                          )}
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex items-end">
                      <button
                        onClick={() => testConnection(provider.id)}
                        disabled={isTesting}
                        className="w-full py-2.5 px-4 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-[#E2E8F0] bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-2)] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
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

        {/* Never leave the primary action looking dead — see runFinalValidation. */}
        {validationError && (
          <div className="max-w-3xl mx-auto flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-[#E2E8F0] leading-relaxed">{validationError}</p>
          </div>
        )}

        <div className="flex justify-between items-center pt-8 border-t border-[color:var(--color-navy-4)] max-w-3xl mx-auto">
          <button
            onClick={() => setStep(1)}
            className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] text-[#94A3B8] hover:bg-[color:var(--color-navy-2)] cursor-pointer transition-all"
          >
            Back
          </button>
          <button
            onClick={runFinalValidation}
            disabled={isTesting}
            className="px-6 py-2.5 rounded-xl font-bold font-mono text-xs uppercase tracking-wider text-white bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
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
          <h2 className="text-2xl font-serif font-bold text-[#E2E8F0] mb-3">
            {isReady ? 'Systems Validated' : 'No Providers Online'}
          </h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
            {isReady 
              ? "Your AI Gateway is configured and ready. The system will intelligently route requests across your selected models to optimize cost and performance."
              : "We couldn't verify a connection to any of your selected AI providers. You can proceed, but the system will use a highly limited simulated fallback mode."}
          </p>
        </div>

        <div className="bg-[color:var(--color-navy-1)] rounded-2xl p-6 border border-[color:var(--color-navy-4)] text-left">
          <h4 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider mb-4">Gateway Diagnostics</h4>
          <div className="space-y-3">
            {selectedProviders.map(id => {
              const pInfo = AI_PROVIDERS.find(p => p.id === id);
              const status = healthResults[id]?.status || 'offline';
              return (
                <div key={id} className="flex items-center justify-between py-2 border-b border-[color:var(--color-navy-4)] last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{pInfo?.icon}</span>
                    <span className="font-bold text-[#E2E8F0] text-sm">{pInfo?.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {status === 'online' && healthResults[id]?.latencyMs && (
                      <span className="text-xs font-mono text-gray-400">{healthResults[id].latencyMs}ms</span>
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
                className="text-xs font-mono font-bold text-gray-400 hover:text-[#E2E8F0] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Login
              </button>
            )}
            {!isReady && (
              <button
                onClick={() => setStep(2)}
                className="text-xs font-mono font-bold text-gray-400 hover:text-[#E2E8F0] transition-colors cursor-pointer ml-auto"
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
    <div className="w-full text-[#E2E8F0] font-sans selection:bg-[color:var(--color-luminous-blue-dim)] selection:text-white">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Progress Tracker — only shown once an AI mode is picked (step > 0); the mode-selection screen itself isn't part of this 3-step tracker. */}
        {step > 0 && (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(num => (
              <React.Fragment key={num}>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border text-xs font-mono font-bold transition-all duration-200 ${
                  step >= num
                    ? 'border-[color:var(--color-luminous-blue-dim)] bg-[color:var(--color-luminous-blue-dim)] text-white shadow-sm'
                    : 'border-[color:var(--color-navy-4)] text-gray-400 bg-[color:var(--color-navy-1)]'
                }`}>
                  {num}
                </div>
                {num < 3 && (
                  <div className={`w-12 h-[1px] transition-all duration-200 ${
                    step > num ? 'bg-[color:var(--color-luminous-blue-dim)]' : 'bg-[color:var(--color-navy-4)]'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        )}

        {/* Persistent Back control (2026-07-31).
            Going back used to mean finding a small "← Change AI Mode" text
            link buried in step 1's header, and on the vault-unlock screen
            there was no way back at all — a user who picked the wrong
            providers had to reload to escape. One control in the shell means
            every step has the same affordance in the same place, and it can
            never be missing from a step again. */}
        {step > 0 && (
          <div className="flex">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[color:var(--color-navy-2)] text-xs font-mono font-semibold uppercase tracking-wider transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              {backLabel}
            </button>
          </div>
        )}

        {/* Wizard Content Card */}
        <div ref={wizardContentRef} tabIndex={-1} className="bg-[color:var(--color-navy-2)]/95 border border-[color:var(--color-navy-4)] rounded-3xl shadow-xl p-8 md:p-10 space-y-6 focus:outline-none">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.2s ease-out forwards; }
      `}} />
    </div>
  );
}
