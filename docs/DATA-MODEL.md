# Data Model

Tables, storage and state shapes. The authority is the SQL in `supabase/` (`schema.sql`, `schema_ai_engine.sql`, `schema_store.sql`, `schema_user_settings.sql`, and `migrations/`, applied in timestamp order). New changes go in a new timestamped migration; never edit an applied one. `src/types/database.types.ts` holds generated client types.

## 1. Access model

- The server reaches Postgres through the Supabase Data API over HTTPS with the service-role key (`server/src/supabaseRest.ts`), or directly through `DATABASE_URL` as an optional fallback.
- RLS is enabled on every table. Server-owned tables (for example `projects`) have **no** policies, so `anon` and `authenticated` can do nothing and only `service_role` can read or write; ownership is checked in application code (`loadOwnedProject` in `server/routes/project.ts`).
- A few user-facing tables (`profiles`, `user_vaults`, `user_vault_items`, `user_cloud_integrations`, `api_credentials`, `project_files`, `project_activity`, `provider_health`, `premium_plans`, `ai_providers`, `ai_models`) also have policies; read each migration for the exact rules. Migration `20261028000000_hotfix2_db_storage_rpc_lockdown.sql` enabled RLS on three agentic tables, made all buckets private and restricted the account-lookup functions to `service_role`.
- Database functions: `deduct_credits`, `grant_credits` (atomic credit accounting), `match_project_evidence` (pgvector similarity over `project_evidence.embedding`, 768 dimensions, HNSW index), `email_for_identifier`, `email_for_username`, `email_for_phone_e164`, `check_email_available`, `check_username_available`, `check_phone_available`, `submit_id_document`, `handle_new_user`, `handle_project_delete_cascade`, `enforce_account_status_admin_only`, `update_modified_column`.

## 2. Tables by area

"Used" means application code under `server/`, `src/` or `scripts/` references the table; "schema only" means it is defined but no code reads or writes it.

### 2.1 Accounts

