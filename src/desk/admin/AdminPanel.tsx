import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import {
  getAdminDashboard,
  getAdminProviders,
  setProviderEnabled,
  getPremiumSubscribers,
  type PremiumSubscriber,
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
  type UsageSummary,
  getResources,
  createResource,
  updateResource,
  deleteResource,
  getPlanResources,
  setPlanResources,
  type AiResource,
  getPremiumRequests,
  approvePremiumRequest,
  declinePremiumRequest,
  type PremiumRequestRow,
  type PlatformBudget,
  type Opportunity,
  type AuditLogEntry,
  type AdminRosterEntry,
  type UserSearchResult,
} from "../aiAccess/aiAccessApi";

type Tab = "dashboard" | "providers" | "resources" | "premium" | "usage" | "budget" | "opportunities" | "users" | "admins" | "audit";

const TABS: Array<{ id: Tab; label: string; requiredScope?: Scope }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "providers", label: "Providers", requiredScope: "manage_providers" },
  { id: "resources", label: "AI Router", requiredScope: "manage_providers" },
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
        {tab === "resources" && canSee("resources") && <ResourcesTab />}
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
      <p className="text-xs text-[color:var(--text-muted)]">
        Whether Scholar can talk to this provider at all. What Premium subscribers may use is set separately, per plan, under{" "}
        <strong className="font-semibold text-[color:var(--text-secondary)]">AI Router</strong>: a plan grants specific AI
        resources, so storing a platform key never by itself starts spending it.
      </p>
      {providers.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-2.5">
          <div className="min-w-0">
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

/** The roster of who actually holds Premium — read from the same table the router enforces against. */
function PremiumSubscribersList() {
  const [subs, setSubs] = useState<PremiumSubscriber[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPremiumSubscribers().then(setSubs).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <section className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4">
      <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Premium subscribers ({subs.length})</h3>
      <ErrorNotice error={error} />
      {subs.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">Nobody currently holds Premium.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {subs.map((s) => (
            <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-[color:var(--text-primary)]">
                  {s.fullName || s.username || s.userId}
                  {!s.currentlyActive && (
                    <span className="ml-2 text-xs font-medium text-[color:var(--state-warning)]">expired</span>
                  )}
                  {s.currentlyActive && s.expiringSoon && (
                    <span className="ml-2 text-xs font-medium text-[color:var(--state-warning)]">expiring soon</span>
                  )}
                </p>
                <p className="text-xs text-[color:var(--text-muted)]">
                  {s.planId ?? "no plan"} · {s.expiry ? `expires ${new Date(s.expiry).toLocaleDateString()}` : "no expiry"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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

      {/* Who currently holds Premium. Granting/revoking below works by user id
          and always did; without this list there was no way to see the result,
          or to answer "who is subscribed" at all. */}
      <PremiumRequestsQueue />
      <PremiumSubscribersList />

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
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsage().then(setData).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      <p className="text-xs text-[color:var(--text-muted)]">
        Aggregate figures only. This deliberately shows no per-request history for any individual — an administrator can see
        what the platform spends and what each subscriber owes, not what a person asked for or when. Only platform-paid
        (Premium) requests are recorded at all; a user's own local, free or BYOK use is never logged.
      </p>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Premium requests" value={String(data.totalRequests)} />
            <Stat label="Credits charged" value={String(data.totalCredits)} />
          </div>

          <Card>
            <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">By resource</h2>
            {data.byResource.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">No Premium usage yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.byResource.map((r) => (
                  <li key={`${r.providerId}-${r.modelId}`} className="flex justify-between text-sm text-[color:var(--text-secondary)]">
                    <span>
                      {r.providerId}
                      {r.modelId ? ` \u00b7 ${r.modelId}` : ""}
                    </span>
                    <span>
                      {r.requests} req \u00b7 {r.credits} credits
                      {r.errors > 0 ? ` \u00b7 ${r.errors} failed` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Billing totals</h2>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">Credits charged per subscriber, for invoicing. No request detail.</p>
            {data.billing.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">Nothing charged yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {data.billing.map((b) => (
                  <li key={b.userId} className="flex justify-between text-sm text-[color:var(--text-secondary)]">
                    <span className="truncate">{b.userId}</span>
                    <span>{b.credits} credits</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * ADMIN AI ROUTER — the platform's own resource pool.
 *
 * Entirely separate from any user's router: nothing here reads or can read
 * which providers a user configured. These are the administrator's own
 * resources, and which of them each Premium plan may draw on.
 */
function ResourcesTab() {
  const [resources, setResources] = useState<AiResource[]>([]);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [granted, setGranted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [accessType, setAccessType] = useState<"local" | "free" | "paid" | "byok">("paid");

  function load() {
    getResources().then(setResources).catch((e) => setError((e as Error).message));
    getAdminProviders().then(setProviders).catch(() => {});
    getPremiumPlans().then(setPlans).catch(() => {});
  }
  useEffect(load, []);

  useEffect(() => {
    if (!planId) return setGranted([]);
    getPlanResources(planId).then(setGranted).catch(() => setGranted([]));
  }, [planId]);

  async function add() {
    if (!label.trim() || !providerId) return;
    try {
      await createResource({ label: label.trim(), providerId, modelId: modelId.trim() || undefined, accessType });
      setLabel("");
      setModelId("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleGrant(resourceId: string) {
    const next = granted.includes(resourceId) ? granted.filter((r) => r !== resourceId) : [...granted, resourceId];
    setGranted(next);
    await setPlanResources(planId, next).catch((e) => setError((e as Error).message));
  }

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      <p className="text-xs text-[color:var(--text-muted)]">
        An <strong className="font-semibold text-[color:var(--text-secondary)]">AI resource</strong> is one provider+model
        pairing the platform owns. Premium plans grant resources, and subscribers see only the resource's{" "}
        <strong className="font-semibold text-[color:var(--text-secondary)]">label</strong> — so you can re-point a
        capability at a different provider without any subscriber reconfiguring anything.
      </p>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Add a resource</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label users see, e.g. Advanced writing"
            className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          >
            <option value="">Choose a provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="Model id (optional)"
            className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          />
          <select
            value={accessType}
            onChange={(e) => setAccessType(e.target.value as typeof accessType)}
            className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
          >
            <option value="local">Local — costs the platform nothing</option>
            <option value="free">Free tier</option>
            <option value="paid">Paid — spends the platform credential</option>
            <option value="byok">Admin-owned key</option>
          </select>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!label.trim() || !providerId}
          className="mt-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          Add resource
        </button>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Resource pool ({resources.length})</h2>
        {resources.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">No resources yet. Premium cannot run until at least one exists.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {resources.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[color:var(--text-primary)]">{r.label}</p>
                  <p className="text-xs text-[color:var(--text-muted)]">
                    {r.provider_id}
                    {r.model_id ? ` \u00b7 ${r.model_id}` : ""} \u00b7 {r.access_type}
                    {r.enabled ? "" : " \u00b7 disabled"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => updateResource(r.id, { enabled: !r.enabled }).then(load)}
                    className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
                  >
                    {r.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteResource(r.id).then(load)}
                    className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[color:var(--state-danger)] hover:bg-[color:var(--surface-hover)]"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Grant resources to a plan</h2>
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2.5 py-1.5 text-sm"
        >
          <option value="">Choose a plan…</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {planId && (
          <ul className="mt-2 space-y-1">
            {resources.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
                  <input type="checkbox" checked={granted.includes(r.id)} onChange={() => toggleGrant(r.id)} />
                  {r.label}
                </label>
              </li>
            ))}
            {resources.length === 0 && <li className="text-sm text-[color:var(--text-muted)]">Add a resource first.</li>}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Pending Premium requests, approved or declined in one action. */
function PremiumRequestsQueue() {
  const [rows, setRows] = useState<PremiumRequestRow[]>([]);
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  /**
   * Chosen plan per request, held in state rather than read back off the DOM.
   * The previous version used an uncontrolled <select defaultValue> and then
   * document.getElementById to read it at click time: requests and plans load
   * from two independent promises, so when plans arrived second the select
   * mounted with no options, defaultValue never reapplied, and Approve either
   * silently returned or sent whatever the browser had defaulted to.
   */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    getPremiumRequests("pending").then(setRows).catch((e) => setError((e as Error).message));
    getPremiumPlans().then(setPlans).catch(() => {});
  }
  useEffect(load, []);

  /** The plan this row will be approved with: the admin's pick, else what the user asked for, else the first plan. */
  const planFor = (r: PremiumRequestRow) => chosen[r.id] ?? r.requestedPlanId ?? plans[0]?.id ?? "";

  async function approve(r: PremiumRequestRow) {
    const planId = planFor(r);
    if (!planId) {
      setError("Create a Premium plan before approving requests.");
      return;
    }
    setBusy(r.id);
    setError(null);
    try {
      await approvePremiumRequest(r.id, planId);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function decline(r: PremiumRequestRow) {
    setBusy(r.id);
    try {
      await declinePremiumRequest(r.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Premium requests ({rows.length})</h2>
      <ErrorNotice error={error} />
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">No requests waiting.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-2">
              <p className="text-sm font-medium text-[color:var(--text-primary)]">{r.fullName || r.username || r.userId}</p>
              {r.note && <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">“{r.note}”</p>}
              <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                Asked for {r.requestedPlanId ?? "no specific plan"} on {new Date(r.createdAt).toLocaleDateString()}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`plan-${r.id}`}>
                  Plan to grant
                </label>
                <select
                  id={`plan-${r.id}`}
                  value={planFor(r)}
                  onChange={(e) => setChosen((c) => ({ ...c, [r.id]: e.target.value }))}
                  disabled={plans.length === 0}
                  className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2 py-1 text-xs"
                >
                  {plans.length === 0 && <option value="">No plans configured</option>}
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void approve(r)}
                  disabled={busy === r.id}
                  className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] px-3 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {busy === r.id ? "Working…" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => void decline(r)}
                  disabled={busy === r.id}
                  className="rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium text-[color:var(--state-danger)] disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
