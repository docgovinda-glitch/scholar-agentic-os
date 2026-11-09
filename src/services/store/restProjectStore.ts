/**
 * ProjectStore over Supabase's Data API (PostgREST), reached by HTTPS.
 *
 * An alternative backend to pgProjectStore.ts, not a replacement — both
 * implement the same ProjectStore contract and projectStore.ts picks one at
 * startup. This exists because the direct-Postgres path accumulated four
 * independent failure modes, each of which cost a production outage:
 *
 *   1. `db.<ref>.supabase.co` publishes no A record — it is IPv6-only, and
 *      Render's outbound network is IPv4-only, so the documented connection
 *      string cannot resolve there at all.
 *   2. The IPv4 pooler works around (1) but needs the right region, port, and
 *      the `postgres.<ref>` tenant-qualified username.
 *   3. Supabase's certificate chains to its own root, so TLS verification
 *      fails without pinning that CA (SELF_SIGNED_CERT_IN_CHAIN).
 *   4. It needs the database password — a credential distinct from every
 *      other Supabase key, easy to reset without the change taking effect.
 *
 * This path has none of those. It is HTTPS to the same hostname the app
 * already uses, authenticated with the service-role key already required for
 * verifying tokens. One credential, one protocol, one hostname.
 *
 * SECURITY. The service-role key bypasses Row Level Security, so this module
 * must only ever run server-side — it is imported by server/routes/project.ts,
 * never by anything under src/desk or src/components. The table's own RLS
 * (supabase/schema_store.sql) denies `anon` and `authenticated` outright, so
 * the browser cannot reach these rows even though PostgREST publishes the
 * endpoint. Ownership is still enforced in the route layer, which is the only
 * place that can tell "not yours" from "not found".
 *
 * TRADE-OFF. PostgREST is less expressive than SQL and has no multi-statement
 * transactions. That is acceptable here and nowhere near a general rule: this
 * store's whole surface is single-row reads, single-row upserts, and one
 * owner-scoped list. A store that needed to write two tables atomically would
 * have to stay on the direct connection.
 */

import { initialProjectGateState } from "../../domain/project/gates";
import { normalizeOutputTypeId } from "../../app/atlas/legacyIds.ts";
import { emptyGraph } from "../../domain/claim/graph";
import { emptyLedger } from "../../domain/evidence/types";
import { emptyPeerReviewHistory } from "../../domain/review/types";
import { generateProjectId } from "../../app/conductor/projectStore";
import type { ProjectRecord, ProjectStore } from "./types";

/** The subset of `fetch` this store uses, so tests can supply their own. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const TABLE = "projects";
const REQUEST_TIMEOUT_MS = 10_000;

/** Column names, kept beside the row mapper so the two cannot drift apart. */
interface ProjectRow {
  project_id: string;
  version?: number;
  owner_id: string;
  output_type_id: string;
  answers: ProjectRecord["answers"];
  authors: ProjectRecord["authors"];
  gates: ProjectRecord["gates"];
  document: ProjectRecord["document"] | null;
  rubric_report: ProjectRecord["rubricReport"] | null;
  claim_graph: ProjectRecord["claimGraph"];
  waivers: ProjectRecord["waivers"];
  submissions: ProjectRecord["submissions"];
  journal_requirements: ProjectRecord["journalRequirements"] | null;
  evidence_ledger: ProjectRecord["evidenceLedger"] | null;
  generation_job: ProjectRecord["generationJob"] | null;
  peer_review_history: ProjectRecord["peerReviewHistory"] | null;
  cover_letter: ProjectRecord["coverLetter"] | null;
  anonymization_report: ProjectRecord["anonymizationReport"] | null;
  anonymized_document: ProjectRecord["anonymizedDocument"] | null;
  source_count_override: ProjectRecord["sourceCountOverride"] | null;
}

function rowToRecord(row: ProjectRow): ProjectRecord {
  return {
    projectId: row.project_id,
    version: row.version ?? 1,
    ownerId: row.owner_id,
    outputTypeId: normalizeOutputTypeId(row.output_type_id) as string,
    answers: row.answers as ProjectRecord["answers"],
    authors: (row.authors as ProjectRecord["authors"] | null) ?? [],
    gates: row.gates as ProjectRecord["gates"],
    // PostgREST returns SQL NULL as JSON null; ProjectRecord uses undefined.
    document: row.document ?? undefined,
    rubricReport: row.rubric_report ?? undefined,
    claimGraph: row.claim_graph,
    waivers: row.waivers,
    // Rows written before this column existed have it as SQL NULL.
    submissions: row.submissions ?? [],
    journalRequirements: row.journal_requirements ?? undefined,
    // Rows written before this column existed have it as SQL NULL.
    evidenceLedger: row.evidence_ledger ?? emptyLedger(),
    generationJob: row.generation_job ?? undefined,
    peerReviewHistory: row.peer_review_history ?? emptyPeerReviewHistory(),
    coverLetter: row.cover_letter ?? undefined,
    anonymizationReport: row.anonymization_report ?? undefined,
    anonymizedDocument: row.anonymized_document ?? undefined,
    sourceCountOverride: row.source_count_override ?? undefined,
  };
}

