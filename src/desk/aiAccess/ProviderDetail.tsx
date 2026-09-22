import { useState } from "react";
import { providerAccessFacts, type CloudProviderSpec } from "../../config/providerCatalog";
import { getDefaultModelId, getModelsForProvider, type ModelSpec } from "../../config/modelCatalog";
import ModelSelectField from "./ModelSelectField";
import type { ConnectionTier, ProviderView } from "./useAiAccess";
import { discoverProviderModels, getCachedDiscoveredModels, type DiscoveredModel } from "../../services/modelDiscovery";
import { runProviderDiagnostics, type DiagnosticReport } from "../../services/aiDiagnostics";
import { readProviderKey } from "../../services/userAiSettings";

/**
 * The configuration surface for ONE cloud provider.
 *
 * This is what replaced the single generic "AI provider" form. That form
 * showed every provider as a radio list and one shared API-key box, so the
 * question it answered was "which provider do you want?" — a question that
 * only makes sense if you can have exactly one. Here the question is "how do
 * I set up THIS provider", asked separately for each, which is what having
 * many connections at once requires.
 *
 * The steps are numbered and stated in full because the audience is assumed
 * to be non-technical (doc 25): where to get a key, what it costs, what the
 * limits are, and what happens to the key once entered. Every one of those
 * facts comes from the catalogue via providerAccessFacts() rather than being
 * written per provider, so none of them can drift from what the router
 * actually does.
 */
