import { useState } from "react";
import { resolveRunnerEndpoint, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import { checkLocalRuntimeConnectivity } from "../../services/localRuntimeConnectivity";
import { Chip } from "./ProviderDetail";
import type { ProviderView } from "./useAiAccess";

/**
 * The configuration surface for ONE local runner.
 *
 * Deliberately a different flow from ProviderDetail, because the failure
 * modes are different: a local runner needs no key and no account, so the
 * only questions are "is it installed", "is it running", and "will it accept
 * a request from a web page". That last one is the reason most local setups
 * fail, and it is not obvious — the runner is running, the port is right, and
 * the browser still discards the response because the runner sent no
 * Access-Control-Allow-Origin header. localRunnerCatalog carries the exact,
 * runner-specific fix in `corsGuidance`, and this surfaces it the moment a
 * probe fails rather than leaving the user to guess.
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
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState(view.selectedModel ?? "");
  // Only meaningful while models.length === 0 (no live probe results yet) —
  // once models are detected the <select> is always primary, matching
  // ProviderDetail.tsx's ModelSelectField's "dropdown first, free text is an
  // opt-in advanced action" rule. Starts open when there's already a saved
  // choice, since that value didn't come from a probe.
  const [useCustomModelId, setUseCustomModelId] = useState(Boolean(view.selectedModel));
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [verificationNotes, setVerificationNotes] = useState<string[]>([]);
  const [makeDefault, setMakeDefault] = useState(!view.connected);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function handleProbe() {
    setProbing(true);
    setProbeError(null);
    setSaved(null);
    setVerificationNotes([]);
    try {
      const result = await checkLocalRuntimeConnectivity(runner, resolveRunnerEndpoint(runner, endpoint));
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

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-medium text-[color:var(--accent-solid)] hover:underline">
        ← Back
      </button>

      <header className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {runner.icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">{runner.name}</h2>
          <p className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{runner.description}</p>
        </div>
      </header>

      <ul className="flex flex-wrap gap-1.5">
        <li><Chip tone="good">Completely free</Chip></li>
        <li><Chip tone="good">Runs on your computer</Chip></li>
        <li><Chip tone="neutral">No API key needed</Chip></li>
        <li><Chip tone="neutral">No account needed</Chip></li>
        <li><Chip tone="neutral">Setup: {runner.difficulty}</Chip></li>
        <li><Chip tone={view.connected ? "good" : "neutral"}>{view.connected ? "Connected" : "Not connected"}</Chip></li>
      </ul>

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
          {/* Surfaced up front, not only after a failure: this is the step
              users skip, and skipping it produces a confusing "can't connect"
              on an otherwise perfectly working runner. */}
          <div className="space-y-2">
            <p className="text-sm text-[color:var(--text-secondary)]">{runner.corsGuidance}</p>
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
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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
