import { useMemo, useState, useEffect } from "react";
import { getCloudProvider, providerAccessFacts, CLOUD_PROVIDERS, type CloudProviderSpec } from "../../config/providerCatalog";
import { getLocalRunner, LOCAL_RUNNERS, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import {
  detectHardwareProfile,
  loadHardwareProfile,
  recommendLocalModel,
  saveHardwareProfile,
  type HardwareProfile,
} from "../../services/hardwareProfiler";
import ProviderDetail, { Chip } from "./ProviderDetail";
import LocalRunnerDetail from "./LocalRunnerDetail";
import ManualHardwareForm from "./ManualHardwareForm";
import { useAiAccess, type ProviderView } from "./useAiAccess";
import OnboardingProgress from "../setup/OnboardingProgress";
import {
  getPremiumCatalog,
  getOfferedPlans,
  getMyPremiumRequest,
  requestPremium,
  withdrawPremiumRequest,
  type PremiumCatalog,
  type OfferedPlan,
  type MyPremiumRequest,
} from "./aiAccessApi";
import {
  getLiveSearchGroundingEnabled,
  setLiveSearchGroundingEnabled,
  onLiveSearchGroundingChange,
} from "../../services/liveSearchService";
import CredentialResetNotice from "../security/CredentialResetNotice";

/**
 * AI Access — the single source of truth for a user's AI provider and model configuration.
 *
 * Modernized 4-tab architecture:
 * 1. Overview
 * 2. Providers (Merges Local, Free, and Pro)
 * 3. Subscription (Replaces Premium)
 * 4. Preferences (Merges Models and Settings)
 */

export type SectionId = "overview" | "providers" | "subscription" | "preferences";

export type AnySectionId = SectionId | "local" | "free" | "byok" | "premium" | "models" | "settings";

export function normalizeSectionId(sec?: string): SectionId {
  if (!sec) return "overview";
  if (sec === "overview") return "overview";
  if (sec === "providers" || sec === "local" || sec === "free" || sec === "byok") return "providers";
  if (sec === "subscription" || sec === "premium") return "subscription";
  if (sec === "preferences" || sec === "models" || sec === "settings") return "preferences";
  return "overview";
}

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "providers", label: "Providers" },
  { id: "subscription", label: "Subscription" },
  { id: "preferences", label: "Preferences" },
];

