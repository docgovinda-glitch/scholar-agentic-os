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
  getQuotaOverride,
  setQuotaOverride,
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
  setAdminScopes,
  searchUsers,
  setUserAccountStatus,
  deleteUserPermanently,
  SCOPES,
  type Scope,
  type AdminProvider,
  type PremiumPlan,
  type UsageRow,
  type PlatformBudget,
  type Opportunity,
  type AuditLogEntry,
  type AdminRosterEntry,
  type UserSearchResult,
} from "../aiAccess/aiAccessApi";

type Tab = "dashboard" | "providers" | "premium" | "usage" | "budget" | "opportunities" | "users" | "admins" | "audit";

const TABS: Array<{ id: Tab; label: string; requiredScope?: Scope }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "providers", label: "Providers", requiredScope: "manage_providers" },
  { id: "premium", label: "Premium", requiredScope: "manage_premium" },
  { id: "usage", label: "Usage" },
  { id: "budget", label: "Cost & Budget", requiredScope: "manage_budget" },
  { id: "opportunities", label: "AI Opportunity Agent", requiredScope: "manage_opportunities" },
  { id: "users", label: "Users", requiredScope: "manage_users" },
  { id: "admins", label: "Admins", requiredScope: "manage_admins" },
  { id: "audit", label: "Audit Logs" },
];

/** Friendly, one-line description of what each scope actually unlocks — used by the Admins tab's grant/edit checkboxes. */
export const SCOPE_LABELS: Record<Scope, string> = {
  manage_providers: "Enable/disable AI providers & models, manage platform credentials",
  manage_premium: "Grant/revoke Premium, set credit quotas",
  manage_budget: "Change the platform AI spending budget",
  manage_opportunities: "Run and review the AI Opportunity Agent",
  manage_users: "Search, suspend/restore, and permanently delete user accounts",
  manage_admins: "Grant, revoke, and edit other admins' permissions",
};

export interface AdminIdentity {
  isMainAdmin: boolean;
  scopes: Scope[];
}

/**
 * Admin AI Infrastructure — Section 16. Reachable only at the dedicated
 * /admin URL (src/admin/AdminApp.tsx), which itself only renders this after
 * the server's /whoami confirms the signed-in account is an admin. Every
 * request this panel makes still goes through that same server-side check
 * (and, per-mutation, a requireScopeInline scope check) again on each
 * route, so this component being reachable proves nothing on its own — it's
 * the routes, not the UI, that enforce access. Tabs a caller's own scopes
 * don't cover are hidden, not merely disabled — hiding is what actually
 * keeps a limited admin from seeing controls that would just 403 anyway.
 */