export default function ProviderDetail({
  view,
  spec,
  tier: tierProp,
  onConnect,
  onDisconnect,
  onSetModel,
  onMakeDefault,
  onBack,
}: {
  view: ProviderView;
  spec: CloudProviderSpec;
  tier?: ConnectionTier;
  onConnect: (input: { apiKey: string; model: string; baseUrl?: string; makeDefault: boolean; tier?: ConnectionTier }) => Promise<{ ok: boolean; error?: string; modelsDetected?: number }>;
  onDisconnect: () => Promise<void>;
  onSetModel: (model: string) => Promise<void>;
  onMakeDefault: () => Promise<void>;
  onBack: () => void;
}) {
  const facts = providerAccessFacts(spec);
  const [tier, setTier] = useState<ConnectionTier>(() => tierProp ?? view.tier ?? (facts.usableWithoutPaying ? "free" : "byok"));
  const models = getModelsForProvider(spec.id, tier === "free" ? "free" : "byok");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(view.selectedModel ?? getDefaultModelId(spec.id));
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(!view.connected);

  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(() => getCachedDiscoveredModels(spec.id) || []);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryMsg, setDiscoveryMsg] = useState<string | null>(null);

  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);

  const [pingRunning, setPingRunning] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs?: number; message?: string } | null>(null);

  async function handleTestPing() {
    setPingRunning(true);
    setPingResult(null);
    const start = Date.now();
    try {
      const key = apiKey.trim() || (await readProviderKey(spec.id));
      if (!key && spec.freeTier === "paid") {
        setPingResult({
          ok: false,
          latencyMs: 0,
          message: "Please enter an API key to test connection.",
        });
        return;
      }
      const report = await runProviderDiagnostics(spec.id, key || "", model, baseUrl.trim() || undefined);
      const latencyMs = Date.now() - start;
      const isPass = report.overallStatus === "healthy" || report.overallStatus === "degraded";
      if (isPass) {
        setPingResult({
          ok: true,
          latencyMs,
          message: `Responsive in ${latencyMs}ms • Model: ${model || "Default"} • Health: ${report.overallStatus}`,
        });
      } else {
        const failStep = report.steps.find((s) => s.status === "fail");
        setPingResult({
          ok: false,
          latencyMs,
          message: failStep ? `${failStep.name}: ${failStep.details}` : (report.error || "Connection test failed."),
        });
      }
    } catch (e: any) {
      setPingResult({
        ok: false,
        latencyMs: Date.now() - start,
        message: e.message || "Failed to reach provider endpoint.",
      });
    } finally {
      setPingRunning(false);
    }
  }

  // Combine catalog models with dynamically discovered models
  const effectiveModels: ModelSpec[] = [...models];
  for (const dm of discoveredModels) {
    const mId = dm.modelId || dm.id;
    const existingIdx = effectiveModels.findIndex((m) => m.modelId === mId);
    const specEntry: ModelSpec = {
      id: `${spec.id}:${mId}`,
      providerId: spec.id,
      modelId: mId,
      displayName: `${dm.displayName || mId} (Live Discovered)`,
      status: "current",
      accessModes: tier === "free" ? ["free", "byok"] : ["byok"],
      capabilities: dm.capabilities,
      contextWindow: dm.contextWindow ?? null,
      inputModalities: ["text"],
      outputModalities: ["text"],
      relativeQuality: "balanced",
      relativeSpeed: "fast",
      pricing: null,
      lastVerified: new Date().toISOString().split("T")[0],
      verified: true,
      notes: dm.source === "live_discovery" ? "Discovered live from provider account" : "Discovered metadata",
    };
    if (existingIdx >= 0) {
      effectiveModels[existingIdx] = {
        ...effectiveModels[existingIdx],
        ...specEntry,
        displayName: `${effectiveModels[existingIdx].displayName} (Live Discovered)`,
      };
    } else {
      effectiveModels.unshift(specEntry);
    }
  }

  async function handleRefreshModels() {
    setDiscovering(true);
    setDiscoveryMsg(null);
    try {
      const key = apiKey.trim() || (await readProviderKey(spec.id));
      if (!key) {
        setDiscoveryMsg("Please enter an API key to discover models for this account.");
        return;
      }
      const discoResult = await discoverProviderModels(spec.id, key, baseUrl.trim() || undefined, true);
      if (discoResult.ok && discoResult.models.length > 0) {
        setDiscoveredModels(discoResult.models);
        setDiscoveryMsg(`Discovered ${discoResult.models.length} model(s) for your account.`);
      } else {
        setDiscoveryMsg(discoResult.error || "No live models returned from /models. Using catalog fallbacks.");
      }
    } catch (e: any) {
      setDiscoveryMsg(`Discovery notice: ${e.message}`);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleRunDiagnostics() {
    setDiagnosticsRunning(true);
    setDiagnosticReport(null);
    try {
      const key = apiKey.trim() || (await readProviderKey(spec.id));
      const report = await runProviderDiagnostics(spec.id, key || "", model, baseUrl.trim() || undefined);
      setDiagnosticReport(report);
    } catch (e: any) {
      setError(`Diagnostics failed: ${e.message}`);
    } finally {
      setDiagnosticsRunning(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (spec.requiresCustomBaseUrl && !baseUrl.trim()) {
        setError("This provider needs a custom address — see the note under the field.");
        return;
      }
      const outcome = await onConnect({ apiKey: apiKey.trim(), model: model.trim(), baseUrl: baseUrl.trim() || undefined, makeDefault, tier });
      if (!outcome.ok) {
        setError(outcome.error ?? "Could not connect.");
        return;
      }
      setApiKey("");
      setResult(
        outcome.modelsDetected != null
          ? `Connected. ${outcome.modelsDetected} model${outcome.modelsDetected === 1 ? "" : "s"} available.`
          : "Connected."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-[color:var(--accent-solid)] hover:underline"
      >
        ← Back
      </button>

      <header className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none" style={{ color: spec.color }}>
          {spec.icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">{spec.name}</h2>
          <p className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{spec.description}</p>
        </div>
      </header>

      <FactRow facts={facts} tier={tier} connected={view.connected} />

      {facts.usableWithoutPaying && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3.5">
          <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] mb-2">
            Select Connection Tier
          </span>
          <div className="inline-flex rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] p-1">
            <button
              type="button"
              onClick={() => setTier("free")}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                tier === "free"
                  ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              Free Tier
            </button>
            <button
              type="button"
              onClick={() => setTier("byok")}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                tier === "byok"
                  ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              Pro / BYOK Key
            </button>
          </div>
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            {tier === "free"
              ? "Use with your free account. Subject to provider rate limits."
              : "Use your paid key with your own custom quota and higher limits."}
          </p>
        </div>
      )}

      {view.connected ? (
        <section className="rounded-[var(--radius-md)] border border-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] p-4">
          <p className="text-sm font-medium text-[color:var(--state-success)]">
            Connected{view.selectedModel ? ` · using ${view.selectedModel}` : ""}
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
            {view.hasKeyOnDevice
              ? "Your key is stored encrypted on this device only. You will enter it again on another computer."
              : "No key is stored on this device — enter it again below to use this provider here."}
          </p>
        </section>
      ) : null}

      <ol className="space-y-4">
        <Step n={1} title={`Get a key from ${spec.name}`}>
          <p className="text-sm text-[color:var(--text-secondary)]">{facts.costNote}</p>
          {facts.usageLimits && <p className="mt-1 text-xs text-[color:var(--text-muted)]">Limits: {facts.usageLimits}</p>}
          <a
            href={spec.getKeyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-sm font-medium text-[color:var(--accent-solid)] hover:underline"
          >
            Open {spec.name}'s API key page →
          </a>
        </Step>

        <Step n={2} title="Paste your key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={view.hasKeyOnDevice ? "A key is already saved — paste a new one to replace it" : "Paste your key"}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
          />
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Stored encrypted on this device only — never saved on our servers. It passes through our server once to verify
            it, and again each time you generate, but is never kept there.
          </p>
          {spec.requiresCustomBaseUrl && (
            <div className="mt-3">
              <label className="text-xs font-medium text-[color:var(--text-primary)]" htmlFor={`baseurl-${spec.id}`}>
                Address for your account
              </label>
              <input
                id={`baseurl-${spec.id}`}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
              />
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">{spec.customBaseUrlHint}</p>
            </div>
          )}
        </Step>

        <Step n={3} title="Choose a model">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[color:var(--text-muted)]">
              {effectiveModels.length} models available ({discoveredModels.length} live discovered)
            </span>
            <button
              type="button"
              onClick={() => void handleRefreshModels()}
              disabled={discovering}
              className="text-xs font-semibold text-[color:var(--accent-solid)] hover:underline disabled:opacity-50 cursor-pointer"
            >
              {discovering ? "Scanning /models…" : "↻ Discover Models"}
            </button>
          </div>
          {discoveryMsg && (
            <p className="mb-2 text-xs text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)] p-2 rounded border border-[color:var(--border-subtle)]">
              {discoveryMsg}
            </p>
          )}
          <ModelSelectField id={`model-${spec.id}`} models={effectiveModels} value={model} onChange={setModel} />
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {effectiveModels.length > 0
              ? "Live discovered and verified models are prioritized. Advanced allows specifying any model ID."
              : "No catalogued models for this provider yet — type any model id this provider accepts."}
          </p>
          {view.connected && (
            <button
              type="button"
              onClick={() => void onSetModel(model.trim())}
              className="mt-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
            >
              Save model
            </button>
          )}
        </Step>

        <Step n={4} title="Test the connection and save">
          <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
            Make this my default provider
          </label>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={busy || !apiKey.trim()}
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] disabled:opacity-60 cursor-pointer"
            >
              {busy ? "Testing…" : view.connected ? "Test and update" : "Test and connect"}
            </button>
            <button
              type="button"
              onClick={() => void handleTestPing()}
              disabled={pingRunning || (!view.connected && !apiKey.trim())}
              className="rounded-[var(--radius-md)] border border-emerald-600/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-3 py-2 text-sm font-medium disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
            >
              <span>{pingRunning ? "Pinging…" : "⚡ Quick Ping Test"}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleRunDiagnostics()}
              disabled={diagnosticsRunning || (!view.connected && !apiKey.trim())}
              className="rounded-[var(--radius-md)] border border-[color:var(--border-control)] px-3 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 cursor-pointer"
            >
              {diagnosticsRunning ? "Running Diagnostics…" : "Run Full Diagnostics"}
            </button>
          </div>
          {pingResult && (
            <div className={`mt-3 rounded-[var(--radius-sm)] border p-2.5 text-xs font-mono flex items-center justify-between gap-2 ${
              pingResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}>
              <div className="flex items-center gap-2">
                <span>{pingResult.ok ? "⚡" : "❌"}</span>
                <span>{pingResult.message}</span>
              </div>
              {pingResult.latencyMs !== undefined && pingResult.latencyMs > 0 && (
                <span className="shrink-0 px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[11px]">
                  {pingResult.latencyMs}ms
                </span>
              )}
            </div>
          )}
          <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">
            We send one request to {spec.name} to check the key works before saving it. Nothing is saved if it fails.
          </p>
        </Step>
      </ol>

      {/* Diagnostics Report */}
      {diagnosticReport && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                diagnosticReport.overallStatus === "healthy"
                  ? "bg-emerald-500"
                  : diagnosticReport.overallStatus === "degraded"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`} />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-primary)]">
                AI Diagnostics — {diagnosticReport.overallStatus.toUpperCase()}
              </h4>
            </div>
            <span className="text-[10px] text-[color:var(--text-muted)] font-mono">{diagnosticReport.timestamp}</span>
          </div>
          <div className="space-y-1.5">
            {diagnosticReport.steps.map((step, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-[color:var(--border-subtle)] last:border-0">
                <div className="flex items-center gap-2">
                  <span>
                    {step.status === "pass" ? "✅" : step.status === "warn" ? "⚠️" : step.status === "fail" ? "❌" : "⏭️"}
                  </span>
                  <span className="font-medium text-[color:var(--text-primary)]">{step.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-[color:var(--text-secondary)]">{step.details}</span>
                  {step.durationMs ? <span className="ml-2 text-[10px] font-mono text-[color:var(--text-muted)]">({step.durationMs}ms)</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
          {error}
        </p>
      )}
      {result && (
        <p className="rounded-[var(--radius-md)] border border-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] px-3 py-2 text-sm text-[color:var(--state-success)]">
          {result}
        </p>
      )}

      {view.connected && (
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--border-subtle)] pt-4">
          {!view.isDefault && (
            <button
              type="button"
              onClick={() => void onMakeDefault()}
              className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
            >
              Make default
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRunDiagnostics()}
            disabled={diagnosticsRunning}
            className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
          >
            {diagnosticsRunning ? "Diagnosing…" : "Run Diagnostics"}
          </button>
          <button
            type="button"
            onClick={() => void onDisconnect()}
            className="rounded-[var(--radius-sm)] border border-[color:var(--state-danger)] px-3 py-1.5 text-xs font-medium text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)]"
          >
            Disconnect and forget key
          </button>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
      <div className="flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-subtle)] text-xs font-semibold text-[color:var(--text-primary)]">
          {n}
        </span>
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</h3>
      </div>
      <div className="mt-2 pl-7">{children}</div>
    </li>
  );
}

/** The five facts the request asked to be stated explicitly for every provider. */
function FactRow({ facts, tier, connected }: { facts: ReturnType<typeof providerAccessFacts>; tier: ConnectionTier; connected: boolean }) {
  const chips: Array<{ label: string; tone: "good" | "warn" | "neutral" }> = [
    { label: facts.costLabel, tone: facts.usableWithoutPaying ? "good" : facts.costLabel === "Paid" ? "warn" : "neutral" },
    { label: tier === "free" ? "Free tier use" : "Bring your own key", tone: "neutral" },
    { label: facts.requiresApiKey ? "API key required" : "No API key needed", tone: "neutral" },
    { label: facts.requiresRegistration ? "Account required" : "No account needed", tone: "neutral" },
    { label: facts.usageLimits ? "Has usage limits" : "No published limit", tone: facts.usageLimits ? "warn" : "neutral" },
    { label: connected ? "Connected" : "Not connected", tone: connected ? "good" : "neutral" },
  ];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li key={c.label}>
          <Chip tone={c.tone}>{c.label}</Chip>
        </li>
      ))}
    </ul>
  );
}

export function Chip({ tone, children }: { tone: "good" | "warn" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "border-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"
      : tone === "warn"
        ? "border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
