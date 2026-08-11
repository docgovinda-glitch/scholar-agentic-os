import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import {
  getAdminDashboard,
  getAdminProviders,
  setProviderEnabled,
  getPremiumPlans,
  grantPremiumTo,
  revokePremiumFrom,
  grantCreditsTo,
  getUsage,
  getBudget,
  updateBudget,
  getOpportunities,
  runOpportunityResearch,
  reviewOpportunity,
  getAuditLog,
  getAdmins,
  grantAdminAccess,
  revokeAdminAccess,
  type AdminProvider,
  type PremiumPlan,
  type UsageRow,
  type PlatformBudget,
  type Opportunity,
  type AuditLogEntry,
  type AdminRosterEntry,
} from "../aiAccess/aiAccessApi";

type Tab = "dashboard" | "providers" | "premium" | "usage" | "budget" | "opportunities" | "admins" | "audit";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "providers", label: "Providers" },
  { id: "premium", label: "Premium" },
  { id: "usage", label: "Usage" },
  { id: "budget", label: "Cost & Budget" },
  { id: "opportunities", label: "AI Opportunity Agent" },
  { id: "admins", label: "Admins" },
  { id: "audit", label: "Audit Logs" },
];

/**
 * Admin AI Infrastructure — Section 16. Reachable only from AiAccessPage
 * for a user requireAdmin (server-verified) confirms is an admin; every
 * request this panel makes still goes through that same server-side check
 * again on each route, so this component being reachable proves nothing on
 * its own — it's the routes, not the UI, that enforce access.
 */
export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">AI Infrastructure</h1>
          <button type="button" onClick={onClose} className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]">
            Close
          </button>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-5 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm ${
                tab === t.id ? "bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] font-medium" : "text-[color:var(--text-secondary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-6">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "providers" && <ProvidersTab />}
        {tab === "premium" && <PremiumTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "budget" && <BudgetTab />}
        {tab === "opportunities" && <OpportunitiesTab />}
        {tab === "admins" && <AdminsTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">{children}</div>;
}

function ErrorNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
      {error}
    </p>
  );
}

function DashboardTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminDashboard().then(setData).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Active providers" value={`${data.activeProviders}/${data.totalProviders}`} />
          <Stat label="Premium users" value={String(data.premiumUsers)} />
          <Stat label="Pending opportunities" value={String(data.pendingOpportunities)} />
          <Stat label="Platform credentials" value={String(data.platformCredentialsConfigured)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">{value}</p>
    </Card>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    getAdminProviders().then(setProviders).catch((e) => setError((e as Error).message));
  }
  useEffect(load, []);

  async function toggle(p: AdminProvider) {
    await setProviderEnabled(p.id, !p.enabled);
    load();
  }

  return (
    <div className="space-y-2">
      <ErrorNotice error={error} />
      {providers.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2.5">
          <div>
            <span className="text-sm font-medium text-[color:var(--text-primary)]">{p.name}</span>
            <span className="ml-2 text-xs text-[color:var(--text-muted)]">{p.category}</span>
          </div>
          <button
            type="button"
            onClick={() => toggle(p)}
            className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium ${p.enabled ? "text-[color:var(--state-danger)]" : "text-[color:var(--text-primary)]"}`}
          >
            {p.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      ))}
    </div>
  );
}

function PremiumTab() {
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [planId, setPlanId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getPremiumPlans().then(setPlans).catch((e) => setError((e as Error).message));
  }, []);

  async function handleGrant() {
    setMessage(null);
    try {
      await grantPremiumTo(userId, planId, null);
      setMessage(`Granted ${planId} to ${userId}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRevoke() {
    setMessage(null);
    try {
      await revokePremiumFrom(userId);
      setMessage(`Revoked Premium from ${userId}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleGrantCredits() {
    setMessage(null);
    try {
      await grantCreditsTo(userId, Number(creditAmount), "admin_grant");
      setMessage(`Granted ${creditAmount} credits to ${userId}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      {message && <p role="status" className="text-sm text-[color:var(--text-secondary)]">{message}</p>}

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Plans</h2>
        <div className="mt-2 space-y-1">
          {plans.map((p) => (
            <div key={p.id} className="text-sm text-[color:var(--text-secondary)]">
              {p.name} — {p.monthly_credits} credits/mo, {p.daily_credits ?? "∞"} /day, {p.per_task_max_credits ?? "∞"} per task, {p.concurrency_limit}x concurrent
            </div>
          ))}
          {plans.length === 0 && <p className="text-sm text-[color:var(--text-muted)]">No plans configured yet.</p>}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Manage a user</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User id"
            className="min-w-[220px] flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <input
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            placeholder="Plan id (for grant)"
            className="w-40 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <button type="button" onClick={handleGrant} disabled={!userId || !planId} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Grant Premium
          </button>
          <button type="button" onClick={handleRevoke} disabled={!userId} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--state-danger)] disabled:opacity-50">
            Revoke Premium
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            placeholder="Credit amount"
            type="number"
            className="w-40 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <button type="button" onClick={handleGrantCredits} disabled={!userId || !creditAmount} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Grant bonus credits
          </button>
        </div>
      </Card>
    </div>
  );
}

function UsageTab() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsage().then(setRows).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-2">
      <ErrorNotice error={error} />
      {rows.length === 0 && !error && <p className="text-sm text-[color:var(--text-muted)]">No usage recorded yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2 text-sm">
          <span className="text-[color:var(--text-secondary)]">
            {r.tier} · {r.provider_id ?? "—"} · {r.status}
          </span>
          <span className="text-[color:var(--text-muted)]">{r.scholar_credits_charged ?? 0} credits</span>
        </div>
      ))}
    </div>
  );
}

