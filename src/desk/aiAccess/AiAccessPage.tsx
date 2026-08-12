import { useMemo, useState } from "react";
import { getCloudProvider, providerAccessFacts, type CloudProviderSpec } from "../../config/providerCatalog";
import { getLocalRunner } from "../../config/localRunnerCatalog";
import { detectHardwareProfile, loadHardwareProfile, recommendLocalModel, saveHardwareProfile, type HardwareProfile } from "../../services/hardwareProfiler";
import { useEffect } from "react";
import ProviderDetail, { Chip } from "./ProviderDetail";
import LocalRunnerDetail from "./LocalRunnerDetail";
import { byokProviders, freeProviders, useAiAccess, type ProviderView } from "./useAiAccess";
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

/**
 * AI Access — the user's provider and model manager.
 *
 * What this replaced, and why: this page used to be four read-only tier cards
 * plus a "Connect a provider" button that handed off to the onboarding setup
 * screen. That screen asks "which ONE provider do you want", so the whole
 * surface could only ever express a single choice — which is why every tier
 * read "Not configured" with no way to fix it from here.
 *
 * The rebuild is a new view over the SAME storage that was already
 * multi-provider (see useAiAccess.ts's header for why nothing underneath
 * needed replacing). AiSetupScreen is deliberately left intact and still owns
 * first-run onboarding; this owns ongoing management, and the two now share
 * one connection model instead of disagreeing about how many providers a user
 * may have.
 *
 * Layout is a left rail of sections rather than one long page, per the
 * request: each section renders its own list, and selecting a provider swaps
 * the right pane for that provider's own configuration rather than scrolling
 * to it. Nothing about Omni Router is presented as configurable — Section
 * 4/20's rule that routing is automatic still holds.
 */

type SectionId = "overview" | "local" | "free" | "byok" | "premium" | "models" | "settings";

const SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "What is connected" },
  { id: "local", label: "Local AI", hint: "On your computer" },
  { id: "free", label: "Free AI", hint: "No cost to you" },
  { id: "byok", label: "Pro / BYOK", hint: "Your own keys" },
  { id: "premium", label: "Premium", hint: "Provided by Scholar" },
  { id: "models", label: "Models", hint: "Defaults and choices" },
  { id: "settings", label: "Settings", hint: "Routing and security" },
];

