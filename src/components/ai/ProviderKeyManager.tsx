/**
 * Provider key management for all catalogued cloud providers.
 *
 * Replaces two partial screens. The old "Providers" tab had a dropdown listing
 * 10 of the 12 real providers, and the old "API Keys" tab had six hardcoded
 * password inputs — so a user who chose Groq, Together, OpenRouter or
 * OmniRoute during onboarding could never afterwards view, retest, correct or
 * remove that key without re-running the whole wizard. Every provider in the
 * catalog is manageable here, and adding one to the catalog surfaces it
 * automatically.
 *
 * Progressive disclosure: providers are collapsed rows grouped by what the
 * free access actually is, with a search box, and only the row being edited
 * expands. That keeps ~27 providers navigable on a phone, where the previous
 * layout would have been an unusable wall of inputs.
 */

import React, { useMemo, useState } from "react";
import {
  Search, Check, X, Loader2, ExternalLink, Trash2, ChevronDown,
  AlertTriangle, Zap, Plug, ArrowUp, ArrowDown,
} from "lucide-react";
import type { AISettings } from "../../types";
import { CLOUD_PROVIDERS, type CloudProviderSpec, type FreeTierKind } from "../../config/providerCatalog";
import * as vault from "../../services/apiVault";
import { testProviderConnection, summariseResult, type ConnectionTestResult } from "../../services/connectionTester";

interface ProviderKeyManagerProps {
  settings: AISettings;
  /** Called after any change so the parent can persist and re-check health */
  onVaultChanged: () => void;
  /** Marks a provider as the active one */
  onSelectProvider?: (providerId: string) => void;
  activeProvider?: string;
}

const GROUP_ORDER: Array<{ kind: FreeTierKind; title: string; blurb: string }> = [
  { kind: "free", title: "Free", blurb: "No payment details needed at any point." },
  { kind: "freemium", title: "Free tier", blurb: "An ongoing free allowance, with paid plans above it." },
  { kind: "trial-credits", title: "Free credits", blurb: "Credit on signup that runs out — then pay as you go." },
  { kind: "paid", title: "Paid", blurb: "Requires a funded account. Listed for keys you already hold." },
];

