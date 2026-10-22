/**
 * Postgres-backed implementation of ProjectStore.
 *
 * Persists project records with answers, gates, document, rubric reports, and
 * claim graphs stored as JSONB.
 *
 * Takes a minimal query interface (`PgQueryable`) rather than depending on
 * `pg.Pool` directly, allowing tests to inject mocks without a live database.
 */

import { Pool } from "pg";
import { initialProjectGateState } from "../../domain/project/gates";
import { emptyGraph } from "../../domain/claim/graph";
import { emptyLedger } from "../../domain/evidence/types";
import { emptyPeerReviewHistory } from "../../domain/review/types";
import { generateProjectId } from "../../app/conductor/projectStore";
import { SUPABASE_ROOT_CA } from "./supabaseRootCa";
import { OptimisticLockError } from "./types";
import type { ProjectRecord, ProjectStore } from "./types";

export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Builds the real `pg.Pool` used at runtime. Reads DATABASE_URL directly
 * (rather than accepting it as a parameter) so every call site gets the
 * same pool — node-postgres pools are meant to be long-lived and shared,
 * not created per request.
 */
export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Postgres-backed persistence requires it — see " +
        ".env.example and docs/DEVELOPMENT.md. " +
        "Without it, the server falls back to the in-memory store."
    );
  }
  const pool = new Pool({
    connectionString,
    // `rejectUnauthorized: true` alone was not enough and broke production:
    // Supabase's certificate chains to its own root, which Node does not
    // trust by default, so every connection failed with
    // SELF_SIGNED_CERT_IN_CHAIN. Supplying that root keeps verification ON —
    // the common fix of `rejectUnauthorized: false` would have restored the
    // connection by no longer checking who answers it, on the link carrying
    // every user's documents.
    ssl: connectionString.includes("localhost")
      ? undefined
      : { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true },
  });

  // node-postgres emits 'error' on idle clients — a dropped connection, a
  // failed TLS handshake, a database restart. With no listener, Node treats it
  // as an unhandled error event and terminates the process: one transient
  // database problem took the entire web service down, returning 502 for every
  // route including those that never touch the database.
  //
  // Logged and swallowed here. The pool discards the bad client and makes a new
  // one on the next query; a genuinely unreachable database then surfaces as a
  // failed request, which the route layer already handles, rather than as a
  // crash.
  pool.on("error", (err) => {
    console.error("pg pool: idle client error (connection discarded, server staying up):", err.message);
  });

  return pool;
}

function rowToRecord(row: Record<string, unknown>): ProjectRecord {
  const record: ProjectRecord = {
    projectId: row.project_id as string,
    version: (row.version as number) ?? 1,
    ownerId: row.owner_id as string,
    outputTypeId: row.output_type_id as string,
    answers: ((row.answers as Record<string, any>) || {}) as ProjectRecord["answers"],
    authors: (row.authors as ProjectRecord["authors"] | null) ?? [],
    gates: row.gates as ProjectRecord["gates"],
    document: (row.document as ProjectRecord["document"] | null) ?? undefined,
    rubricReport: (row.rubric_report as ProjectRecord["rubricReport"] | null) ?? undefined,
    claimGraph: row.claim_graph as ProjectRecord["claimGraph"],
    waivers: row.waivers as ProjectRecord["waivers"],
    // Rows written before this column existed have it as SQL NULL.
    submissions: (row.submissions as ProjectRecord["submissions"] | null) ?? [],
    journalRequirements: (row.journal_requirements as ProjectRecord["journalRequirements"] | null) ?? undefined,
    // Rows written before this column existed have it as SQL NULL.
    evidenceLedger: (row.evidence_ledger as ProjectRecord["evidenceLedger"] | null) ?? emptyLedger(),
    generationJob: (row.generation_job as ProjectRecord["generationJob"] | null) ?? undefined,
    peerReviewHistory: (row.peer_review_history as ProjectRecord["peerReviewHistory"] | null) ?? emptyPeerReviewHistory(),
    coverLetter: (row.cover_letter as ProjectRecord["coverLetter"] | null) ?? undefined,
    anonymizationReport: (row.anonymization_report as ProjectRecord["anonymizationReport"] | null) ?? undefined,
    anonymizedDocument: (row.anonymized_document as ProjectRecord["anonymizedDocument"] | null) ?? undefined,
    sourceCountOverride: (row.source_count_override as ProjectRecord["sourceCountOverride"] | null) ?? undefined,
  };

  // Rehydrate normalized state
  const r = row as Record<string, any>;
  if (r._sources && Array.isArray(r._sources) && r._sources.length > 0) {
    record.answers.assignment_sources = r._sources;
  }
  if (r._uploaded_sources && Array.isArray(r._uploaded_sources) && r._uploaded_sources.length > 0) {
    record.answers.assignment_user_uploaded_sources = r._uploaded_sources;
  }
  if (r._evidence && Array.isArray(r._evidence) && r._evidence.length > 0) {
    record.answers.assignment_evidence_items = r._evidence;
  }

  return record;
}

