import { useState } from "react";
import { providerAccessFacts, type CloudProviderSpec } from "../../config/providerCatalog";
import { getDefaultModelId, getModelsForProvider } from "../../config/modelCatalog";
import ModelSelectField from "./ModelSelectField";
import type { ConnectionTier, ProviderView } from "./useAiAccess";

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
  tier,
  onConnect,
  onDisconnect,
  onSetModel,
  onMakeDefault,
  onBack,
}: {
  view: ProviderView;
  spec: CloudProviderSpec;
  tier: ConnectionTier;
  onConnect: (input: { apiKey: string; model: string; baseUrl?: string; makeDefault: boolean }) => Promise<{ ok: boolean; error?: string; modelsDetected?: number }>;
  onDisconnect: () => Promise<void>;
  onSetModel: (model: string) => Promise<void>;
  onMakeDefault: () => Promise<void>;
  onBack: () => void;
}) {
  const facts = providerAccessFacts(spec);
  const models = getModelsForProvider(spec.id, tier === "free" ? "free" : "byok");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(view.selectedModel ?? getDefaultModelId(spec.id));
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(!view.connected);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (spec.requiresCustomBaseUrl && !baseUrl.trim()) {
        setError("This provider needs a custom address — see the note under the field.");
        return;
      }
      const outcome = await onConnect({ apiKey: apiKey.trim(), model: model.trim(), baseUrl: baseUrl.trim() || undefined, makeDefault });
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
          <ModelSelectField id={`model-${spec.id}`} models={models} value={model} onChange={setModel} />
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {models.length > 0
              ? "Deprecated or unverified entries are labeled — pick Advanced to type any model id this provider accepts."
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
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={busy || !apiKey.trim()}
            className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] disabled:opacity-60"
          >
            {busy ? "Testing…" : view.connected ? "Test and update" : "Test and connect"}
          </button>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            We send one request to {spec.name} to check the key works before saving it. Nothing is saved if it fails.
          </p>
        </Step>
      </ol>

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