export default function ProviderKeyManager({
  settings,
  onVaultChanged,
  onSelectProvider,
  activeProvider,
}: ProviderKeyManagerProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyConfigured, setOnlyConfigured] = useState(false);
  const [results, setResults] = useState<Record<string, ConnectionTestResult>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const configuredIds = new Set(vault.listEntries().filter((e) => e.apiKey).map((e) => e.providerId));

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = CLOUD_PROVIDERS.filter((spec) => {
      if (onlyConfigured && !configuredIds.has(spec.id)) return false;
      if (!needle) return true;
      return (
        spec.name.toLowerCase().includes(needle) ||
        spec.id.includes(needle) ||
        spec.description.toLowerCase().includes(needle) ||
        spec.models.some((m) => m.toLowerCase().includes(needle))
      );
    });

    return GROUP_ORDER.map((group) => ({
      ...group,
      providers: matches.filter((spec) => spec.freeTier === group.kind),
    })).filter((group) => group.providers.length > 0);
    // configuredIds is derived from vault state, which changes via onVaultChanged
    // and forces a re-render from the parent — so it need not be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onlyConfigured, results]);

  const runTest = async (providerId: string) => {
    setTesting(providerId);
    try {
      const result = await testProviderConnection(providerId, settings);
      setResults((prev) => ({ ...prev, [providerId]: result }));
      onVaultChanged();
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers or models..."
            className="w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg pl-9 pr-3 py-2 text-sm text-[#E2E8F0] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyConfigured((v) => !v)}
          className={`px-3 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
            onlyConfigured
              ? "border-[color:var(--color-luminous-blue)]/50 bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)]"
              : "border-[color:var(--color-navy-4)] text-[#94A3B8] hover:text-[#E2E8F0]"
          }`}
        >
          My keys only ({configuredIds.size})
        </button>
      </div>

      {configuredIds.size > 1 && <FailoverOrderEditor onChanged={onVaultChanged} />}

      {groups.length === 0 && (
        <p className="text-xs text-[#94A3B8] p-4 text-center">No provider matches that search.</p>
      )}

      {groups.map((group) => (
        <section key={group.kind}>
          <div className="flex items-baseline gap-2 flex-wrap mb-2">
            <h4 className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
              {group.title}
            </h4>
            <span className="text-[11px] text-[#94A3B8]/70">{group.blurb}</span>
          </div>
          <div className="space-y-1.5">
            {group.providers.map((spec) => (
              <ProviderRow
                key={spec.id}
                spec={spec}
                settings={settings}
                isExpanded={expanded === spec.id}
                isActive={activeProvider === spec.id}
                isConfigured={configuredIds.has(spec.id)}
                testResult={results[spec.id]}
                isTesting={testing === spec.id}
                onToggle={() => setExpanded((c) => (c === spec.id ? null : spec.id))}
                onTest={() => runTest(spec.id)}
                onChanged={onVaultChanged}
                onSelect={onSelectProvider}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface ProviderRowProps {
  spec: CloudProviderSpec;
  settings: AISettings;
  isExpanded: boolean;
  isActive: boolean;
  isConfigured: boolean;
  testResult?: ConnectionTestResult;
  isTesting: boolean;
  onToggle: () => void;
  onTest: () => void;
  onChanged: () => void;
  onSelect?: (providerId: string) => void;
}

function ProviderRow({
  spec, settings, isExpanded, isActive, isConfigured,
  testResult, isTesting, onToggle, onTest, onChanged, onSelect,
}: ProviderRowProps) {
  const entry = vault.getEntry(spec.id);
  const [keyDraft, setKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState(entry?.baseUrl ?? "");
  const [modelDraft, setModelDraft] = useState(entry?.model ?? spec.defaultModel);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await vault.setEntry(spec.id, {
        // An empty box means "leave the saved key alone", not "erase it" —
        // the input is never prefilled with the real key, so treating blank
        // as a deletion would wipe a working key on any unrelated edit.
        ...(keyDraft ? { apiKey: keyDraft } : {}),
        baseUrl: baseUrlDraft || undefined,
        model: modelDraft || undefined,
      });
      setKeyDraft("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    await vault.removeEntry(spec.id);
    setKeyDraft("");
    onChanged();
  };

  const statusPill = (() => {
    if (isTesting) return { text: "Testing", tone: "neutral" as const };
    if (testResult) {
      return testResult.ok
        ? { text: `${testResult.latencyMs}ms`, tone: "ok" as const }
        : { text: testResult.error?.label ?? "Failed", tone: "bad" as const };
    }
    if (entry?.lastStatus === "valid") return { text: "Working", tone: "ok" as const };
    if (entry?.lastStatus === "invalid") return { text: "Invalid key", tone: "bad" as const };
    if (entry?.lastStatus === "rate_limited") return { text: "Rate limited", tone: "warn" as const };
    if (isConfigured) return { text: "Saved", tone: "neutral" as const };
    return null;
  })();

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        isActive
          ? "border-[color:var(--color-luminous-blue)]/50 bg-[color:var(--color-luminous-blue)]/5"
          : "border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-3 p-3 text-left cursor-pointer hover:bg-[color:var(--color-navy-3)]/50 transition-colors"
      >
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ backgroundColor: `${spec.color}22`, color: spec.color }}
          aria-hidden="true"
        >
          {spec.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#E2E8F0]">{spec.name}</span>
            {isActive && (
              <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)]">
                Active
              </span>
            )}
            {statusPill && <StatusPill {...statusPill} />}
          </div>
          <p className="text-[11px] text-[#94A3B8] truncate mt-0.5">{spec.freeTierNote}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-3 border-t border-[color:var(--color-navy-4)] space-y-3">
          <p className="text-xs text-[#94A3B8] leading-relaxed">{spec.description}</p>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
                API key
              </span>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={isConfigured ? "•••••••• saved — type to replace" : "Paste your key"}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] font-mono placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
              />
            </label>

            {spec.requiresCustomBaseUrl && (
              <label className="block">
                <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
                  API address (required)
                </span>
                <input
                  type="url"
                  value={baseUrlDraft}
                  onChange={(e) => setBaseUrlDraft(e.target.value)}
                  placeholder="https://..."
                  spellCheck={false}
                  className="mt-1 w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] font-mono focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
                />
                <span className="text-[11px] text-[#94A3B8] mt-1 block leading-relaxed">
                  {spec.customBaseUrlHint}
                </span>
              </label>
            )}

            <label className="block">
              <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
                Model
              </span>
              {/* Free text with suggestions rather than a fixed dropdown:
                  providers rename and retire models constantly, so a closed
                  list would eventually block every user from a valid choice. */}
              <input
                type="text"
                list={`models-${spec.id}`}
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                spellCheck={false}
                className="mt-1 w-full bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-sm text-[#E2E8F0] font-mono focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
              />
              <datalist id={`models-${spec.id}`}>
                {(testResult?.models ?? spec.models).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              {testResult?.models?.length ? (
                <span className="text-[11px] text-[#94A3B8] mt-1 block">
                  {testResult.models.length} models available to this key.
                </span>
              ) : null}
            </label>
          </div>

          {testResult && <DiagnosticBlock result={testResult} />}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!keyDraft && !isConfigured)}
              className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={isTesting || !isConfigured}
              className="px-3 py-1.5 border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] text-[#E2E8F0] text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
              Test connection
            </button>
            {onSelect && isConfigured && !isActive && (
              <button
                type="button"
                onClick={() => onSelect(spec.id)}
                className="px-3 py-1.5 border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] text-[#E2E8F0] text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-3 h-3" />
                Use this
              </button>
            )}
            <a
              href={spec.getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] text-[#E2E8F0] text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5"
            >
              <ExternalLink className="w-3 h-3" />
              Get a key
            </a>
            {isConfigured && (
              <button
                type="button"
                onClick={handleRemove}
                className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 ml-auto"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ text, tone }: { text: string; tone: "ok" | "bad" | "warn" | "neutral" }) {
  const cls =
    tone === "ok"
      ? "bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)]"
      : tone === "bad"
        ? "bg-red-500/15 text-red-400"
        : tone === "warn"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-[color:var(--color-navy-3)] text-[#94A3B8]";
  return (
    <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${cls}`}>{text}</span>
  );
}

/** The precise diagnosis, replacing the old "degraded — Unexpected response". */
function DiagnosticBlock({ result }: { result: ConnectionTestResult }) {
  if (result.ok) {
    return (
      <div className="flex items-start gap-2 bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-luminous-blue)]/30 rounded-lg p-2.5">
        <Check className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
        <p className="text-xs text-[#E2E8F0] leading-relaxed">{summariseResult(result)}</p>
      </div>
    );
  }

  const error = result.error;
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-start gap-2">
        <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-wider">
            {error?.label}
          </span>
          <p className="text-xs text-[#E2E8F0] leading-relaxed mt-0.5">{error?.message}</p>
          {error?.remedy && (
            <p className="text-xs text-[#94A3B8] leading-relaxed mt-1 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              {error.remedy}
            </p>
          )}
        </div>
      </div>
      {error?.detail && (
        <details className="ml-5.5">
          <summary className="text-[10px] font-mono text-[#94A3B8] uppercase tracking-wider cursor-pointer hover:text-[#E2E8F0]">
            Technical detail
          </summary>
          <pre className="mt-1 text-[10px] text-[#94A3B8] font-mono whitespace-pre-wrap break-all bg-[color:var(--color-navy-3)]/60 rounded p-2 max-h-32 overflow-y-auto">
            {error.detail}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Order in which providers are tried when one fails.
 *
 * Shown only once more than one key exists, since ordering a list of one is
 * meaningless UI.
 */
function FailoverOrderEditor({ onChanged }: { onChanged: () => void }) {
  const chain = vault.getFailoverChain();

  const move = async (index: number, delta: number) => {
    const next = [...chain];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await vault.setFailoverOrder(next);
    onChanged();
  };

  return (
    <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-3">
      <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
        Automatic switching order
      </span>
      <p className="text-[11px] text-[#94A3B8] mt-1 leading-relaxed">
        If one provider is rate limited or fails, your work continues on the next one down —
        automatically, without losing what has already been written.
      </p>
      <ol className="mt-2 space-y-1">
        {chain.map((id, index) => {
          const spec = CLOUD_PROVIDERS.find((p) => p.id === id);
          return (
            <li
              key={id}
              className="flex items-center gap-2 bg-[color:var(--color-navy-3)]/60 rounded-lg px-2.5 py-1.5"
            >
              <span className="text-[10px] font-mono font-bold text-[#94A3B8] w-4">{index + 1}</span>
              <span className="text-xs text-[#E2E8F0] flex-1 truncate">{spec?.name ?? id}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${spec?.name ?? id} earlier`}
                className="text-[#94A3B8] hover:text-[#E2E8F0] disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === chain.length - 1}
                aria-label={`Move ${spec?.name ?? id} later`}
                className="text-[#94A3B8] hover:text-[#E2E8F0] disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
