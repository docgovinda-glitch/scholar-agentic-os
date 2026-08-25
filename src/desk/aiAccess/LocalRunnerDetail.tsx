import { useState, useMemo } from "react";
import { resolveRunnerEndpoint, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import {
  diagnoseOllamaConnection,
  generateDiagnosticReport,
  type OllamaDiagnosisResult,
  type OllamaModelInfo,
} from "../../services/ollamaService";
import { checkLocalRuntimeConnectivity } from "../../services/localRuntimeConnectivity";
import { Chip } from "./ProviderDetail";
import type { ProviderView } from "./useAiAccess";

/**
 * The configuration and diagnostics surface for ONE local runner (Ollama, LM Studio, etc.).
 *
 * Provides automated discovery, intelligent model categorization, live diagnostic checklists,
 * and OS-tailored setup commands.
 */
export default function LocalRunnerDetail({
  view,
  runner,
  savedEndpoint,
  onConnect,
  onDisconnect,
  onSetModel,
  onMakeDefault,
  onBack,
}: {
  view: ProviderView;
  runner: LocalRunnerSpec;
  savedEndpoint: string | null;
  onConnect: (endpoint: string, model: string, modelsDetected: number, makeDefault: boolean) => Promise<{ ok: boolean; error?: string }>;
  onDisconnect: () => Promise<void>;
  onSetModel: (model: string) => Promise<void>;
  onMakeDefault: () => Promise<void>;
  onBack: () => void;
}) {
  const [endpoint, setEndpoint] = useState(savedEndpoint ?? runner.defaultEndpoint);
  const [modelInfos, setModelInfos] = useState<OllamaModelInfo[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState(view.selectedModel ?? "");
  const [useCustomModelId, setUseCustomModelId] = useState(Boolean(view.selectedModel));
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [verificationNotes, setVerificationNotes] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState<OllamaDiagnosisResult | null>(null);
  const [makeDefault, setMakeDefault] = useState(!view.connected);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "local" | "coding">("all");
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);

  // Filter models based on selection
  const filteredModels = useMemo(() => {
    if (modelInfos.length === 0) return models.map((m) => ({ name: m, model: m, isLocal: true, category: "general", formattedSize: "" }));
    if (selectedFilter === "local") return modelInfos.filter((m) => m.isLocal);
    if (selectedFilter === "coding") return modelInfos.filter((m) => m.category === "coding");
    return modelInfos;
  }, [modelInfos, models, selectedFilter]);

  async function handleProbe(targetEndpoint = endpoint) {
    setProbing(true);
    setProbeError(null);
    setSaved(null);
    setVerificationNotes([]);

    const resolved = resolveRunnerEndpoint(runner, targetEndpoint);

    try {
      if (runner.id === "ollama") {
        const diag = await diagnoseOllamaConnection(resolved);
        setDiagnosis(diag);

        if (diag.ok) {
          setReachable(true);
          setModelInfos(diag.models);
          const modelNames = diag.models.map((m) => m.name);
          setModels(modelNames);
          setEndpoint(diag.activeEndpoint);

          if (!model && diag.recommendedModel) {
            setModel(diag.recommendedModel);
          } else if (!model && modelNames.length > 0) {
            setModel(modelNames[0]);
          }

          if (diag.models.length === 0) {
            setProbeError(`${runner.name} answered, but has no models loaded yet. Download or load a model in ${runner.name}, then detect again.`);
          }
        } else {
          setReachable(false);
          setModelInfos([]);
          setModels([]);
          setProbeError(diag.guidance);
        }
      } else {
        const result = await checkLocalRuntimeConnectivity(runner, resolved);
        if (result.diagnosis === "reachable") {
          setReachable(true);
          setModels(result.models);
          if (!model && result.models.length > 0) setModel(result.models[0]);
          if (result.models.length === 0) {
            setProbeError(`${runner.name} answered, but has no models loaded yet. Download or load a model in ${runner.name}, then detect again.`);
          }
        } else {
          setReachable(false);
          setModels([]);
          setProbeError(result.guidance);
          setVerificationNotes(result.requiresRealMachineVerification);
        }
      }
    } catch (e) {
      setReachable(false);
      setProbeError((e as Error).message);
    } finally {
      setProbing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(null);
    try {
      const outcome = await onConnect(resolveRunnerEndpoint(runner, endpoint), model.trim(), models.length, makeDefault);
      if (!outcome.ok) {
        setProbeError(outcome.error ?? "Could not save this runner.");
        return;
      }
      setSaved("Saved. Scholar can now use this runner.");
    } finally {
      setSaving(false);
    }
  }

  function handleCopyCommand(cmd: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(cmd);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    }
  }

  function handleCopyDiagnostics() {
    if (!diagnosis) return;
    const report = generateDiagnosticReport(diagnosis);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(report);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-medium text-[color:var(--accent-solid)] hover:underline">
        ← Back
      </button>

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-2xl leading-none">
            {runner.icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)] flex items-center gap-2">
              <span>{runner.name}</span>
              {reachable === true && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Online
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{runner.description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleProbe()}
          disabled={probing}
          className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 flex items-center gap-1.5"
        >
          <span className={probing ? "animate-spin" : ""}>🔄</span>
          <span>{probing ? "Checking…" : "Test connection"}</span>
        </button>
      </header>

      <ul className="flex flex-wrap gap-1.5">
        <li><Chip tone="good">Completely free</Chip></li>
        <li><Chip tone="good">Runs on your computer</Chip></li>
        <li><Chip tone="neutral">No API key needed</Chip></li>
        <li><Chip tone="neutral">No account needed</Chip></li>
        <li><Chip tone="neutral">Setup: {runner.difficulty}</Chip></li>
        <li><Chip tone={view.connected ? "good" : "neutral"}>{view.connected ? "Connected" : "Not connected"}</Chip></li>
      </ul>

      {/* Live Diagnostic Status Matrix */}
      {diagnosis && (
        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Connection Diagnostics
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {diagnosis.checks.map((chk) => (
              <div
                key={chk.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]"
              >
                <span className="text-sm">
                  {chk.status === "pass" ? "🟢" : chk.status === "warning" ? "🟡" : "🔴"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[color:var(--text-primary)] truncate">{chk.label}</p>
                  <p className="text-[11px] text-[color:var(--text-muted)] truncate">{chk.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ol className="space-y-4">
        <Step n={1} title={`Install and start ${runner.name}`}>
          <p className="text-sm text-[color:var(--text-secondary)]">{runner.installGuidance}</p>
          <a
            href={runner.installUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-sm font-medium text-[color:var(--accent-solid)] hover:underline"
          >
            Open the {runner.name} install page →
          </a>
        </Step>

        <Step n={2} title="Allow this page to reach it">
          <div className="space-y-2">
            <p className="text-sm text-[color:var(--text-secondary)]">{runner.corsGuidance}</p>

            {diagnosis?.requiredOriginCommand && (
              <div className="rounded-lg bg-neutral-900 text-neutral-100 p-3 text-xs font-mono relative group">
                <div className="flex items-center justify-between mb-1 text-[10px] text-neutral-400">
                  <span className="uppercase font-bold">{diagnosis.os} Command</span>
                  <button
                    type="button"
                    onClick={() => handleCopyCommand(diagnosis.requiredOriginCommand)}
                    className="text-emerald-400 hover:text-emerald-300 font-sans font-bold flex items-center gap-1"
                  >
                    {copiedCmd ? "✓ Copied!" : "📋 Copy Command"}
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre pr-12 text-emerald-400">
                  {diagnosis.requiredOriginCommand}
                </div>
              </div>
            )}

            <div className="mt-2 rounded-lg bg-[color:var(--surface-sunken)] p-3 border border-[color:var(--border-subtle)]">
              <p className="text-xs text-[color:var(--text-muted)]">
                <strong className="text-[color:var(--text-primary)]">Why is this required?</strong> Modern browsers block public websites from secretly scanning your local network (Private Network Access). You must explicitly configure {runner.name} to allow Scholar Core to connect. This cannot be automated for your security.
              </p>
            </div>
          </div>
        </Step>

        <Step n={3} title="Check the address">
          <input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            spellCheck={false}
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
          />
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Default for {runner.name} is {runner.defaultEndpoint}. Change it only if you started it on a different port.
          </p>
        </Step>

        <Step n={4} title="Detect models">
          <button
            type="button"
            onClick={() => void handleProbe()}
            disabled={probing}
            className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
          >
            {probing ? "Checking…" : "Test connection"}
          </button>
          {reachable === true && (
            <p className="mt-2 text-sm text-[color:var(--state-success)]">
              Reachable — {models.length} model{models.length === 1 ? "" : "s"} found.
            </p>
          )}
          {probeError && (
            <div role="alert" className="mt-2 rounded-[var(--radius-sm)] border border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] p-3">
              <p className="text-sm text-[color:var(--state-warning)]">{probeError}</p>
              {verificationNotes.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-[color:var(--text-secondary)]">
                    What we can't confirm from here
                  </summary>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-[color:var(--text-muted)]">
                    {verificationNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Step>

        <Step n={5} title="Choose a model and save">
          {models.length > 0 ? (
            <div className="space-y-3">
              {modelInfos.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedFilter("all")}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedFilter === "all"
                        ? "bg-[color:var(--accent-solid)] text-white"
                        : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                    }`}
                  >
                    All ({models.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter("coding")}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedFilter === "coding"
                        ? "bg-[color:var(--accent-solid)] text-white"
                        : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                    }`}
                  >
                    Coding & Research
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter("local")}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedFilter === "local"
                        ? "bg-[color:var(--accent-solid)] text-white"
                        : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                    }`}
                  >
                    Local Downloaded
                  </button>
                </div>
              )}

              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
              >
                {filteredModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.formattedSize ? `(${m.formattedSize})` : ""} {m.isLocal ? "— 💻 Local" : "— ☁️ Cloud"}
                  </option>
                ))}
              </select>

              {diagnosis?.recommendedModel && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <span className="text-emerald-700 dark:text-emerald-300">
                    💡 <strong>Recommended:</strong> {diagnosis.recommendedModel}
                  </span>
                  {model !== diagnosis.recommendedModel && (
                    <button
                      type="button"
                      onClick={() => setModel(diagnosis.recommendedModel!)}
                      className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                    >
                      Use this model
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {useCustomModelId ? (
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Exact model name this runner has loaded"
                  className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
                />
              ) : (
                <p className="text-sm italic text-[color:var(--text-muted)]">
                  Detect models first, or check Advanced below to type one.
                </p>
              )}
              <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                <input type="checkbox" checked={useCustomModelId} onChange={(e) => setUseCustomModelId(e.target.checked)} />
                Advanced: use a custom model ID
              </label>
            </>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
            Make this my default provider
          </label>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || reachable !== true}
            className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save connection"}
          </button>
          {reachable !== true && (
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              Test the connection first — saving a runner Scholar cannot reach would just make it fail later.
            </p>
          )}
          {view.connected && model && (
            <button
              type="button"
              onClick={() => void onSetModel(model.trim())}
              className="mt-2 ml-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
            >
              Save model only
            </button>
          )}
        </Step>
      </ol>

      {saved && (
        <p className="rounded-[var(--radius-md)] border border-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] px-3 py-2 text-sm text-[color:var(--state-success)]">
          {saved}
        </p>
      )}

      {/* Developer Diagnostics Panel */}
      <div className="border-t border-[color:var(--border-subtle)] pt-4">
        <button
          type="button"
          onClick={() => setShowDiagnosticsPanel(!showDiagnosticsPanel)}
          className="text-xs font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1.5"
        >
          <span>{showDiagnosticsPanel ? "▼" : "▶"}</span>
          <span>Developer Diagnostics & Support Report</span>
        </button>

        {showDiagnosticsPanel && (
          <div className="mt-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[color:var(--text-primary)]">Ollama Connection Summary</span>
              <button
                type="button"
                onClick={handleCopyDiagnostics}
                className="text-xs font-bold text-[color:var(--accent-solid)] hover:underline flex items-center gap-1"
              >
                {copiedReport ? "✓ Copied Report!" : "📋 Copy Diagnostics Report"}
              </button>
            </div>
            <div className="text-xs font-mono space-y-1 text-[color:var(--text-secondary)] bg-[color:var(--surface-inset)] p-3 rounded-lg border border-[color:var(--border-subtle)] overflow-x-auto">
              <div><strong>Scholar Origin:</strong> {diagnosis?.currentOrigin || "https://scholar.gkshah.com.np"}</div>
              <div><strong>Active Endpoint:</strong> {endpoint}</div>
              <div><strong>Environment:</strong> {diagnosis?.os || "macos"} · {diagnosis?.browser || "chrome"} {diagnosis?.browserVersion || ""}</div>
              <div><strong>Ollama Version:</strong> {diagnosis?.version || "Unknown"}</div>
              <div><strong>Response Latency:</strong> {diagnosis?.latencyMs ? `${diagnosis.latencyMs}ms` : "N/A"}</div>
              <div><strong>Status:</strong> {diagnosis?.errorKind || (reachable ? "SUCCESS" : "UNREACHABLE")}</div>
              <div><strong>Models Detected:</strong> {models.length}</div>
            </div>
          </div>
        )}
      </div>

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
            onClick={() => void onDisconnect()}
            className="rounded-[var(--radius-sm)] border border-[color:var(--state-danger)] px-3 py-1.5 text-xs font-medium text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)]"
          >
            Disconnect
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