function recordToRow(record: ProjectRecord): ProjectRow {
  return {
    project_id: record.projectId,
    version: record.version ?? 1,
    owner_id: record.ownerId,
    output_type_id: record.outputTypeId,
    answers: record.answers,
    authors: record.authors || [],
    gates: record.gates,
    document: record.document ?? null,
    rubric_report: record.rubricReport ?? null,
    claim_graph: record.claimGraph,
    waivers: record.waivers,
    submissions: record.submissions,
    journal_requirements: record.journalRequirements ?? null,
    evidence_ledger: record.evidenceLedger,
    generation_job: record.generationJob ?? null,
    peer_review_history: record.peerReviewHistory,
    cover_letter: record.coverLetter ?? null,
    anonymization_report: record.anonymizationReport ?? null,
    anonymized_document: record.anonymizedDocument ?? null,
    source_count_override: record.sourceCountOverride ?? null,
  };
}

export interface RestStoreConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

export function createRestProjectStore(config: RestStoreConfig): ProjectStore {
  const base = `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/${TABLE}`;
  const doFetch = config.fetchImpl ?? ((url, init) => fetch(url, init));

  async function request(url: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string> | undefined),
        },
      });

      if (!res.ok) {
        // PostgREST reports failures as JSON with a `message`; surface it
        // rather than a bare status, so a schema mismatch or an RLS denial
        // says which it was.
        const detail = await res.text().catch(() => "");
        throw new Error(`Supabase Data API ${res.status}: ${detail.slice(0, 300)}`);
      }

      // Writes sent with `Prefer: return=minimal` come back with an empty
      // body — and PostgREST answers 201, not only 204, so keying off the
      // status alone is not enough: `res.json()` on an empty body throws
      // "Unexpected end of JSON input", which surfaced as a 500 on a request
      // that had in fact succeeded. Decide on the body itself.
      const text = await res.text();
      if (text.length === 0) return null;
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async create(outputTypeId: string, ownerId: string): Promise<ProjectRecord> {
      // Bound once: initialProjectGateState keys off the project's own id, so
      // calling generateProjectId() inline in both places would silently give
      // the gate state a different id than the record it belongs to.
      const projectId = generateProjectId();
      const record: ProjectRecord = {
        projectId,
        version: 1,
        ownerId,
        outputTypeId: normalizeOutputTypeId(outputTypeId) as string,
        answers: {},
        authors: [],
        gates: initialProjectGateState(projectId),
        claimGraph: emptyGraph(),
        waivers: {},
        submissions: [],
        evidenceLedger: emptyLedger(),
        peerReviewHistory: emptyPeerReviewHistory(),
      };

      await request(base, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(recordToRow(record)),
      });
      return record;
    },

    async get(projectId: string): Promise<ProjectRecord | undefined> {
      const rows = (await request(
        `${base}?project_id=eq.${encodeURIComponent(projectId)}&limit=1`
      )) as ProjectRow[];
      return rows?.[0] ? rowToRecord(rows[0]) : undefined;
    },

    async save(record: ProjectRecord): Promise<ProjectRecord> {
      // Upsert. `resolution=merge-duplicates` makes POST behave as
      // ON CONFLICT DO UPDATE against the primary key, matching the direct-SQL
      // store's semantics — save() is called both for new and existing rows.
      await request(base, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ...recordToRow(record), updated_at: new Date().toISOString() }),
      });
      return record;
    },

    async listByOwner(ownerId: string): Promise<ProjectRecord[]> {
      // Owner scoping is in the query, not applied after fetching — there is
      // no request here that can return another user's rows.
      const rows = (await request(
        `${base}?owner_id=eq.${encodeURIComponent(ownerId)}&order=updated_at.desc`
      )) as ProjectRow[];
      return (rows ?? []).map(rowToRecord);
    },

    async delete(projectId: string): Promise<void> {
      await request(`${base}?project_id=eq.${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      });
    },
  };
}
