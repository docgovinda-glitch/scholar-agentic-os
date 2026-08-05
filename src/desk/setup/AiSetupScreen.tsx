import { useEffect, useMemo, useState } from "react";
import { CLOUD_PROVIDERS, type CloudProviderSpec } from "../../config/providerCatalog";
import { LOCAL_RUNNERS, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import { detectRunners } from "../../services/localRunnerProbe";
import {
  DEFAULT_AI_SETTINGS,
  forgetProviderKey,
  loadUserAiSettings,
  providersWithStoredKey,
  saveUserAiSettings,
  storeProviderKey,
  type UserAiSettings,
} from "../../services/userAiSettings";

/**
 * Desk's AI setup.
 *
 * Doc 25 requires this stage to explain supported providers, what an API key
 * is, and what happens to it — for a user assumed to have no technical
 * background. The provider catalog (src/config/providerCatalog.ts) already
 * carries the honest per-provider detail that makes that possible: what the
 * free tier actually is, and a real link to that provider's own key page. This
 * screen presents that rather than inventing its own copy.
 *
 * Local runners are offered as PEERS to cloud providers, not behind a
 * disclosure (docs 63 §4). P3/P4 are about where a user's prose goes, and
 * prose sent to a model on localhost never leaves the machine — making the
 * privacy-preserving choice the harder one to find would invert the point.
 *
 * Deliberately narrower than the legacy AISetupWizard (987 lines), which also
 * covers hardware capability checks and a vault passphrase. Those are real
 * features and are not being deleted — the legacy client keeps them until it
 * retires. What is here is the path a new user needs to reach a working
 * editor: pick a provider or a local runner, supply what it needs, continue.
 *
 * Doubles as the settings screen a user reaches after setup (`variant:
 * "revisit"`) rather than being a one-time-only stage with no way back in —
 * Header's "Settings" control used to be a labelled dead stub because
 * nothing existed to open. Every piece this needs (loadUserAiSettings,
 * saveUserAiSettings, storeProviderKey, forgetProviderKey) already existed
 * and was already exercised by this same screen's first run; revisiting is a
 * copy change, not new plumbing.
 */
export default function AiSetupScreen({
  onDone,
  onSkip,
  onCancel,
  variant = "onboarding",
}: {
  onDone: () => void;
  /** Onboarding only: "leave AI features inert for now" (docs 25). */
  onSkip?: () => void;
  /** Revisit only: "I didn't mean to open this." Nothing here saves until Save is pressed, so this is a plain close. */
  onCancel?: () => void;
  variant?: "onboarding" | "revisit";
}) {
  const [settings, setSettings] = useState<UserAiSettings>(DEFAULT_AI_SETTINGS);
  const [selected, setSelected] = useState<string>(DEFAULT_AI_SETTINGS.provider);
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Local runners that answered a probe on this machine. */
  const [detected, setDetected] = useState<Array<{ runner: LocalRunnerSpec; models: string[] }>>([]);
  const [probing, setProbing] = useState(true);

  useEffect(() => {
    let active = true;
    loadUserAiSettings()
      .then((s) => {
        if (!active) return;
        setSettings(s);
        setSelected(s.provider);
      })
      .finally(() => active && setLoading(false));
    setConfigured(providersWithStoredKey());

    // Local runners are offered as PEERS to cloud providers (docs 63): a user
    // who wants nothing sent to a third party should not have to go looking.
    // Probing on mount means we can say "Ollama is running" rather than making
    // them find out by trying.
    detectRunners()
      .then((found) => active && setDetected(found))
      .catch(() => {})
      .finally(() => active && setProbing(false));

    return () => {
      active = false;
    };
  }, []);

  const spec = useMemo(() => CLOUD_PROVIDERS.find((p) => p.id === selected), [selected]);
  const localSpec = useMemo(() => LOCAL_RUNNERS.find((r) => r.id === selected), [selected]);
  const hasKeyOnDevice = configured.includes(selected);
  // A local runner authenticates with nothing — reachability is the whole
  // requirement, so the key field does not apply to it.
  const isLocal = localSpec !== undefined;

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      if (apiKey.trim()) {
        await storeProviderKey(selected, apiKey.trim());
        setConfigured(providersWithStoredKey());
        setApiKey("");
      }
      const next: UserAiSettings = {
        provider: selected,
        preferences: {
          ...settings.preferences,
          ...(spec && !isLocal
            ? { [`${selected}Model`]: settings.preferences[`${selected}Model`] ?? spec.defaultModel }
            : {}),
          // A local runner is addressed by endpoint, not by key. Recorded so
          // the gateway knows where to reach it.
          ...(localSpec ? { [`${selected}Endpoint`]: localSpec.defaultEndpoint } : {}),
        },
      };
      const result = await saveUserAiSettings(next);
      if (!result.success) {
        setError(result.error ?? "Could not save your choice.");
        return;
      }
      setSettings(next);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleForget() {
    forgetProviderKey(selected);
    setConfigured(providersWithStoredKey());
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-[color:var(--text-muted)]">Loading your settings…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-7">
        {variant === "revisit" && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mb-4 text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
          >
            ← Back
          </button>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          {variant === "revisit" ? "AI provider" : "Connect an AI provider"}
        </h1>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          {variant === "revisit"
            ? "Change the model Scholar uses, or update the key stored on this device."
            : "Scholar uses a model you choose, with your own account. Several have free tiers that need no card."}
        </p>
      </header>

      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-medium text-[color:var(--text-primary)]">Provider</legend>
        <ul className="flex flex-col gap-2">
          {CLOUD_PROVIDERS.slice(0, 6).map((p) => (
            <li key={p.id}>
              <ProviderOption
                spec={p}
                selected={selected === p.id}
                hasKey={configured.includes(p.id)}
                onSelect={() => setSelected(p.id)}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-medium text-[color:var(--text-primary)]">
          Or run a model on your own machine
        </legend>
        <p className="mb-2 text-xs text-[color:var(--text-muted)]">
          Nothing you write leaves your computer. You install the runner yourself; Scholar just talks to it.
        </p>
        {probing ? (
          <p className="text-sm text-[color:var(--text-muted)]">Looking for a runner on this machine…</p>
        ) : detected.length === 0 ? (
          <p className="text-sm text-[color:var(--text-muted)]">
            None detected. {LOCAL_RUNNERS[0].name} is the easiest to start with —{" "}
            <a
              href={LOCAL_RUNNERS[0].installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]"
            >
              install it
            </a>
            , then reload this page. If it is already running, it may need permission to accept requests from this
            site.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detected.map(({ runner, models }) => (
              <li key={runner.id}>
                <LocalOption
                  spec={runner}
                  models={models}
                  selected={selected === runner.id}
                  onSelect={() => setSelected(runner.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {isLocal && localSpec && (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
          <p className="text-sm font-medium text-[color:var(--text-primary)]">{localSpec.name}</p>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Running at <code className="font-mono text-xs">{localSpec.defaultEndpoint}</code>. No API key is needed —
            and nothing you write is sent anywhere.
          </p>
        </div>
      )}

      {spec && !isLocal && (
        <div className="mb-6 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
          <div>
            <p className="text-sm font-medium text-[color:var(--text-primary)]">{spec.name}</p>
            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{spec.freeTierNote}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="provider-key" className="text-sm font-medium text-[color:var(--text-primary)]">
              API key
            </label>
            <input
              id="provider-key"
              type="password"
              value={apiKey}
              autoComplete="off"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKeyOnDevice ? "A key is saved on this device — type to replace it" : "Paste your key"}
              aria-describedby="provider-key-hint"
              className="w-full px-3 py-2 text-sm"
            />
            {/* The storage model is stated plainly rather than buried in a
                privacy page: it is the reason the key will not be there on
                their next device, and finding that out by surprise is worse
                than reading one sentence now. */}
            <p id="provider-key-hint" className="text-xs text-[color:var(--text-muted)]">
              Stored encrypted on this device only — never sent to our servers. You will enter it again on another
              computer.{" "}
              <a
                href={spec.getKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]"
              >
                Get a key from {spec.name} →
              </a>
            </p>
          </div>

          {hasKeyOnDevice && (
            <button
              type="button"
              onClick={handleForget}
              className="self-start text-sm text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] cursor-pointer"
            >
              Remove the saved key for {spec.name}
            </button>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || (!isLocal && !apiKey.trim() && !hasKeyOnDevice)}
          className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Saving…" : variant === "revisit" ? "Save changes" : "Save and continue"}
        </button>
        {/* Doc 25: every stage after login is skippable. Skipping leaves the
            editor usable and the AI features inert, which is a real choice,
            not a broken state. Revisit has no skip — there is nothing to
            skip past, only a change to make or not. */}
        {onSkip && variant === "onboarding" && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Skip for now
          </button>
        )}
        {variant === "revisit" && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
    </Shell>
  );
}

function ProviderOption({
  spec,
  selected,
  hasKey,
  onSelect,
}: {
  spec: CloudProviderSpec;
  selected: boolean;
  hasKey: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 transition-colors duration-[var(--motion-fast)]",
        selected
          ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
          : "border-[color:var(--border-default)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-strong)]",
      ].join(" ")}
    >
      {/* A real radio in a real label: keyboard and screen-reader behaviour
          come free, and the whole row is a hit target. */}
      <input
        type="radio"
        name="ai-provider"
        value={spec.id}
        checked={selected}
        onChange={onSelect}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[color:var(--text-primary)]">{spec.name}</span>
          {hasKey && (
            <span className="rounded-full bg-[color:var(--state-success-subtle)] px-2 py-0.5 text-xs text-[color:var(--state-success)]">
              Key saved
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">{spec.description}</span>
      </span>
    </label>
  );
}

function LocalOption({
  spec,
  models,
  selected,
  onSelect,
}: {
  spec: LocalRunnerSpec;
  models: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 transition-colors duration-[var(--motion-fast)]",
        selected
          ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
          : "border-[color:var(--border-default)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-strong)]",
      ].join(" ")}
    >
      <input type="radio" name="ai-provider" value={spec.id} checked={selected} onChange={onSelect} className="mt-0.5" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[color:var(--text-primary)]">{spec.name}</span>
          <span className="rounded-full bg-[color:var(--state-success-subtle)] px-2 py-0.5 text-xs text-[color:var(--state-success)]">
            Running on this machine
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">
          {models.length > 0 ? `${models.length} model${models.length === 1 ? "" : "s"} loaded` : spec.description}
        </span>
      </span>
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] px-4 py-10">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}