export function createPgProjectStore(db: PgQueryable): ProjectStore {
  return {
    async create(outputTypeId: string, ownerId: string): Promise<ProjectRecord> {
      const projectId = generateProjectId();
      const record: ProjectRecord = {
        projectId,
        version: 1,
        ownerId,
        outputTypeId,
        answers: {},
        authors: [],
        gates: initialProjectGateState(projectId),
        claimGraph: emptyGraph(),
        waivers: {},
        submissions: [],
        evidenceLedger: emptyLedger(),
        peerReviewHistory: emptyPeerReviewHistory(),
      };
      await db.query(
        `insert into public.projects
           (project_id, version, owner_id, output_type_id, answers, authors, gates, document, rubric_report, claim_graph, waivers, submissions, journal_requirements, evidence_ledger, generation_job, peer_review_history, cover_letter, anonymization_report, anonymized_document, source_count_override)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          record.projectId,
          record.version,
          record.ownerId,
          record.outputTypeId,
          JSON.stringify(record.answers),
          JSON.stringify(record.authors),
          JSON.stringify(record.gates),
          JSON.stringify(record.claimGraph),
          JSON.stringify(record.waivers),
          JSON.stringify(record.submissions),
          JSON.stringify(record.evidenceLedger),
          JSON.stringify(record.peerReviewHistory),
        ]
      );
      return record;
    },

    async get(projectId: string): Promise<ProjectRecord | undefined> {
      const result = await db.query(
        `SELECT p.*,
                (SELECT coalesce(jsonb_agg(ps.metadata), '[]'::jsonb) FROM public.project_sources ps WHERE ps.project_id = p.project_id) as _sources,
                (SELECT coalesce(jsonb_agg(jsonb_build_object('id', pus.document_id, 'filename', pus.filename, 'status', pus.status)), '[]'::jsonb) FROM public.project_uploaded_sources pus WHERE pus.project_id = p.project_id) as _uploaded_sources,
                (SELECT coalesce(jsonb_agg(pe.metadata), '[]'::jsonb) FROM public.project_evidence pe WHERE pe.project_id = p.project_id) as _evidence
         FROM public.projects p
         WHERE p.project_id = $1`,
        [projectId]
      );
      const row = result.rows[0];
      return row ? rowToRecord(row) : undefined;
    },

    async save(record: ProjectRecord): Promise<ProjectRecord> {
      const nextVersion = record.version + 1;

      // Extract sources & evidence
      const answersToSave = { ...(record.answers || {}) };
      const sources = answersToSave.assignment_sources || [];
      const uploadedSources = answersToSave.assignment_user_uploaded_sources || answersToSave.userUploadedSources || [];
      const evidenceItems = answersToSave.assignment_evidence_items || [];

      // Remove from monolithic jsonb
      delete answersToSave.assignment_sources;
      delete answersToSave.assignment_user_uploaded_sources;
      delete answersToSave.userUploadedSources;
      delete answersToSave.assignment_evidence_items;

      const result = await db.query(
        `insert into public.projects
           (project_id, version, owner_id, output_type_id, answers, authors, gates, document, rubric_report, claim_graph, waivers, submissions, journal_requirements, evidence_ledger, generation_job, peer_review_history, cover_letter, anonymization_report, anonymized_document, source_count_override, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
         on conflict (project_id) do update set
           version = excluded.version,
           output_type_id = excluded.output_type_id,
           answers = excluded.answers,
           authors = excluded.authors,
           gates = excluded.gates,
           document = excluded.document,
           rubric_report = excluded.rubric_report,
           claim_graph = excluded.claim_graph,
           waivers = excluded.waivers,
           submissions = excluded.submissions,
           journal_requirements = excluded.journal_requirements,
           evidence_ledger = excluded.evidence_ledger,
           generation_job = excluded.generation_job,
           peer_review_history = excluded.peer_review_history,
           cover_letter = excluded.cover_letter,
           anonymization_report = excluded.anonymization_report,
           anonymized_document = excluded.anonymized_document,
           source_count_override = excluded.source_count_override,
           updated_at = now()
         where public.projects.version = $21
         returning project_id`,
        [
          record.projectId,
          nextVersion,
          record.ownerId,
          record.outputTypeId,
          JSON.stringify(answersToSave),
          JSON.stringify(record.authors || []),
          JSON.stringify(record.gates),
          record.document ? JSON.stringify(record.document) : null,
          record.rubricReport ? JSON.stringify(record.rubricReport) : null,
          JSON.stringify(record.claimGraph),
          JSON.stringify(record.waivers),
          JSON.stringify(record.submissions),
          record.journalRequirements ? JSON.stringify(record.journalRequirements) : null,
          JSON.stringify(record.evidenceLedger),
          record.generationJob ? JSON.stringify(record.generationJob) : null,
          JSON.stringify(record.peerReviewHistory),
          record.coverLetter ? JSON.stringify(record.coverLetter) : null,
          record.anonymizationReport ? JSON.stringify(record.anonymizationReport) : null,
          record.anonymizedDocument ? JSON.stringify(record.anonymizedDocument) : null,
          record.sourceCountOverride ? JSON.stringify(record.sourceCountOverride) : null,
          record.version,
        ]
      );
      if (!result.rows || result.rows.length === 0) {
        throw new OptimisticLockError(record.projectId);
      }
      record.version = nextVersion;

      // Update side tables safely after main record is committed
      if (sources.length > 0) {
        await db.query(`DELETE FROM public.project_sources WHERE project_id = $1`, [record.projectId]);
        const values = [];
        const params: any[] = [record.projectId];
        let i = 2;
        for (const s of sources) {
          values.push(`($1, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
          params.push(s.id, s.title, JSON.stringify(s.authors || []), s.year || "", s.abstract || "", s.url || "", s.doi || "", s.status || "kept", s.isExcluded || false, JSON.stringify(s));
        }
        await db.query(`INSERT INTO public.project_sources (project_id, source_id, title, authors, year, abstract, url, doi, status, is_excluded, metadata) VALUES ${values.join(", ")}`, params);
      } else {
        await db.query(`DELETE FROM public.project_sources WHERE project_id = $1`, [record.projectId]);
      }

      if (uploadedSources.length > 0) {
        await db.query(`DELETE FROM public.project_uploaded_sources WHERE project_id = $1`, [record.projectId]);
        const values = [];
        const params: any[] = [record.projectId];
        let i = 2;
        for (const s of uploadedSources) {
          values.push(`($1, $${i++}, $${i++}, $${i++})`);
          params.push(s.id, s.filename || s.title || "Document", s.status || "kept");
        }
        await db.query(`INSERT INTO public.project_uploaded_sources (project_id, document_id, filename, status) VALUES ${values.join(", ")}`, params);
      } else {
        await db.query(`DELETE FROM public.project_uploaded_sources WHERE project_id = $1`, [record.projectId]);
      }

      if (evidenceItems.length > 0) {
        await db.query(`DELETE FROM public.project_evidence WHERE project_id = $1`, [record.projectId]);
        const values = [];
        const params: any[] = [record.projectId];
        let i = 2;
        for (const e of evidenceItems) {
          values.push(`($1, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
          params.push(e.id, e.sourceId || "", e.evidenceSnippet || e.claim || "", e.status || "approved", JSON.stringify(e));
        }
        await db.query(`INSERT INTO public.project_evidence (project_id, evidence_id, source_id, text, status, metadata) VALUES ${values.join(", ")}`, params);
      } else {
        await db.query(`DELETE FROM public.project_evidence WHERE project_id = $1`, [record.projectId]);
      }

      return record;
    },

    async listByOwner(ownerId: string): Promise<ProjectRecord[]> {
      const result = await db.query(
        `SELECT p.*,
                (SELECT coalesce(jsonb_agg(ps.metadata), '[]'::jsonb) FROM public.project_sources ps WHERE ps.project_id = p.project_id) as _sources,
                (SELECT coalesce(jsonb_agg(jsonb_build_object('id', pus.document_id, 'filename', pus.filename, 'status', pus.status)), '[]'::jsonb) FROM public.project_uploaded_sources pus WHERE pus.project_id = p.project_id) as _uploaded_sources,
                (SELECT coalesce(jsonb_agg(pe.metadata), '[]'::jsonb) FROM public.project_evidence pe WHERE pe.project_id = p.project_id) as _evidence
         FROM public.projects p
         WHERE p.owner_id = $1 
         ORDER BY p.updated_at DESC`,
        [ownerId]
      );
      return result.rows.map(rowToRecord);
    },

    async delete(projectId: string): Promise<void> {
      await db.query(`delete from public.projects where project_id = $1`, [projectId]);
    },
  };
}
