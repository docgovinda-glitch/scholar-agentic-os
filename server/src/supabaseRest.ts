/**
 * Generic server-side client for Supabase's Data API (PostgREST) — the same
 * HTTPS-to-PostgREST pattern src/services/store/restProjectStore.ts
 * established for project persistence, generalized so the AI Engine's dozen
 * new tables don't each hand-roll fetch/timeout/error-parsing logic.
 *
 * SECURITY: this client always authenticates with the service-role key,
 * which bypasses Row Level Security. It must only ever be imported from
 * server/ — never from src/desk or any browser-reachable module. Every table
 * it touches denies `anon`/`authenticated` in its own RLS policy (see
 * supabase/schema_ai_engine.sql), so ownership/authorization checks made
 * here in server code are the only thing standing between a request and the
 * whole table — callers must check req.user.id (or admin status) themselves
 * before calling in on a user's behalf.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 10_000;

export interface SupabaseRestConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: FetchLike;
}

export class SupabaseRestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "SupabaseRestError";
  }
}

export function getSupabaseRestConfig(): SupabaseRestConfig | null {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

/**
 * A thin per-table client. `request()` is exposed too, for the rare call
 * (e.g. `Prefer: count=exact`, cross-table `select` embeds) a per-table
 * method doesn't cover.
 */
export class SupabaseTable<Row extends Record<string, unknown>> {
  private base: string;
  private doFetch: FetchLike;

  constructor(
    private config: SupabaseRestConfig,
    private table: string
  ) {
    this.base = `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${table}`;
    this.doFetch = config.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.doFetch(`${this.base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: this.config.serviceRoleKey,
          Authorization: `Bearer ${this.config.serviceRoleKey}`,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string> | undefined),
        },
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new SupabaseRestError(res.status, `${this.table} ${res.status}: ${detail.slice(0, 300)}`);
      }

      const text = await res.text();
      if (text.length === 0) return null;
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /** `filter` is a raw PostgREST query string, e.g. "user_id=eq.<id>&limit=1". No leading "?". */
  async select(filter = ""): Promise<Row[]> {
    const rows = (await this.request(filter ? `?${filter}` : "")) as Row[] | null;
    return rows ?? [];
  }

  async selectOne(filter: string): Promise<Row | undefined> {
    const rows = await this.select(`${filter}&limit=1`);
    return rows[0];
  }

  async insert(row: Partial<Row> | Partial<Row>[]): Promise<void> {
    await this.request("", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  }

  /**
   * Upsert. `onConflict` names the unique column(s) PostgREST resolves
   * against, e.g. "provider_id,label"; omit it only when the table's PRIMARY
   * KEY is the intended conflict target AND the caller supplies that key.
   *
   * A row carrying a freshly generated primary key can never collide with an
   * existing one, so an upsert without `onConflict` over such a row is
   * always a plain INSERT — silently, with no error to notice. Either send
   * the key you mean to match on, or name a different conflict target here.
   */
  async upsert(row: Partial<Row> | Partial<Row>[], onConflict?: string): Promise<void> {
    await this.request(onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
  }

  async update(filter: string, patch: Partial<Row>): Promise<void> {
    await this.request(`?${filter}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  }

  async delete(filter: string): Promise<void> {
    await this.request(`?${filter}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}