| Table | Columns | Used |
| :--- | :--- | :--- |
| `profiles` | `id`, `username`, `full_name`, `phone`, `phone_country_code`, `phone_e164` (generated), `affiliation`, `user_type`, `education_level`, `account_status`, `model_preferences`, `created_at`, `updated_at` | Yes |
| `api_credentials` | `user_id`, `provider`, `encrypted_api_key`, `api_key_hash`, `updated_at` | Yes |
| `user_ai_settings` | `user_id`, `provider`, `preferences`, `updated_at` (default provider and chosen models; no secrets; written by the browser, read by the server so any device uses the person's choices; migration `20261109120000_user_ai_settings.sql`) | Yes |
| `security_credential_reset_notices` | `user_id`, `had_api_credentials`, `had_cloud_integrations`, `created_at`, `dismissed_at` | Yes |
| `admin_users` | `user_id`, `granted_by`, `granted_at`, `note`, `scopes` | Yes |

### 2.2 Projects

| Table | Columns | Used |
| :--- | :--- | :--- |
| `projects` | `project_id` (text PK), `owner_id` (uuid, no FK to `auth.users` by design), `output_type_id`, `answers`, `gates`, `document`, `rubric_report`, `claim_graph`, `waivers`, `authors`, `submissions`, `journal_requirements`, `evidence_ledger`, `generation_job`, `peer_review_history`, `cover_letter`, `anonymization_report`, `anonymized_document`, `source_count_override`, `assignment_state`, `version`, `created_at`, `updated_at` (JSONB columns except ids, counts and timestamps) | Yes |
| `assignment_projects` | `project_id`, `current_phase` (check: `understand`, `sources`, `drafting`, `submission`), `brief`, `sources`, `drafting`, `submission`, `created_at`, `updated_at` | Schema only |
| `project_answers` | `project_id`, `key`, `value` | Schema only |
| `project_uploaded_sources` | `id`, `project_id`, `document_id`, `filename`, `status`, `created_at`, `updated_at` | Schema only |
| `project_activity` | `id`, `project_id`, `event_type`, `description`, `metadata`, `created_at` | Yes |
| `project_files` | `id`, `project_id`, `filename`, `storage_path`, `size_bytes`, `mime_type`, `uploaded_at` | Yes |

`projects` mirrors the server's `ProjectRecord` (`src/app/conductor/projectStore.ts`): intake `answers`, the eight gates (`gates`), the canonical `document`, the latest `rubric_report`, the claim-evidence graph (`claim_graph`), rubric `waivers`, journal `submissions` and `journal_requirements`, and the evidence ledger. Deleting a project cascades through `handle_project_delete_cascade` (`20260924180000_project_cascade_delete.sql`).

### 2.3 Research pipeline (journal)

| Table | Columns | Used |
| :--- | :--- | :--- |
| `project_sources` | `id`, `project_id`, `source_id`, `title`, `authors`, `year`, `abstract`, `url`, `doi`, `status`, `is_excluded`, `metadata`, `relevance_score`, `themes`, `created_at`, `updated_at` | Yes |
| `project_evidence` | `id`, `project_id`, `evidence_id`, `source_id`, `text`, `status`, `metadata`, `embedding` (vector 768), `created_at`, `updated_at` | Yes |
| `project_evidence_items` | `id`, `project_id`, `evidence_id`, `source_id`, `state`, `quote`, `locator`, `proposed_claim_id`, `history`, `created_at`, `updated_at` | Yes |
| `project_claims` | `id`, `project_id`, `claim_id`, `text`, `draft_span_id`, `status`, `unsupported_reason`, `unsupported_actor`, `created_at`, `updated_at` | Yes |
| `project_claim_bindings` | `id`, `project_id`, `binding_id`, `claim_id`, `strength`, `rationale`, `created_at`, `updated_at` | Yes |
| `project_claim_binding_evidence` | `id`, `project_id`, `binding_id`, `source_id`, `quote`, `locator`, `created_at` | Schema only |
| `project_research_gaps` | `id`, `project_id`, `gap_type`, `description`, `importance_score`, `status`, `created_at`, `updated_at` | Schema only |
| `project_titles` | `id`, `project_id`, `title_text`, `subtitle_text`, `rationale`, `status`, `created_at`, `updated_at` | Schema only |
| `project_journal_candidates` | `id`, `project_id`, `journal_name`, `publisher`, `impact_factor`, `match_score`, `rationale`, `status`, `created_at`, `updated_at` | Schema only |
| `manuscript_sections` | `id`, `project_id`, `section_name`, `content`, `status`, `word_count`, `created_at`, `updated_at` | Yes |
| `manuscript_versions` | `id`, `project_id`, `section_name`, `content`, `created_at` | Yes |
| `peer_review_critiques` | `id`, `project_id`, `lens`, `feedback`, `severity`, `created_at`, `waived` | Yes |

The relational claim, evidence and source tables are written by `server/src/syncRelational.ts` alongside the JSONB graph in `projects`.

### 2.4 Presentations

`presentation_decks`: `id`, `user_id`, `project_id`, `title`, `topic`, `framework`, `theme_id`, `custom_theme`, `slides`, `source_module`, `created_at`, `updated_at` (`server/routes/presentations.ts`; also probed by `/api/health?deep=1`).

### 2.5 Vault

| Table | Columns | Used |
| :--- | :--- | :--- |
| `user_vaults` | `user_id`, `label`, `storage_mode` (`local` or `synced`), `created_at`, `updated_at` | Yes |
| `user_vault_items` | `id`, `user_id`, `source_type`, `title`, `filename`, `mime_type`, `external_reference`, `storage_reference`, `content_text`, `canonical_reference`, `citation`, `citation_status`, `authors`, `year`, `journal`, `metadata`, `created_at`, `updated_at` (collections, tags and retraction status are kept in `metadata` and indexed by `20260907000001_vault_collections_tags_retraction.sql`) | Yes |
| `user_cloud_integrations` | `id`, `user_id`, `provider`, `account_email`, `account_name`, `connected_at`, `access_token`, `refresh_token`, `metadata`, `created_at`, `updated_at` | Yes |

### 2.6 AI engine (`schema_ai_engine.sql` and later migrations)

| Table | Purpose |
| :--- | :--- |
| `ai_providers`, `ai_models` | Registry mirrored from the code catalogs by `npm run seed:ai-registry`; `ai_providers` also has `premium_enabled`, `premium_models` |
| `user_ai_connections` | A user's connected sources (`provider_id`, `tier`, `status`, `storage_mode`, `models_detected`) |
| `user_provider_keys` | Saved user keys: `encrypted_cek`, `encrypted_key`, `masked_preview` |
| `hardware_profiles` | Detected device specs for local-model suggestions |
| `ai_resources`, `plan_resources` | Platform resource pool and plan grants (two-router architecture) |
| `premium_plans`, `premium_requests`, `user_entitlements`, `user_quota_overrides` | Plans (credits per month, week, day, per task, concurrency), requests, entitlements, overrides |
| `credit_balances`, `credit_ledger`, `ai_usage_ledger` | Credit balances with daily, weekly and monthly usage, signed credit ledger, per-request usage records |
| `provider_health` | Last status, latency and error per provider |
| `platform_provider_credentials` | Platform keys (`encrypted_cek`, `encrypted_credential`, `masked_preview`, `status`) |
| `platform_budgets` | Monthly budget and threshold percentages |
| `ai_opportunities`, `opportunity_reviews` | Admin-reviewed free-credit and offer research |
| `admin_audit_log` | Admin actions (`action`, `target_type`, `target_id`, `details`) |

## 3. Storage buckets

| Bucket | Visibility | Limit | Used for |
| :--- | :--- | :--- | :--- |
| `project-files` | Private | 50 MB (migration) | Project attachments (`server/routes/project/files.ts`, signed URLs); create with `scripts/create_bucket.ts` if absent |
| `vault-files` | Private | 50 MB | Vault file storage |
| `id-documents` | Private | 10 MB | Created by an earlier account migration; institutional ID upload was later removed from sign-up |

Note: the server's multipart ceiling is `MAX_UPLOAD_MB` (hard maximum 10), which is lower than the bucket limits.

## 4. Client and domain shapes

| Shape | Location | Notes |
| :--- | :--- | :--- |
| `ProjectView` | `src/desk/types.ts` | `projectId`, `outputTypeId`, `version`, `title`, `answers`, `authors`, `intakeCompleteness`, `hasDocument`, `hasJournalRequirements`, `gates` |
| `ProjectRecord` | `src/app/conductor/projectStore.ts` | Server-side project (maps to `projects`) |
| Gate ids | `src/domain/project/gates.ts` | `G0` Intake, `G1` Requirements, `G2` Sources, `G3` Structure, `G4` Draft, `G5` Review, `G6` Compliance, `G7` Export |
| Canonical document | `src/desk/types.ts`, `src/domain/document` | Blocks of kind `paragraph`, `heading1-3`, `quote`, `list-item` |
| Claim-evidence graph | `src/domain/claim`, `src/domain/evidence` | Claims, bindings, evidence items with provenance |
| `AssignmentProjectState` | `src/desk/assignment/types.ts` | `currentPhase` (`extract`, `understand`, `sources`, `drafting`, `submission`), `brief`, `sources`, `drafting`, `submission`; persisted through `projects.answers` (see [`WORKFLOWS.md`](WORKFLOWS.md) §3) |
| Typed answers | `src/shared/projectStateSchema.ts` | `readTypedProjectState`, `safeParseAnswerField` parse saved answers whether serialized or hydrated |
| Output-type spec | `src/app/atlas/types.ts` | `OutputTypeSpec`: id, label, aliases, family, levels, structure sections with word budgets |
| Review lenses | `src/domain/review/types.ts` | `contribution`, `literature`, `methodology`, `evidence`, `argument`, `citation`, `journal_fit`; severities `minor`, `moderate`, `major`, `critical` |
| Canonical reference | `src/citation_compliance/model/reference.ts` | Input to every citation formatter |
| Slide deck | `src/features/slides/types/slides.ts` | Stored in `presentation_decks.slides`; card content in `src/features/slides/gamma/content.ts` |

Local drafts (`draft-…` ids) live in browser storage (`scholar_ephemeral_projects`, `scholar_ephemeral_projects_backup`, `scholar_migrated_drafts_map`) until their first authenticated request commits them.

## 5. Local-only stores

`data/.scholar_local_store.json` backs projects when no database is configured outside production (`src/services/store/projectStore.ts`); it is not used in production, where the server refuses to start without durable storage.