export default function AdminPanel({ onClose, closeLabel = "Close", identity }: { onClose: () => void; closeLabel?: string; identity: AdminIdentity }) {
  const canSee = (id: Tab) => {
    const t = TABS.find((x) => x.id === id);
    return !t?.requiredScope || identity.isMainAdmin || identity.scopes.includes(t.requiredScope);
  };
  const visibleTabs = TABS.filter((t) => canSee(t.id));
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">AI Infrastructure</h1>
          <button type="button" onClick={onClose} className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]">
            {closeLabel}
          </button>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-5 pb-2">
          {visibleTabs.map((t) => (
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
        {tab === "providers" && canSee("providers") && <ProvidersTab />}
        {tab === "premium" && canSee("premium") && <PremiumTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "budget" && canSee("budget") && <BudgetTab />}
        {tab === "opportunities" && canSee("opportunities") && <OpportunitiesTab />}
        {tab === "users" && canSee("users") && <UsersTab />}
        {tab === "admins" && canSee("admins") && <AdminsTab isMainAdmin={identity.isMainAdmin} />}
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [userId, setUserId] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [planId, setPlanId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [monthly, setMonthly] = useState("");
  const [weekly, setWeekly] = useState("");
  const [daily, setDaily] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getPremiumPlans().then(setPlans).catch((e) => setError((e as Error).message));
  }, []);

  async function handleSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchUsers(query.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function selectUser(u: UserSearchResult) {
    setUserId(u.userId);
    setSelectedLabel(u.email ?? u.username ?? u.fullName ?? u.userId);
    setResults([]);
    setQuery("");
    getQuotaOverride(u.userId)
      .then((q) => {
        setMonthly(q?.monthly_credits != null ? String(q.monthly_credits) : "");
        setWeekly(q?.weekly_credits != null ? String(q.weekly_credits) : "");
        setDaily(q?.daily_credits != null ? String(q.daily_credits) : "");
      })
      .catch(() => {});
  }

  async function handleGrant() {
    setMessage(null);
    try {
      await grantPremiumTo(userId, planId, null);
      setMessage(`Granted ${planId} to ${selectedLabel || userId}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRevoke() {
    setMessage(null);
    try {
      await revokePremiumFrom(userId);
      setMessage(`Revoked Premium from ${selectedLabel || userId}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleGrantCredits() {
    setMessage(null);
    try {
      await grantCreditsTo(userId, Number(creditAmount), "admin_grant");
      setMessage(`Granted ${creditAmount} credits to ${selectedLabel || userId}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSaveQuota() {
    setMessage(null);
    try {
      await setQuotaOverride({
        userId,
        monthlyCredits: monthly === "" ? null : Number(monthly),
        weeklyCredits: weekly === "" ? null : Number(weekly),
        dailyCredits: daily === "" ? null : Number(daily),
      });
      setMessage(`Saved quota for ${selectedLabel || userId}.`);
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
              {p.name} — {p.monthly_credits} credits/mo, {p.weekly_credits ?? "∞"} /week, {p.daily_credits ?? "∞"} /day, {p.per_task_max_credits ?? "∞"} per task, {p.concurrency_limit}x concurrent
            </div>
          ))}
          {plans.length === 0 && <p className="text-sm text-[color:var(--text-muted)]">No plans configured yet.</p>}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Find a user</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by email or username"
            className="min-w-[220px] flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <button type="button" onClick={handleSearch} disabled={searching} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)]">
            {results.map((u) => (
              <li key={u.userId}>
                <button type="button" onClick={() => selectUser(u)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-[color:var(--surface-hover)]">
                  {u.email ?? u.username ?? u.userId} {u.accountStatus && u.accountStatus !== "active" && `(${u.accountStatus})`}
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedLabel && <p className="mt-2 text-xs text-[color:var(--text-muted)]">Selected: {selectedLabel}</p>}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Manage the selected user</h2>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User id (or select one above)"
          className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
        />
        <div className="mt-3 flex flex-wrap gap-2">
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
        <h3 className="mt-4 text-xs font-semibold text-[color:var(--text-primary)]">Quota override (blank = use the plan's default)</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Monthly credits" type="number" className="w-36 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm" />
          <input value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="Weekly credits" type="number" className="w-36 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm" />
          <input value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="Daily credits" type="number" className="w-36 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm" />
          <button type="button" onClick={handleSaveQuota} disabled={!userId} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Save quota
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
 * User accounts — search, suspend/restore (reversible, one click, no data
 * loss — profiles.account_status, now actually enforced server-side by
 * requireAuth on every route, not just the login screen), and permanent
 * deletion (irreversible — requires typing the account's own current email
 * to confirm, checked again server-side against Supabase's own record for
 * that id, not just trusted from this form).
 */
function UsersTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserSearchResult | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  async function handleSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchUsers(query.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function toggleStatus(u: UserSearchResult) {
    setMessage(null);
    setError(null);
    const next = u.accountStatus === "suspended" ? "active" : "suspended";
    try {
      await setUserAccountStatus(u.userId, next);
      setMessage(`${next === "suspended" ? "Suspended" : "Restored"} ${u.email ?? u.username ?? u.userId}.`);
      setResults((rs) => rs.map((r) => (r.userId === u.userId ? { ...r, accountStatus: next } : r)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setMessage(null);
    setError(null);
    try {
      await deleteUserPermanently(deleteTarget.userId, confirmEmail);
      setMessage(`Permanently deleted ${deleteTarget.email ?? deleteTarget.userId}.`);
      setResults((rs) => rs.filter((r) => r.userId !== deleteTarget.userId));
      setDeleteTarget(null);
      setConfirmEmail("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      {message && <p role="status" className="text-sm text-[color:var(--text-secondary)]">{message}</p>}

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Search users</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by email or username"
            className="min-w-[220px] flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <button type="button" onClick={handleSearch} disabled={searching} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </Card>

      <div className="space-y-2">
        {results.map((u) => (
          <div key={u.userId} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2.5">
            <div>
              <span className="text-sm font-medium text-[color:var(--text-primary)]">{u.email ?? u.username ?? u.userId}</span>
              {u.username && u.email && <span className="ml-2 text-xs text-[color:var(--text-muted)]">@{u.username}</span>}
              <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">{u.accountStatus ?? "active"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => toggleStatus(u)} className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-primary)]">
                {u.accountStatus === "suspended" ? "Restore" : "Suspend"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(u);
                  setConfirmEmail("");
                }}
                className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--state-danger)]"
              >
                Delete…
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] p-4">
          <p className="text-sm font-semibold text-[color:var(--state-danger)]">Permanently delete this account?</p>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
            This is irreversible — it removes {deleteTarget.email ?? deleteTarget.userId} and everything owned by this account. Type the account's
            email ({deleteTarget.email ?? "unknown — cannot confirm by email"}) to confirm.
          </p>
          <input
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="Type the account's email to confirm"
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={!confirmEmail || !deleteTarget.email}
              className="rounded-[var(--radius-sm)] bg-[color:var(--state-danger)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Permanently delete
            </button>
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopeCheckboxes({ selected, onChange }: { selected: Scope[]; onChange: (scopes: Scope[]) => void }) {
  function toggle(scope: Scope) {
    onChange(selected.includes(scope) ? selected.filter((s) => s !== scope) : [...selected, scope]);
  }
  return (
    <div className="mt-2 space-y-1">
      {SCOPES.map((s) => (
        <label key={s} className="flex items-start gap-2 text-xs text-[color:var(--text-secondary)]">
          <input type="checkbox" checked={selected.includes(s)} onChange={() => toggle(s)} className="mt-0.5" />
          <span>
            <span className="font-medium text-[color:var(--text-primary)]">{s}</span> — {SCOPE_LABELS[s]}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Who can reach this panel at all. Before this tab existed, admin_users was
 * only viewable or editable with a raw SQL statement in Supabase — invisible
 * from the app, easy to lose track of. Granting/revoking/scoping here still
 * goes through the same requireScope("manage_admins")-gated routes as
 * everything else, so this is not a new hole: an admin with that specific
 * permission is required to create or reconfigure another one.
 */
function AdminsTab({ isMainAdmin }: { isMainAdmin: boolean }) {
  const [admins, setAdmins] = useState<AdminRosterEntry[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newScopes, setNewScopes] = useState<Scope[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScopes, setEditScopes] = useState<Scope[]>([]);

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
      await grantAdminAccess(newUserId.trim(), newScopes, newNote.trim() || undefined);
      setMessage(`Granted admin access to ${newUserId.trim()}.`);
      setNewUserId("");
      setNewNote("");
      setNewScopes([]);
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

  async function handleSaveScopes(userId: string) {
    setMessage(null);
    setError(null);
    try {
      await setAdminScopes(userId, editScopes);
      setMessage(`Updated permissions for ${userId}.`);
      setEditingId(null);
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
        <p className="text-xs text-[color:var(--text-muted)]">
          The hardcoded main admin (set via the server's MAIN_ADMIN_EMAIL) always has every permission and never appears below — it isn't a row in
          this table, so it can never be revoked by anyone, including itself.
          {isMainAdmin && " You are signed in as the main admin."}
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Grant admin access</h2>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          Choose exactly which permissions this admin gets — leave all unchecked for a read-only admin who can see dashboards, usage, and the audit
          log, but change nothing.
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
        </div>
        <ScopeCheckboxes selected={newScopes} onChange={setNewScopes} />
        <button
          type="button"
          onClick={handleGrant}
          disabled={!newUserId.trim()}
          className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          Grant admin
        </button>
      </Card>

      <div className="space-y-2">
        {admins.map((a) => (
          <div key={a.userId} className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-[color:var(--text-primary)]">{a.fullName ?? a.username ?? a.userId}</span>
                {a.username && <span className="ml-2 text-xs text-[color:var(--text-muted)]">@{a.username}</span>}
                <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                  Granted {new Date(a.grantedAt).toLocaleDateString()}
                  {a.note ? ` — ${a.note}` : ""}
                  {a.userId === selfId ? " — this is you" : ""}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">{a.scopes.length > 0 ? a.scopes.join(", ") : "No permissions granted (read-only)"}</p>
              </div>
              {a.userId === selfId ? (
                <span
                  className="shrink-0 text-xs text-[color:var(--text-muted)]"
                  title="You can't change your own admin access or permissions here — ask another admin, or edit the database directly."
                >
                  (you)
                </span>
              ) : (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(editingId === a.userId ? null : a.userId);
                      setEditScopes(a.scopes);
                    }}
                    className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-primary)]"
                  >
                    {editingId === a.userId ? "Cancel" : "Edit permissions"}
                  </button>
                  <button type="button" onClick={() => handleRevoke(a.userId)} className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--state-danger)]">
                    Revoke
                  </button>
                </div>
              )}
            </div>
            {editingId === a.userId && a.userId !== selfId && (
              <div className="mt-2 border-t border-[color:var(--border-subtle)] pt-2">
                <ScopeCheckboxes selected={editScopes} onChange={setEditScopes} />
                <button
                  type="button"
                  onClick={() => handleSaveScopes(a.userId)}
                  className="mt-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium"
                >
                  Save permissions
                </button>
              </div>
            )}
          </div>
        ))}
        {admins.length === 0 && !error && <p className="text-sm text-[color:var(--text-muted)]">No other admins found.</p>}
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