export default function AiAccessPage({
  onClose,
  mode = "manage",
  onContinue,
  onSkip,
  initialSection = "overview",
  section: controlledSection,
  onSectionChange,
}: {
  onClose?: () => void;
  mode?: "onboarding" | "manage";
  onContinue?: () => void;
  onSkip?: () => void;
  initialSection?: SectionId | AnySectionId;
  section?: SectionId | AnySectionId;
  onSectionChange?: (section: SectionId) => void;
}) {
  const access = useAiAccess();
  const [internalSection, setInternalSection] = useState<SectionId>(normalizeSectionId(initialSection));
  const activeSection = normalizeSectionId(controlledSection ?? internalSection);

  /** Provider id whose detail pane is open, or null for the section's list. */
  const [openProvider, setOpenProvider] = useState<string | null>(null);

  function go(next: SectionId) {
    if (onSectionChange) onSectionChange(next);
    else setInternalSection(next);
    setOpenProvider(null);
  }

  // Handle ESC key to close modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && openProvider) {
        setOpenProvider(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openProvider]);

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">AI Access</h1>
          {mode === "onboarding" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)]"
              >
                Continue
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
            >
              Close
            </button>
          )}
        </div>
        {mode === "onboarding" && (
          <div className="mx-auto max-w-5xl px-5 pb-3">
            <OnboardingProgress current="ai-setup" />
          </div>
        )}
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-5 py-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Decluttered sidebar: No subtitle text, 4 primary tabs, font-semibold & tracking-tight on active */}
        <nav aria-label="AI Access sections" className="md:sticky md:top-6 md:self-start">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {SECTIONS.map((s) => {
              const active = activeSection === s.id;
              return (
                <li key={s.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={s.label}
                    className={`w-full whitespace-nowrap rounded-[var(--radius-sm)] px-3.5 py-2 text-left text-sm transition-colors md:whitespace-normal font-sans ${
                      active
                        ? "bg-[color:var(--accent-subtle)] font-semibold tracking-tight text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0">
          <CredentialResetNotice className="mb-4" />
          {access.error && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] px-3 py-2 text-sm text-[color:var(--state-warning)]"
            >
              <span>
                Live status is unavailable ({access.error}). You can still browse providers; connecting needs the server.
              </span>
              <button
                type="button"
                onClick={() => void access.refresh()}
                disabled={access.loading}
                className="shrink-0 rounded-[var(--radius-sm)] border border-[color:var(--state-warning)] px-2.5 py-1 text-xs font-medium hover:bg-[color:var(--state-warning)] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                {access.loading ? "Checking..." : "Retry"}
              </button>
            </div>
          )}

          {/* Unified slide-over modal for provider connection workflow */}
          {openProvider && (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
              role="dialog"
              aria-modal="true"
              aria-label="Provider setup"
              onClick={() => setOpenProvider(null)}
            >
              <div
                className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-[color:var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setOpenProvider(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                  >
                    ← Back to providers
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenProvider(null)}
                    className="rounded-full p-1.5 text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] focus:outline-none cursor-pointer"
                    aria-label="Close setup modal"
                  >
                    ✕
                  </button>
                </div>
                <DetailPane access={access} providerId={openProvider} onBack={() => setOpenProvider(null)} />
              </div>
            </div>
          )}

          <SectionPane access={access} section={activeSection} onOpen={setOpenProvider} onGo={go} />
        </main>
      </div>
    </div>
  );
}

/* ── Detail Pane (Unified Configuration Surface) ─────────────────────────── */

function DetailPane({
  access,
  providerId,
  onBack,
}: {
  access: ReturnType<typeof useAiAccess>;
  providerId: string;
  onBack: () => void;
}) {
  const runner = getLocalRunner(providerId);
  const spec = getCloudProvider(providerId);
  const view = [...access.local, ...access.cloud].find((p) => p.id === providerId) ?? null;

  if (!view) return <p className="text-sm text-[color:var(--text-secondary)]">That provider is no longer available.</p>;

  if (runner) {
    return (
      <LocalRunnerDetail
        view={view}
        runner={runner}
        savedEndpoint={access.settings.preferences[`${providerId}Endpoint`] ?? null}
        onConnect={(endpoint, model, count, makeDefault) =>
          access.connectLocal(providerId, endpoint, model, count, makeDefault)
        }
        onDisconnect={() => access.disconnect(providerId)}
        onSetModel={(m) => access.setModelFor(providerId, m)}
        onMakeDefault={() => access.setDefaultProvider(providerId)}
        onBack={onBack}
      />
    );
  }

  if (spec) {
    return (
      <ProviderDetail
        view={view}
        spec={spec}
        onConnect={({ apiKey, model, baseUrl, makeDefault, tier }) =>
          access.connectCloud({ providerId, apiKey, tier: tier ?? "byok", model, baseUrl, makeDefault })
        }
        onDisconnect={() => access.disconnect(providerId)}
        onSetModel={(m) => access.setModelFor(providerId, m)}
        onMakeDefault={() => access.setDefaultProvider(providerId)}
        onBack={onBack}
      />
    );
  }

  return <p className="text-sm text-[color:var(--text-secondary)]">Unknown provider.</p>;
}

/* ── Section Switcher ────────────────────────────────────────────────────── */

function SectionPane({
  access,
  section,
  onOpen,
  onGo,
}: {
  access: ReturnType<typeof useAiAccess>;
  section: SectionId;
  onOpen: (id: string) => void;
  onGo: (s: SectionId) => void;
}) {
  switch (section) {
    case "overview":
      return <OverviewSection access={access} onGo={onGo} onOpen={onOpen} />;
    case "providers":
      return <ProvidersSection access={access} onOpen={onOpen} />;
    case "subscription":
      return <SubscriptionSection access={access} />;
    case "preferences":
      return <PreferencesSection access={access} onOpen={onOpen} />;
  }
}

function SectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-5 text-left">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400 max-w-2xl leading-relaxed">{blurb}</p>
    </div>
  );
}

/* ── 1. Overview Section ─────────────────────────────────────────────────── */

function OverviewSection({
  access,
  onGo,
  onOpen,
}: {
  access: ReturnType<typeof useAiAccess>;
  onGo: (s: SectionId) => void;
  onOpen: (id: string) => void;
}) {
  const totalConnected = access.connected.length;
  const counts = useMemo(
    () => ({
      local: access.local.filter((p) => p.connected).length,
      free: access.cloud.filter((p) => p.connected && p.tier === "free").length,
      byok: access.cloud.filter((p) => p.connected && p.tier === "byok").length,
    }),
    [access.cloud, access.local]
  );

  return (
    <div className="space-y-6 text-left">
      <SectionHeading
        title="Overview"
        blurb="Scholar picks the best available AI for each task from whatever you have connected — you never choose per request."
      />

      <div className="grid gap-3.5 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => onGo("providers")}
          className="group rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-4 sm:p-5 text-left transition-all hover:border-slate-300 dark:hover:border-neutral-700 hover:shadow-xs flex flex-col justify-between gap-3 shadow-2xs cursor-pointer h-full"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
              Providers
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 whitespace-nowrap shrink-0">
              {totalConnected > 0 ? `${totalConnected} connected` : "None"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 leading-normal">
            {counts.local} local, {counts.free + counts.byok} cloud accounts
          </p>
        </button>

        <button
          type="button"
          onClick={() => onGo("subscription")}
          className="group rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-4 sm:p-5 text-left transition-all hover:border-slate-300 dark:hover:border-neutral-700 hover:shadow-xs flex flex-col justify-between gap-3 shadow-2xs cursor-pointer h-full"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
              Subscription
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border ${
                access.premiumActive
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/60"
                  : "bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-700"
              }`}
            >
              {access.premiumActive ? "Active" : "Not subscribed"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 leading-normal">
            {access.premiumActive ? "Provided by Scholar Core" : "Core-hosted model pool"}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onGo("preferences")}
          className="group rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-4 sm:p-5 text-left transition-all hover:border-slate-300 dark:hover:border-neutral-700 hover:shadow-xs flex flex-col justify-between gap-3 shadow-2xs cursor-pointer h-full"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
              Preferences
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-neutral-700 whitespace-nowrap shrink-0 capitalize">
              {access.settings.provider || "Default"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-neutral-400 leading-normal">
            Routing, models & privacy
          </p>
        </button>
      </div>

      {access.connected.length > 0 ? (
        <section className="pt-2">
          <div className="mb-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Your connections
            </h3>
            <button
              type="button"
              onClick={() => onGo("providers")}
              className="text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors cursor-pointer group"
            >
              <span>Browse all providers</span>
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {access.connected.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p.id)}
                className="group flex items-center justify-between gap-3.5 rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-3.5 sm:p-4 text-left transition-all hover:border-slate-300 dark:hover:border-neutral-700 hover:shadow-xs focus:outline-hidden cursor-pointer shadow-2xs"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-neutral-800 border border-slate-200/70 dark:border-neutral-700/70 text-lg shadow-2xs transition-transform group-hover:scale-105"
                    style={p.spec?.color ? { color: p.spec.color } : undefined}
                  >
                    {p.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
                        {p.name}
                      </span>
                      {p.isDefault && (
                        <span className="inline-flex items-center rounded-md px-1.5 py-0.25 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-neutral-700 shrink-0">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="block truncate text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                      {p.selectedModel ? p.selectedModel : p.kind === "local" ? "Local Runner" : "Default model"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Connected
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-6 text-left shadow-2xs">
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Nothing connected yet</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400 max-w-xl leading-relaxed">
            Connect a local runner or cloud AI provider to power generation, synthesis, and research drafting.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onGo("providers")}
              className="rounded-xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 text-white px-4 py-2 text-xs font-semibold transition-all shadow-sm cursor-pointer"
            >
              Browse Providers
            </button>
            <button
              type="button"
              onClick={() => onGo("subscription")}
              className="rounded-xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-800/80 hover:bg-slate-50 dark:hover:bg-neutral-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all cursor-pointer"
            >
              Learn about Premium
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ── 2. Providers Section (Grid Component & Filter) ───────────────────────── */

function ProvidersSection({
  access,
  onOpen,
}: {
  access: ReturnType<typeof useAiAccess>;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "local" | "cloud">("all");
  const [query, setQuery] = useState("");

  const localItems = useMemo(() => {
    return LOCAL_RUNNERS.map((r) => {
      const isConnected = access.local.find((p) => p.id === r.id)?.connected ?? false;
      return {
        id: r.id,
        name: r.name,
        icon: r.icon,
        color: undefined,
        kind: "local" as const,
        connected: isConnected,
        tierBadge: "Local",
      };
    });
  }, [access.local]);

  const cloudItems = useMemo(() => {
    return CLOUD_PROVIDERS.map((s) => {
      const view = access.cloud.find((p) => p.id === s.id);
      const isConnected = view?.connected ?? false;
      const facts = providerAccessFacts(s);
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        color: s.color,
        kind: "cloud" as const,
        connected: isConnected,
        tierBadge: facts.usableWithoutPaying ? "Free" : "Pro",
      };
    });
  }, [access.cloud]);

  const allItems = useMemo(() => {
    return [...localItems, ...cloudItems];
  }, [localItems, cloudItems]);

  const displayedItems = useMemo(() => {
    let items = filter === "local" ? localItems : filter === "cloud" ? cloudItems : allItems;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(q));
    }
    return items;
  }, [filter, localItems, cloudItems, allItems, query]);

  // Hardware Profiler for Local Runners
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [localDetected, setLocalDetected] = useState<{ runnerId: string; name: string; modelCount: number } | null>(null);

  useEffect(() => {
    void loadHardwareProfile().then(setHardware);
    let cancelled = false;
    async function checkLocal() {
      try {
        const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1500) });
        if (res.ok && !cancelled) {
          const data = await res.json();
          const count = Array.isArray(data?.models) ? data.models.length : 0;
          setLocalDetected({ runnerId: "ollama", name: "Ollama", modelCount: count });
        }
      } catch {
        /* Not active locally or CORS-restricted */
      }
    }
    void checkLocal();
    return () => {
      cancelled = true;
    };
  }, []);

  async function detect() {
    setDetecting(true);
    try {
      const profile = await detectHardwareProfile();
      setHardware(profile);
      await saveHardwareProfile(profile);
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Providers"
        blurb="Connect local runners or cloud providers. Minimal cards display only essentials with unified connection setup."
      />

      {/* Auto-detected Local Runner Banner */}
      {localDetected && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="truncate">
              <span className="font-bold">{localDetected.name} is running on this device!</span>
              <span className="ml-1.5 opacity-80">({localDetected.modelCount} local model{localDetected.modelCount === 1 ? "" : "s"} ready)</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpen(localDetected.runnerId)}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors cursor-pointer shrink-0"
          >
            Configure Local AI →
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Segmented Pill Filter */}
        <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] p-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("local")}
            className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              filter === "local"
                ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            Local Runners
          </button>
          <button
            type="button"
            onClick={() => setFilter("cloud")}
            className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              filter === "cloud"
                ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            Cloud Providers
          </button>
        </div>

        {/* Search input */}
        <div className="sm:w-64">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${allItems.length} providers…`}
            aria-label="Search providers"
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-1.5 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)]"
          />
        </div>
      </div>

      {/* Responsive 3-column CSS Grid: ONLY Logo, Name, Tier Badge. No sentences! */}
      {displayedItems.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)] py-6 text-center">
          No providers found matching “{query}”.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedItems.map((provider) => {
            const isDefault = access.settings.provider === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => onOpen(provider.id)}
                className="group flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3.5 text-left transition-all hover:border-[color:var(--border-strong)] hover:shadow-2xs focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-solid)] cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--surface-canvas)] text-lg shadow-2xs"
                    style={provider.color ? { color: provider.color } : undefined}
                  >
                    {provider.icon}
                  </span>
                  <span className="truncate text-sm font-medium text-[color:var(--text-primary)] group-hover:text-[color:var(--accent-solid)] transition-colors">
                    {provider.name}
                  </span>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {isDefault && provider.connected && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-2xs">
                      ★ Primary
                    </span>
                  )}
                  {provider.connected ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border border-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]">
                      Connected
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                        provider.tierBadge === "Free"
                          ? "border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]"
                          : provider.tierBadge === "Local"
                          ? "border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]"
                          : "border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                      }`}
                    >
                      {provider.tierBadge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Hardware Profile & Manual Entry for Local Runners */}
      {(filter === "local" || filter === "all") && (
        <div className="mt-8 pt-6 border-t border-[color:var(--border-subtle)] space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Your hardware</h3>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">
              Estimated from what your browser reports — not a guaranteed measurement.
            </p>
            {hardware ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-[color:var(--text-secondary)]">
                  {hardware.os ?? "Unknown OS"} · {hardware.cpuCores ?? "?"} cores · {hardware.ramGb ?? "?"} GB RAM (
                  {hardware.detectionMethod === "manual" ? "your entry" : "browser estimate"})
                </p>
                {(() => {
                  const rec = recommendLocalModel(hardware);
                  return (
                    <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-canvas)] p-3 text-xs text-[color:var(--text-secondary)]">
                      <p className="font-medium text-[color:var(--text-primary)]">Recommended: {rec.sizeClass}</p>
                      <p className="mt-1">{rec.reasoning}</p>
                      {rec.warnings.map((w, i) => (
                        <p key={i} className="mt-1 text-[color:var(--state-warning)]">
                          {w}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">Not detected yet.</p>
            )}
            <button
              type="button"
              onClick={() => void detect()}
              disabled={detecting}
              className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 cursor-pointer"
            >
              {detecting ? "Detecting…" : "Detect my hardware"}
            </button>
          </div>

          <ManualHardwareForm onSaved={() => void loadHardwareProfile().then(setHardware)} />
        </div>
      )}
    </div>
  );
}

/* ── 3. Subscription Section (Replaces Premium) ──────────────────────────── */

function SubscriptionSection({ access }: { access: ReturnType<typeof useAiAccess> }) {
  const [catalog, setCatalog] = useState<PremiumCatalog | null>(null);
  const [plans, setPlans] = useState<OfferedPlan[]>([]);
  const [myRequest, setMyRequest] = useState<MyPremiumRequest | null>(null);
  const [chosenPlan, setChosenPlan] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    getPremiumCatalog().then(setCatalog).catch(() => setCatalog(null));
    getOfferedPlans().then(setPlans).catch(() => setPlans([]));
    getMyPremiumRequest().then(setMyRequest).catch(() => setMyRequest(null));
  }
  useEffect(reload, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestPremium(chosenPlan || undefined, note.trim() || undefined);
      setNote("");
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    try {
      await withdrawPremiumRequest();
      reload();
    } finally {
      setBusy(false);
    }
  }

  const q = access.status?.quota;
  const b = access.status?.creditBalance;
  const pending = myRequest?.status === "pending";
  const expiry = access.status?.entitlement.expiry;
  const expiresInDays = expiry ? Math.ceil((Date.parse(expiry) - Date.now()) / 86_400_000) : null;

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Subscription"
        blurb="AI paid for by Scholar Core. You never enter a key — requests run on Scholar Core's own infrastructure."
      />

      <section
        className={`rounded-[var(--radius-md)] border p-4 ${
          access.premiumActive
            ? "border-[color:var(--state-success)] bg-[color:var(--state-success-subtle)]"
            : "border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]"
        }`}
      >
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
          Subscription status: {access.premiumActive ? "Active" : "Not subscribed"}
        </h3>
        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
          {access.premiumActive
            ? "Nothing to configure. Scholar Core uses Premium automatically when it is the best available source for a task."
            : "Your status is verified on Scholar Core's server on every request — this page cannot switch it on."}
        </p>
        {access.premiumActive && expiresInDays !== null && expiresInDays <= 14 && (
          <p className="mt-2 text-xs font-medium text-[color:var(--state-warning)]">
            {expiresInDays <= 0
              ? "Your Premium subscription has expired."
              : `Your Premium subscription ends in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}. Contact an administrator to renew.`}
          </p>
        )}
      </section>

      {access.premiumActive && q && (
        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Your allowance</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[color:var(--text-secondary)]">
            <Stat label="Balance" value={b?.balance ?? 0} />
            <Stat label="Per-task cap" value={q.perTaskMaxCredits ?? "Unlimited"} />
            <Stat label="Daily" value={`${b?.daily_used ?? 0} / ${q.dailyCredits ?? "\u221e"}`} />
            <Stat label="Weekly" value={`${b?.weekly_used ?? 0} / ${q.weeklyCredits ?? "\u221e"}`} />
            <Stat label="Monthly" value={`${b?.monthly_used ?? 0} / ${q.monthlyCredits ?? "\u221e"}`} />
            <Stat label="At once" value={q.concurrencyLimit} />
          </dl>
        </section>
      )}

      {access.premiumActive && (
        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">What your plan includes</h3>
          {catalog && catalog.resources.length === 0 && (
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">Your plan does not grant any Premium AI yet.</p>
          )}
          <ul className="mt-2 space-y-2">
            {catalog?.resources.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-2">
                <p className="text-sm font-medium text-[color:var(--text-primary)]">{r.label}</p>
                {r.description && <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">{r.description}</p>}
                {r.capabilities.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {r.capabilities.map((c) => (
                      <Chip key={c} tone="neutral">
                        {c}
                      </Chip>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!access.premiumActive && (
        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Request Premium</h3>

          {pending ? (
            <>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                Your request is waiting for an administrator's decision.
              </p>
              <button
                type="button"
                onClick={() => void withdraw()}
                disabled={busy}
                className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60 cursor-pointer"
              >
                Withdraw request
              </button>
            </>
          ) : (
            <>
              {myRequest?.status === "declined" && (
                <p className="mt-2 text-sm text-[color:var(--state-warning)]">
                  A previous request was declined{myRequest.decision_note ? `: ${myRequest.decision_note}` : "."} You can ask again.
                </p>
              )}
              {plans.length > 0 ? (
                <>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">Choose the plan you would like.</p>
                  <ul className="mt-2 space-y-2">
                    {plans.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-2">
                          <input
                            type="radio"
                            name="plan"
                            value={p.id}
                            checked={chosenPlan === p.id}
                            onChange={() => setChosenPlan(p.id)}
                            className="mt-1"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[color:var(--text-primary)]">{p.name}</span>
                            {p.description && <span className="block text-xs text-[color:var(--text-muted)]">{p.description}</span>}
                            <span className="mt-0.5 block text-xs text-[color:var(--text-secondary)]">
                              {p.monthlyCredits ?? "\u221e"} credits/month
                              {p.dailyCredits ? ` \u00b7 ${p.dailyCredits}/day` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                  No plans are being offered right now. You can still send a request and an administrator will follow up.
                </p>
              )}
              <label htmlFor="premium-note" className="mt-3 block text-xs font-medium text-[color:var(--text-primary)]">
                Anything you want to add (optional)
              </label>
              <textarea
                id="premium-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
              />
              {error && (
                <p role="alert" className="mt-2 text-sm text-[color:var(--state-danger)]">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] disabled:opacity-60 cursor-pointer"
              >
                {busy ? "Sending\u2026" : "Request Premium"}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[color:var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[color:var(--text-primary)]">{value}</dd>
    </div>
  );
}

/* ── 4. Preferences Section (Routing, Active Models, Privacy & Security) ── */

function PreferencesSection({
  access,
  onOpen,
}: {
  access: ReturnType<typeof useAiAccess>;
  onOpen: (id: string) => void;
}) {
  const connected = access.connected;
  const fallback = access.settings.preferences.fallbackProvider ?? "";
  const privacy = access.settings.preferences.privacyPreference ?? "any";
  const [showPrivacyTooltip, setShowPrivacyTooltip] = useState(false);
  const [liveGrounding, setLiveGrounding] = useState<boolean>(() => getLiveSearchGroundingEnabled());

  useEffect(() => {
    return onLiveSearchGroundingChange((enabled) => {
      setLiveGrounding(enabled);
    });
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Preferences"
        blurb="Configure routing rules, active model choices, and privacy controls across your connected AI sources."
      />

      {/* 1. Routing Section */}
      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">Routing</h3>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            Define which connected provider Scholar prioritizes and which it falls back to when limits are reached.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="default-provider" className="block text-xs font-medium text-[color:var(--text-primary)] mb-1.5">
              Default provider
            </label>
            <select
              id="default-provider"
              value={access.settings.provider}
              onChange={(e) => void access.setDefaultProvider(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {connected.length === 0 && <option value={access.settings.provider}>Nothing connected yet</option>}
              {connected.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fallback-provider" className="block text-xs font-medium text-[color:var(--text-primary)] mb-1.5">
              Fallback provider
            </label>
            <select
              id="fallback-provider"
              value={fallback}
              onChange={(e) => void access.setPreference("fallbackProvider", e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
            >
              <option value="">Let Scholar Core decide</option>
              {connected.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 2. Active Models Section */}
      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">Active Models</h3>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            Map specific models to each connected provider.
          </p>
        </div>

        {connected.length === 0 ? (
          <p className="text-xs text-[color:var(--text-muted)] py-2">
            No providers connected yet. Connect a provider in the Providers tab to customize model mappings.
          </p>
        ) : (
          <ul className="space-y-2">
            {connected.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--text-primary)]">{p.name}</span>
                    {p.isDefault && <Chip tone="good">Default</Chip>}
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                    {p.selectedModel ? `Model: ${p.selectedModel}` : "Using provider default"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!p.isDefault && (
                    <button
                      type="button"
                      onClick={() => void access.setDefaultProvider(p.id)}
                      className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                  >
                    Change model
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Agentic Task Routing Matrix */}
      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">
              Agentic Task Routing Matrix
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
              How Scholar Core's autonomous editorial agents map tasks across your connected AI tiers.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[color:var(--accent-solid)] border border-[color:var(--border-subtle)] px-2 py-0.5 rounded-full bg-[color:var(--surface-inset)]">
            Auto-Orchestrated
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 pt-1">
          <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
              <span>🧠 Deep Reasoning</span>
            </div>
            <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
              Peer Review, G1 Gap Synthesis, Quality Gates, and Editorial Board.
            </p>
            <div className="text-[11px] font-mono font-medium text-[color:var(--text-primary)] pt-1">
              → {access.settings.provider ? `${access.settings.provider} (Primary)` : "DeepSeek-R1 / Claude"}
            </div>
          </div>

          <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <span>⚡ Fast Execution</span>
            </div>
            <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
              Evidentiary Extraction, Intake Processing, Outline Generation, Citation Extraction.
            </p>
            <div className="text-[11px] font-mono font-medium text-[color:var(--text-primary)] pt-1">
              → {fallback ? `${fallback} (Fast)` : "Groq / Flash / Local"}
            </div>
          </div>

          <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span>📚 Embeddings & Vault</span>
            </div>
            <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
              Semantic Search, Document Intelligence, Vector Indexing, Evidence Retrieval.
            </p>
            <div className="text-[11px] font-mono font-medium text-[color:var(--text-primary)] pt-1">
              → Gemini Embeddings / Local Vector
            </div>
          </div>
        </div>
      </section>

      {/* 3. Privacy & Security Section with Tooltip */}
      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">Privacy & Security</h3>
          <div className="relative inline-block">
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] text-[11px] font-bold text-[color:var(--text-muted)] hover:border-[color:var(--accent-solid)] hover:text-[color:var(--text-primary)] focus:outline-none cursor-help"
              aria-label="Learn more about encryption and privacy"
              onClick={() => setShowPrivacyTooltip((v) => !v)}
              onMouseEnter={() => setShowPrivacyTooltip(true)}
              onMouseLeave={() => setShowPrivacyTooltip(false)}
            >
              ?
            </button>
            {showPrivacyTooltip && (
              <div
                role="tooltip"
                className="absolute bottom-full left-0 mb-2 w-80 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3 text-xs text-[color:var(--text-secondary)] shadow-lg z-30 space-y-1.5"
              >
                <p className="font-semibold text-[color:var(--text-primary)]">Data Privacy & Key Encryption</p>
                <ul className="space-y-1 text-[11px] text-[color:var(--text-muted)] list-disc pl-3">
                  <li>Your API keys are encrypted at rest in this browser&apos;s local storage and are never stored in Scholar Core&apos;s database.</li>
                  <li>When an AI step runs on Scholar Core&apos;s server (project agents, drafting, Ask Scholar and Deep Research), your key is sent over HTTPS in a request header for that request only, used in memory, and never logged or stored. Other requests never include it.</li>
                  <li>Premium uses Scholar Core&apos;s own keys, held server-side. They are never sent to your browser.</li>
                  <li>Local runners receive your text directly from this device; it never reaches Scholar Core&apos;s servers.</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-[color:var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={privacy === "no-cloud"}
            onChange={(e) => void access.setPreference("privacyPreference", e.target.checked ? "no-cloud" : "any")}
            className="mt-0.5 rounded border-[color:var(--border-control)]"
          />
          <span>
            <span className="font-medium text-[color:var(--text-primary)]">Local AI only</span> — Never send my writing to a cloud provider.
            <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">
              With this on, tasks that cannot run locally are refused rather than forwarded to cloud providers.
            </span>
          </span>
        </label>
      </section>

      {/* 4. Live Web & Scholarly Search Grounding Section */}
      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">
              🌐 Live Web Search Grounding
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
              Automatically retrieve up-to-date open scholarly papers and web sources before generating responses.
            </p>
          </div>
          <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 border border-sky-300 dark:border-sky-800/60 px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40">
            Real-Time Citations
          </span>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-[color:var(--text-secondary)] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={liveGrounding}
            onChange={(e) => {
              const next = e.target.checked;
              setLiveGrounding(next);
              setLiveSearchGroundingEnabled(next);
            }}
            className="mt-0.5 rounded border-[color:var(--border-control)] text-sky-600 focus:ring-sky-500 cursor-pointer"
          />
          <span>
            <span className="font-medium text-[color:var(--text-primary)]">
              Enable real-time web & open scholarly search grounding by default
            </span>
            <span className="mt-0.5 block text-xs text-[color:var(--text-muted)] leading-relaxed">
              When active, prompt execution automatically queries OpenAlex, Crossref, and authoritative web indices, injecting fresh evidence snippets into the model's context for verifiable, hallucination-resistant answers.
            </span>
          </span>
        </label>
      </section>
    </div>
  );
}