function BudgetTab() {
  const [budget, setBudget] = useState<PlatformBudget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState("");

  function load() {
    getBudget()
      .then((b) => {
        setBudget(b);
        if (b) setMonthlyBudget(String(b.monthly_budget_usd));
      })
      .catch((e) => setError((e as Error).message));
  }
  useEffect(load, []);

  async function handleSave() {
    await updateBudget({ monthly_budget_usd: Number(monthlyBudget) });
    load();
  }

  const pct = budget && budget.monthly_budget_usd > 0 ? Math.round((budget.current_month_spend_usd / budget.monthly_budget_usd) * 100) : 0;

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Platform AI budget</h2>
        {budget && (
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            ${budget.current_month_spend_usd.toFixed(2)} of ${budget.monthly_budget_usd.toFixed(2)} spent this month ({pct}%)
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            type="number"
            className="w-40 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <button type="button" onClick={handleSave} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium">
            Save monthly budget ($)
          </button>
        </div>
        {budget && (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            Warn at {budget.warn_threshold_pct}% · prefer cheaper models at {budget.prefer_cheap_threshold_pct}% · restrict expensive models at{" "}
            {budget.restrict_threshold_pct}% · stop new expensive jobs at {budget.stop_threshold_pct}%
          </p>
        )}
      </Card>
    </div>
  );
}

function OpportunitiesTab() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("official free tier AI API 2026");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    getOpportunities("new").then(setOpportunities).catch((e) => setError((e as Error).message));
  }
  useEffect(load, []);

  async function handleResearch() {
    setRunning(true);
    setMessage(null);
    try {
      const result = await runOpportunityResearch(query);
      setMessage(`Found ${result.foundCount} new opportunit${result.foundCount === 1 ? "y" : "ies"}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected" | "ignored") {
    await reviewOpportunity(id, decision);
    load();
  }

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Run research</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          Searches official sources only (via Tavily's cost-controlled basic search) and asks Gemini to extract legitimate opportunities — never
          creates accounts or applies for anything automatically.
        </p>
        <div className="mt-3 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm" />
          <button type="button" onClick={handleResearch} disabled={running} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            {running ? "Researching…" : "Run research"}
          </button>
        </div>
        {message && <p role="status" className="mt-2 text-sm text-[color:var(--text-secondary)]">{message}</p>}
      </Card>

      {opportunities.map((o) => (
        <Card key={o.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">{o.opportunity_name}</p>
              <p className="text-xs text-[color:var(--text-muted)]">{o.provider_name}</p>
            </div>
            <a href={o.official_url} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--accent)] underline shrink-0">
              Official page
            </a>
          </div>
          {o.eligibility && <p className="mt-2 text-xs text-[color:var(--text-secondary)]">Eligibility: {o.eligibility}</p>}
          {o.value_estimate && <p className="mt-1 text-xs text-[color:var(--text-secondary)]">Value: {o.value_estimate}</p>}
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
            Multi-user use: <strong>{o.multi_user_allowed}</strong> · Confidence: {o.confidence} · Risk: {o.risk}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => decide(o.id, "approved")} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-2.5 py-1 text-xs font-medium">
              Approve
            </button>
            <button type="button" onClick={() => decide(o.id, "rejected")} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[color:var(--state-danger)]">
              Reject
            </button>
            <button type="button" onClick={() => decide(o.id, "ignored")} className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs text-[color:var(--text-muted)]">
              Ignore
            </button>
          </div>
        </Card>
      ))}
      {opportunities.length === 0 && !error && <p className="text-sm text-[color:var(--text-muted)]">No pending opportunities. Run research to look for some.</p>}
    </div>
  );
}

/**
 * Who can reach this panel at all. Before this tab existed, admin_users was
 * only viewable or editable with a raw SQL statement in Supabase — invisible
 * from the app, easy to lose track of. Granting/revoking here still goes
 * through the same requireAdmin-gated routes as every other tab, so this is
 * not a new hole: an admin is required to create another one.
 */
function AdminsTab() {
  const [admins, setAdmins] = useState<AdminRosterEntry[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [newNote, setNewNote] = useState("");

  function load() {
    getAdmins().then(setAdmins).catch((e) => setError((e as Error).message));
  }
  useEffect(() => {
    load();
    if (isSupabaseConfigured()) {
      getSupabaseClient()
        .auth.getUser()
        .then(({ data }) => setSelfId(data.user?.id ?? null));
    }
  }, []);

  async function handleGrant() {
    setMessage(null);
    setError(null);
    try {
      await grantAdminAccess(newUserId.trim(), newNote.trim() || undefined);
      setMessage(`Granted admin access to ${newUserId.trim()}.`);
      setNewUserId("");
      setNewNote("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRevoke(userId: string) {
    setMessage(null);
    setError(null);
    try {
      await revokeAdminAccess(userId);
      setMessage(`Revoked admin access from ${userId}.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      {message && <p role="status" className="text-sm text-[color:var(--text-secondary)]">{message}</p>}

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Grant admin access</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          Only grant this to someone who should be able to see and change every user's Premium entitlement, platform provider
          credentials, and budget — everything on this screen.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            placeholder="User id"
            className="min-w-[220px] flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-56 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleGrant}
            disabled={!newUserId.trim()}
            className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Grant admin
          </button>
        </div>
      </Card>

      <div className="space-y-2">
        {admins.map((a) => (
          <div key={a.userId} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2.5">
            <div>
              <span className="text-sm font-medium text-[color:var(--text-primary)]">{a.fullName ?? a.username ?? a.userId}</span>
              {a.username && <span className="ml-2 text-xs text-[color:var(--text-muted)]">@{a.username}</span>}
              <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                Granted {new Date(a.grantedAt).toLocaleDateString()}
                {a.note ? ` — ${a.note}` : ""}
                {a.userId === selfId ? " — this is you" : ""}
              </p>
            </div>
            {a.userId === selfId ? (
              <span className="shrink-0 text-xs text-[color:var(--text-muted)]" title="You can't revoke your own admin access here — ask another admin, or edit the database directly.">
                (you)
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleRevoke(a.userId)}
                className="shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--state-danger)]"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
        {admins.length === 0 && !error && <p className="text-sm text-[color:var(--text-muted)]">No admins found.</p>}
      </div>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuditLog().then(setRows).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-2">
      <ErrorNotice error={error} />
      {rows.map((r) => (
        <div key={r.id} className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2 text-sm text-[color:var(--text-secondary)]">
          <span className="font-medium text-[color:var(--text-primary)]">{r.action}</span>
          {r.target_type && ` · ${r.target_type}${r.target_id ? `:${r.target_id}` : ""}`} · {new Date(r.created_at).toLocaleString()}
        </div>
      ))}
      {rows.length === 0 && !error && <p className="text-sm text-[color:var(--text-muted)]">No admin actions recorded yet.</p>}
    </div>
  );
}