export default function AiAccessPage({ onClose, onOpenSetup }: { onClose: () => void; onOpenSetup: () => void }) {
  const access = useAiAccess();
  const [section, setSection] = useState<SectionId>("overview");
  /** Provider id whose detail pane is open, or null for the section's list. */
  const [openProvider, setOpenProvider] = useState<string | null>(null);

  function go(next: SectionId) {
    setSection(next);
    setOpenProvider(null);
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">AI Access</h1>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
          >
            Close
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-5 py-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="AI Access sections" className="md:sticky md:top-6 md:self-start">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {SECTIONS.map((s) => {
              const active = section === s.id;
              return (
                <li key={s.id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={active ? "page" : undefined}
                    // Explicit, so the accessible name is the section name
                    // alone. Without it the hint line below is concatenated
                    // into the name ("Premium Provided by Scholar"), which
                    // reads poorly aloud and makes the control ambiguous with
                    // the Overview tile of the same name.
                    aria-label={s.label}
                    className={`w-full whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors md:whitespace-normal ${
                      active
                        ? "bg-[color:var(--accent-subtle)] font-semibold text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    <span className="block">{s.label}</span>
                    <span className="hidden text-xs font-normal text-[color:var(--text-muted)] md:block">{s.hint}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0">
          {access.error && (
            <p role="alert" className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] px-3 py-2 text-sm text-[color:var(--state-warning)]">
              Live status is unavailable ({access.error}). You can still browse providers; connecting needs the server.
            </p>
          )}

          {openProvider ? (
            <DetailPane access={access} providerId={openProvider} section={section} onBack={() => setOpenProvider(null)} />
          ) : (
            <SectionPane access={access} section={section} onOpen={setOpenProvider} onGo={go} onOpenSetup={onOpenSetup} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Detail routing ─────────────────────────────────────────────────────── */

function DetailPane({
  access,
  providerId,
  section,
  onBack,
}: {
  access: ReturnType<typeof useAiAccess>;
  providerId: string;
  section: SectionId;
  onBack: () => void;
}) {
  const runner = getLocalRunner(providerId);
  const spec = getCloudProvider(providerId);
  const view =
    [...access.local, ...access.cloud].find((p) => p.id === providerId) ??
    null;

  if (!view) return <p className="text-sm text-[color:var(--text-secondary)]">That provider is no longer available.</p>;

  if (runner) {
    return (
      <LocalRunnerDetail
        view={view}
        runner={runner}
        savedEndpoint={access.settings.preferences[`${providerId}Endpoint`] ?? null}
        onConnect={(endpoint, model, count, makeDefault) => access.connectLocal(providerId, endpoint, model, count, makeDefault)}
        onDisconnect={() => access.disconnect(providerId)}
        onSetModel={(m) => access.setModelFor(providerId, m)}
        onMakeDefault={() => access.setDefaultProvider(providerId)}
        onBack={onBack}
      />
    );
  }

  if (spec) {
    // Which tier this connection is recorded under follows the section the
    // user came from: the same freemium provider is legitimately a "free
    // tier" connection for one user and a paid BYOK connection for another,
    // and only the user knows which key they pasted.
    const tier = section === "free" ? "free" : "byok";
    return (
      <ProviderDetail
        view={view}
        spec={spec}
        tier={tier}
        onConnect={({ apiKey, model, baseUrl, makeDefault }) =>
          access.connectCloud({ providerId, apiKey, tier, model, baseUrl, makeDefault })
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

/* ── Sections ───────────────────────────────────────────────────────────── */

function SectionPane({
  access,
  section,
  onOpen,
  onGo,
  onOpenSetup,
}: {
  access: ReturnType<typeof useAiAccess>;
  section: SectionId;
  onOpen: (id: string) => void;
  onGo: (s: SectionId) => void;
  onOpenSetup: () => void;
}) {
  switch (section) {
    case "overview":
      return <OverviewSection access={access} onGo={onGo} onOpen={onOpen} onOpenSetup={onOpenSetup} />;
    case "local":
      return <LocalSection access={access} onOpen={onOpen} />;
    case "free":
      return <CloudSection access={access} onOpen={onOpen} specs={freeProviders()} heading="Free AI" blurb="Providers you can genuinely use without paying. Each needs its own free account and key." />;
    case "byok":
      return <CloudSection access={access} onOpen={onOpen} specs={byokProviders()} heading="Pro / BYOK" blurb="Bring a key you already hold. Every provider Scholar can talk to is listed, free-tier ones included — a paid key works here too." />;
    case "premium":
      return <PremiumSection access={access} />;
    case "models":
      return <ModelsSection access={access} onOpen={onOpen} />;
    case "settings":
      return <SettingsSection access={access} />;
  }
}

function SectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">{title}</h2>
      <p className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{blurb}</p>
    </div>
  );
}

function OverviewSection({
  access,
  onGo,
  onOpen,
  onOpenSetup,
}: {
  access: ReturnType<typeof useAiAccess>;
  onGo: (s: SectionId) => void;
  onOpen: (id: string) => void;
  onOpenSetup: () => void;
}) {
  const counts = useMemo(
    () => ({
      local: access.local.filter((p) => p.connected).length,
      free: access.cloud.filter((p) => p.connected && p.tier === "free").length,
      byok: access.cloud.filter((p) => p.connected && p.tier === "byok").length,
    }),
    [access.cloud, access.local]
  );

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Overview"
        blurb="Scholar picks the best available AI for each task from whatever you have connected — you never choose per request."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <TierTile label="Local AI" count={counts.local} unit="runner" onClick={() => onGo("local")} note="Runs on your computer. Nothing leaves your device." />
        <TierTile label="Free AI" count={counts.free} unit="provider" onClick={() => onGo("free")} note="Your own free-tier accounts." />
        <TierTile label="Pro / BYOK" count={counts.byok} unit="provider" onClick={() => onGo("byok")} note="Your own paid accounts." />
        <TierTile
          label="Premium"
          count={access.premiumActive ? 1 : 0}
          unit="subscription"
          onClick={() => onGo("premium")}
          note={access.premiumActive ? "Active — no key needed." : "Not subscribed."}
        />
      </div>

      {access.connected.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">Your connections</h3>
          <ul className="space-y-2">
            {access.connected.map((p) => (
              <li key={p.id}>
                <ProviderRow view={p} onOpen={() => onOpen(p.id)} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Nothing connected yet</h3>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Start with Local AI if you want everything to stay on your computer, or Free AI for the quickest setup.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onGo("local")} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]">
              Set up Local AI
            </button>
            <button type="button" onClick={() => onGo("free")} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]">
              Browse Free AI
            </button>
            <button type="button" onClick={onOpenSetup} className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]">
              Guided setup
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function TierTile({ label, count, unit, note, onClick }: { label: string; count: number; unit: string; note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 text-left hover:border-[color:var(--border-strong)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[color:var(--text-primary)]">{label}</span>
        <span className="text-xs font-medium text-[color:var(--text-secondary)]">
          {count > 0 ? `${count} ${unit}${count === 1 ? "" : "s"}` : "None"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">{note}</p>
    </button>
  );
}

function ProviderRow({ view, onOpen }: { view: ProviderView; onOpen: () => void }) {
  const facts = view.spec ? providerAccessFacts(view.spec) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 py-2.5 text-left hover:border-[color:var(--border-strong)]"
    >
      <span aria-hidden className="text-lg leading-none" style={view.spec ? { color: view.spec.color } : undefined}>
        {view.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-[color:var(--text-primary)]">{view.name}</span>
          {view.isDefault && <Chip tone="good">Default</Chip>}
          {view.connected && <Chip tone="good">Connected</Chip>}
          {!view.connected && facts && <Chip tone={facts.usableWithoutPaying ? "neutral" : "warn"}>{facts.costLabel}</Chip>}
          {view.kind === "local" && <Chip tone="neutral">Local</Chip>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[color:var(--text-muted)]">
          {view.selectedModel ? `Model: ${view.selectedModel}` : view.description}
        </span>
      </span>
      <span aria-hidden className="text-[color:var(--text-muted)]">›</span>
    </button>
  );
}

function LocalSection({ access, onOpen }: { access: ReturnType<typeof useAiAccess>; onOpen: (id: string) => void }) {
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    void loadHardwareProfile().then(setHardware);
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

  const connected = access.local.filter((p) => p.connected);
  const available = access.local.filter((p) => !p.connected);

  return (
    <div className="space-y-5">
      <SectionHeading title="Local AI" blurb="Runs on your own computer. Nothing you write leaves your machine, and there is no key and no account." />

      {connected.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">Connected</h3>
          <ul className="space-y-2">
            {connected.map((p) => (
              <li key={p.id}>
                <ProviderRow view={p} onOpen={() => onOpen(p.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">Available runners</h3>
        <ul className="space-y-2">
          {available.map((p) => (
            <li key={p.id}>
              <ProviderRow view={p} onOpen={() => onOpen(p.id)} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Your hardware</h3>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">Estimated from what your browser reports — not a guaranteed measurement.</p>
        {hardware ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-[color:var(--text-secondary)]">
              {hardware.os ?? "Unknown OS"} · {hardware.cpuCores ?? "?"} cores · {hardware.ramGb ?? "?"} GB RAM (browser estimate)
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
          className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
        >
          {detecting ? "Detecting…" : "Detect my hardware"}
        </button>
      </section>
    </div>
  );
}

function CloudSection({
  access,
  onOpen,
  specs,
  heading,
  blurb,
}: {
  access: ReturnType<typeof useAiAccess>;
  onOpen: (id: string) => void;
  specs: CloudProviderSpec[];
  heading: string;
  blurb: string;
}) {
  const [query, setQuery] = useState("");
  const views = new Map(access.cloud.map((v) => [v.id, v]));
  const filtered = specs.filter((s) => {
    const q = query.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });
  const connected = filtered.filter((s) => views.get(s.id)?.connected);
  const rest = filtered.filter((s) => !views.get(s.id)?.connected);

  return (
    <div className="space-y-5">
      <SectionHeading title={heading} blurb={blurb} />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${specs.length} providers…`}
        aria-label={`Search ${heading} providers`}
        className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
      />

      {connected.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">My connections</h3>
          <ul className="space-y-2">
            {connected.map((s) => {
              const v = views.get(s.id);
              return v ? (
                <li key={s.id}>
                  <ProviderRow view={v} onOpen={() => onOpen(s.id)} />
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-[color:var(--text-primary)]">
          Available providers {rest.length > 0 && <span className="font-normal text-[color:var(--text-muted)]">({rest.length})</span>}
        </h3>
        {rest.length === 0 ? (
          <p className="text-sm text-[color:var(--text-muted)]">No provider matches “{query}”.</p>
        ) : (
          <ul className="space-y-2">
            {rest.map((s) => {
              const v = views.get(s.id);
              return v ? (
                <li key={s.id}>
                  <ProviderRow view={v} onOpen={() => onOpen(s.id)} />
                </li>
              ) : null;
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PremiumSection({ access }: { access: ReturnType<typeof useAiAccess> }) {
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
      <SectionHeading title="Premium" blurb="AI paid for by Scholar. You never enter a key — requests run on Scholar's own infrastructure." />

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
            ? "Nothing to configure. Scholar uses Premium automatically when it is the best available source for a task."
            : "Your status is verified on Scholar's server on every request — this page cannot switch it on."}
        </p>
        {/* Told before it lapses rather than discovered by a failed request. */}
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

      {/* What the subscriber is entitled to, named by capability. There is
          deliberately no provider or model here — the administrator can move a
          capability between providers and this list does not change. */}
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

      {/* The self-service path. Before this, a non-subscriber saw "granted by
          an administrator" and had no action available at all. */}
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
                className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
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
                className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2 text-sm font-semibold text-[color:var(--text-inverse)] disabled:opacity-60"
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

function ModelsSection({ access, onOpen }: { access: ReturnType<typeof useAiAccess>; onOpen: (id: string) => void }) {
  const connected = access.connected;
  return (
    <div className="space-y-5">
      <SectionHeading title="Models" blurb="The model each connected provider will use, and which provider Scholar prefers by default." />

      {connected.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">Connect a provider first — there are no models to choose between yet.</p>
      ) : (
        <ul className="space-y-2">
          {connected.map((p) => (
            <li key={p.id} className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text-primary)]">
                    {p.name}
                    {p.isDefault && <Chip tone="good">Default</Chip>}
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                    {p.selectedModel ? p.selectedModel : "No model chosen — the provider's own default is used."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!p.isDefault && (
                    <button
                      type="button"
                      onClick={() => void access.setDefaultProvider(p.id)}
                      className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
                  >
                    Change model
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsSection({ access }: { access: ReturnType<typeof useAiAccess> }) {
  const connected = access.connected;
  const fallback = access.settings.preferences.fallbackProvider ?? "";
  const privacy = access.settings.preferences.privacyPreference ?? "any";

  return (
    <div className="space-y-5">
      <SectionHeading title="Settings" blurb="How Scholar chooses between what you have connected, and what leaves your machine." />

      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
        <label htmlFor="default-provider" className="text-sm font-semibold text-[color:var(--text-primary)]">
          Default provider
        </label>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">Preferred when more than one source could handle a task equally well.</p>
        <select
          id="default-provider"
          value={access.settings.provider}
          onChange={(e) => void access.setDefaultProvider(e.target.value)}
          className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
        >
          {connected.length === 0 && <option value={access.settings.provider}>Nothing connected yet</option>}
          {connected.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
        <label htmlFor="fallback-provider" className="text-sm font-semibold text-[color:var(--text-primary)]">
          Fallback provider
        </label>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">Tried when the default is unreachable or out of quota.</p>
        <select
          id="fallback-provider"
          value={fallback}
          onChange={(e) => void access.setPreference("fallbackProvider", e.target.value)}
          className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
        >
          <option value="">Let Scholar decide</option>
          {connected.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Security</h3>
        <label className="mt-2 flex items-start gap-2 text-sm text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={privacy === "no-cloud"}
            onChange={(e) => void access.setPreference("privacyPreference", e.target.checked ? "no-cloud" : "any")}
            className="mt-0.5"
          />
          <span>
            Never send my writing to a cloud provider — use Local AI only.
            <span className="mt-0.5 block text-xs text-[color:var(--text-muted)]">
              With this on, a task Scholar cannot run locally is refused rather than sent to the cloud.
            </span>
          </span>
        </label>
        <ul className="mt-3 space-y-1 text-xs text-[color:var(--text-muted)]">
          <li>· Your API keys are encrypted and stored on this device only — never on Scholar's servers.</li>
          <li>· Premium uses Scholar's own keys, held server-side. They are never sent to your browser.</li>
          <li>· Local runners receive your text directly from this device; it never reaches Scholar's servers.</li>
        </ul>
      </section>
    </div>
  );
}
