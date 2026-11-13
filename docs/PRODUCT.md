# Product Overview

What Scholar Core does today, who uses it, and which parts are built. Behaviour is described step by step in [`WORKFLOWS.md`](WORKFLOWS.md).

## 1. Audience and roles

| Role | How it is determined | Can do |
| :--- | :--- | :--- |
| Visitor | No session | Landing page, sign-in and sign-up, and `/presentation` (works signed out) |
| Signed-in user | Supabase session verified by `requireAuth` | Own projects, Vault, AI Access, settings |
| Premium subscriber | Active row in `user_entitlements` with a plan (`premium_plans`) | Platform-managed AI resources within plan credits and quotas |
| Admin | Row in `admin_users` or the `MAIN_ADMIN_EMAIL` account | `/admin/*` panel and `/api/admin/ai/*`, limited by scope |

Admin scopes (`server/src/middleware/requireAdmin.ts`): `manage_providers`, `manage_premium`, `manage_budget`, `manage_opportunities`, `manage_users`, `manage_admins`.

Profiles carry username, full name, phone, affiliation, user type and education level (`public.profiles`).

## 2. Output types and workspaces

The Atlas catalog (`src/app/atlas/catalogData.ts`, `src/app/atlas/catalog.ts`) defines 24 output types in six families. A project stores one `outputTypeId`; `src/desk/DeskApp.tsx` picks the workspace from it.

| Family | Output types (catalog labels) |
| :--- | :--- |
| `short_form` | OT-01 Assignment, OT-02 Essay, OT-03 Report, OT-13 Literature Review, OT-04 Abstract, OT-05 Seminar Paper, OT-24 Generic Document |
| `long_form` | OT-06 Undergraduate Dissertation / Capstone, OT-07 Master's Thesis, OT-08 Doctoral Dissertation, OT-09 Book / Monograph |
| `publication` | OT-10 Journal Article, OT-11 Conference Paper, OT-12 Review Article, OT-14 Book Chapter |
| `proposal_funding` | OT-15 Research Proposal, OT-16 Grant Proposal, OT-17 Ethics Application |
| `applied_professional` | OT-18 Lab Report, OT-19 Case Study, OT-20 Policy Brief, OT-21 White Paper / Technical Documentation |
| `presentation` | OT-22 Presentation, OT-23 Poster |

Dedicated workspaces (routing in `DeskApp.tsx`):

| `outputTypeId` | Workspace |
| :--- | :--- |
| `OT-01`, `OT-02` | Coursework (`src/desk/assignment/`) |
| `OT-07` | Thesis (`src/desk/thesis/`) |
| `OT-10` | Journal research studio (`src/desk/workspace/`) |
| `OT-15` | Research proposal (`src/desk/proposal/`) |
| `OT-22` | Presentation Studio (`src/desk/presentation/`) |
| everything else | Generic shell (`src/desk/DeskShell.tsx`) |

Workspace ids match the catalog: Research Proposal is `OT-15` and the Thesis workspace is `OT-07`. Projects saved earlier under `OT-19` (proposal) or `OT-09` (thesis) are read as `OT-15` / `OT-07` (`src/app/atlas/legacyIds.ts`, applied by the project stores and `DeskApp`), and migration `20261109000000_align_output_type_ids.sql` rewrites the stored rows. Project creation tiles (`src/desk/dashboard/constants.ts`) are Coursework & Essays (`OT-01`), Journal Article (`OT-10`), Research Proposal (`OT-15`) and Slides & Keynotes (`OT-22`); the picker also lists the other catalog types except `OT-07`, which has its own thesis tile.

## 3. Capabilities by area

**Coursework** (`OT-01`/`OT-02`): five stages (Extract, Understand, Sources, Drafting, Submission) derived only from the student's brief. Brief upload (`.pdf`, `.docx`, `.txt`, `.md`), marks-derived sub-questions and word targets, keyword-based multi-provider source discovery, outline and section drafting within budget, an offline scaffold when every AI provider is out of credit, a references card, a 10-point rubric audit, citation reconciliation, `.docx`/PDF export. Four stage copilots (Advisor, Librarian, Scribe, Examiner, defined in `src/desk/assignment/types.ts`).

**Journal article** (`OT-10`): 25 stages in five phases (Foundation, Evidence, Drafting, Review, Publication; `src/desk/workspace/types.ts`). Gap finding, title selection and lock, Vault and external source approval, evidence extraction and analysis, journal discovery and requirements, drafting, citation audit, originality check, peer-review simulation, revision and rebuttal matrix, final editor, publication readiness, cover letter, anonymization and export.

**Thesis** (`OT-07`): chapter editor, research questions, literature matrix, references, LaTeX and document export, chapter audit and gate status, Viva Voce simulator.

**Proposal** (`OT-15`): narrative section editor, budget editor, aims audit, study-section scorer, export.

**Presentation Studio** (`OT-22`): topic or document to card outline, 8 curated themes, inline editing, presenter, audience Q&A simulator, PowerPoint/PDF/Markdown/JSON export. See [`presentation-studio.md`](presentation-studio.md).

**Knowledge Vault** (`/vault`): per-user source library with DOI lookup, file and URL import, BibTeX/RIS import, Zotero and Mendeley sync endpoints, Google Drive and OneDrive file listing, semantic search, collections and tags, retraction metadata, and a reset action.

**Citation engine** (`src/citation_compliance/`): formatters for APA 7, IEEE, MLA 9, Chicago (author-date and notes), Harvard and Vancouver registered at startup in `server.ts`; `scholarBrain` additionally accepts the `oscola` style key. BibTeX and RIS importers.

**Ask Scholar** (`/projects`): research chat backed by `POST /api/ai/agent` with web search and deep research endpoints (`/api/ai/search`, `/api/ai/deep-research`).

**AI Access** (`/ai-access`): Overview, Providers, Subscription and Preferences sections. See [`AI-SYSTEM.md`](AI-SYSTEM.md).

**Admin panel** (`/admin/*`): providers and models, premium plans/requests/subscribers, AI resources, platform credentials, budget, usage, opportunities, admin roster, user status, audit log.

## 4. Principles that shape the product

- Everything a user can hand in or rely on must be real: references, DOIs, figures and reviewer comments are never invented. Generators use only material from the user's input or retrieved sources.
- One AI brain (`scholarBrain`); no per-workspace prompt engines or subject lookup tables.
- The user's own AI key is never stored by request handlers or written to logs; Premium keys never leave the server.

## 5. Not built

Items under consideration are listed in [`../PRODUCT_BACKLOG.md`](../PRODUCT_BACKLOG.md) (shared deck links, real plagiarism checking). Output types without a dedicated workspace open the generic shell.
