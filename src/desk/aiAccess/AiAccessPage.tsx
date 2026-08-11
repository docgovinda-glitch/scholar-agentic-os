import { useEffect, useState } from "react";
import { detectHardwareProfile, loadHardwareProfile, recommendLocalModel, saveHardwareProfile, type HardwareProfile } from "../../services/hardwareProfiler";
import { getAiAccessStatus, type AiAccessStatus } from "./aiAccessApi";

/**
 * AI Access — Section 20. The user's own view of where their AI comes from.
 *
 * Deliberately says nothing about Omni Router as something to configure —
 * Section 4/20's rule. What this shows is tier status (Local/Free/BYOK/
 * Premium), connected providers, hardware profile, and Premium quota if
 * entitled. Provider connection itself (entering a key, picking a model)
 * stays where it already lived and worked before this file existed:
 * AiSetupScreen (src/desk/setup/AiSetupScreen.tsx) — this page is the
 * status view, not a second setup flow.
 *
 * No admin entry point lives here anymore — the Admin AI Infrastructure
 * panel moved to its own dedicated /admin URL (src/admin/AdminApp.tsx),
 * reachable by no link an ordinary user ever sees. This page is open to
 * every signed-in user by design (it's each user's own status view), so it
 * must never be the thing that reveals admin functionality exists.
 */
export default function AiAccessPage({ onClose, onOpenSetup }: { onClose: () => void; onOpenSetup: () => void }) {
  const [status, setStatus] = useState<AiAccessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    getAiAccessStatus().then(setStatus).catch((e) => setError((e as Error).message));
    loadHardwareProfile().then(setHardware);
  }, []);

  async function handleDetectHardware() {
    setDetecting(true);
    try {
      const profile = await detectHardwareProfile();
      setHardware(profile);
      await saveHardwareProfile(profile);
    } finally {
      setDetecting(false);
    }
  }

  const localConnections = status?.connections.filter((c) => c.tier === "local") ?? [];
  const freeConnections = status?.connections.filter((c) => c.tier === "free") ?? [];
  const byokConnections = status?.connections.filter((c) => c.tier === "byok") ?? [];
  const premiumActive = status?.entitlement.active ?? false;

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">AI Access</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
            >
              Close
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8 space-y-6">
        <p className="text-sm text-[color:var(--text-secondary)]">
          Scholar automatically selects the best available AI for each task from whatever you've connected below — you never need to configure
          which one is used.
        </p>

        {error && (
          <p role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
            {error}
          </p>
        )}

        <TierCard
          title="Local"
          subtitle="Runs on your own computer. Nothing leaves your device."
          status={localConnections.length > 0 ? `Connected: ${localConnections.map((c) => c.provider_id).join(", ")}` : "Not configured"}
        />

        <TierCard
          title="Free"
          subtitle="Your own free-tier accounts. No cost to you."
          status={freeConnections.length > 0 ? `${freeConnections.length} provider${freeConnections.length === 1 ? "" : "s"} connected` : "Not configured"}
        />

        <TierCard
          title="Pro / BYOK"
          subtitle="Your own paid accounts. Scholar does not pay these costs."
          status={byokConnections.length > 0 ? `${byokConnections.length} provider${byokConnections.length === 1 ? "" : "s"} connected` : "Not configured"}
        />

        <TierCard
          title="Premium"
          subtitle="AI provided by Scholar. No key required."
          status={premiumActive ? "Active" : "Not subscribed"}
        >
          {premiumActive && status?.quota && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[color:var(--text-secondary)]">
              <div>Monthly credits: {status.quota.monthlyCredits ?? "Unlimited"}</div>
              <div>Weekly credits: {status.quota.weeklyCredits ?? "Unlimited"}</div>
              <div>Daily credits: {status.quota.dailyCredits ?? "Unlimited"}</div>
              <div>Balance: {status.creditBalance?.balance ?? 0}</div>
              <div>Used this month: {status.creditBalance?.monthly_used ?? 0}</div>
              <div>Used this week: {status.creditBalance?.weekly_used ?? 0}</div>
            </div>
          )}
        </TierCard>

        <button
          type="button"
          onClick={onOpenSetup}
          className="w-full rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
        >
          Connect a provider
        </button>

        <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Your hardware</h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Estimated from what your browser reports — not a guaranteed measurement.
          </p>
          {hardware ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-[color:var(--text-secondary)]">
                {hardware.os ?? "Unknown OS"} · {hardware.cpuCores ?? "?"} cores · {hardware.ramGb ?? "?"} GB RAM (browser estimate)
              </div>
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
            onClick={handleDetectHardware}
            disabled={detecting}
            className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-60"
          >
            {detecting ? "Detecting…" : "Detect my hardware"}
          </button>
        </section>
      </div>
    </div>
  );
}

function TierCard({ title, subtitle, status, children }: { title: string; subtitle: string; status: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</h2>
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">{subtitle}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-[color:var(--text-secondary)]">{status}</span>
      </div>
      {children}
    </section>
  );
}
