# Workflows

Step-by-step behaviour of the application as implemented. Endpoint details are in [`API.md`](API.md); state shapes in [`DATA-MODEL.md`](DATA-MODEL.md).

## 1. Sign-up, sign-in and onboarding

Components: `src/desk/auth/AuthFlow.tsx`, `src/desk/DeskAuthGate.tsx`, `src/desk/DeskApp.tsx` (`OnboardingGate`).

1. **Sign-up** (`/signup`): full name, username, email, user type, level of education, institution (optional), password, and a Cloudflare Turnstile token when `VITE_CAPTCHA_SITE_KEY` is set. The client checks identifier availability (`POST /api/auth/check-availability`) and the server verifies the CAPTCHA (`POST /api/auth/verify-signup`). Supabase Auth creates the account and sends a confirmation link to `/verify-email` (`/signup/check-email`, `/signup/resend`).
2. **Sign-in** (`/signin`): one field accepting user ID, email or mobile number, plus password. `POST /api/auth/login` resolves the identifier and returns one uniform error for any failure; a Google Identity button (`GoogleIdentityButton.tsx`) is also present. Password reset: `/reset-password`, then `/reset-password/confirm`.
3. **Onboarding** (`/onboarding`): role, highest education level, institution or company, mobile number.
4. **AI setup interstitial**: until AI setup is complete or skipped (`useAiSetupStatus`), `OnboardingGate` shows `AiAccessPage` in onboarding mode.
5. **Vault setup offer**: then `VaultSetupScreen` steps `offer`, `storage_choice` (`local` or `synced`), `passphrase`, `recovery` (a recovery code), `done`; it can be skipped.
6. The user lands on `/projects`. Signed-out visitors on `/` see the landing page; `/presentation` works without an account.

## 2. Creating a project

1. On `/projects` (or the landing page) the user picks a format tile: Coursework & Essays (`OT-01`), Journal Article (`OT-10`), Research Proposal (`OT-15`) or Slides & Keynotes (`OT-22`); the picker also lists other catalog types. A signed-out visitor is asked to sign in first. An existing empty project of the same type is reused instead of creating another.
2. `createProject` (`src/desk/api/projectsApi.ts`) makes a **local draft** (`draft-…` id kept in browser storage by `src/desk/ephemeralProjectStore.ts`) for every type except `OT-06`, which is created on the server immediately (`POST /api/projects` with `{ outputTypeId }`).
3. The first authenticated project request for a draft (`authedFetch` in `src/desk/api/client.ts`) commits it to the database and rewrites the id; later requests use the real id.
4. `/projects/:projectId` opens the workspace chosen by `outputTypeId` ([`PRODUCT.md`](PRODUCT.md) §2). Deep links use `/projects/:projectId/:view` (a journal stage id, or a shell view).
5. Titles that are still untitled are filled from the brief (`autoUpdateProjectTitleIfUntitled` in `server/routes/project/assignment/helpers.ts`).

## 3. Coursework (`OT-01`, `OT-02`)

Five stages shown in `AssignmentStageNavigation`: `extract`, `understand`, `sources`, `drafting`, `submission`. The stage flow is always the full five-stage flow (`executionMode` in `AssignmentContext.tsx` is fixed to `detailed`). Everything is derived from the student's brief, never from a subject template.

| Stage | Component | What happens |
| :--- | :--- | :--- |
| 01 Extract | `AssignmentExtractStage.tsx`, `server/routes/project/assignment/extractRoutes.ts` | Paste or upload the brief (`.pdf`, `.docx`, `.txt`, `.md`; the `File` goes straight to the handler and the input resets). Set level, type, citation style, tone and word count; course codes are stripped before counting (`QNT-4020` is never `4020`). Upload only reads the file (no AI call). **Save & Build** saves, then runs one server build (`POST /assignment/build`, `buildRoutes.ts`): Extract, then the plan and the outline with thesis options (three AI calls, progress streamed, each result saved when ready, state in `assignment_build`). Stage 02 opens as soon as the brief has been read; an unchanged brief is not rebuilt unless forced; one build per project at a time |
| 02 Understand | `AssignmentUnderstandStage.tsx`, `understandRoutes.ts` | Brief summary (`buildBriefSummary`), sub-question rows with the brief's own marks and proportional word targets (`parseBriefQuestions`, `allocateWordsByMarks` in `src/utils/briefQuestions.ts`), grading criteria (`parseMarkingCriteria`), thesis selector  PDF layouts are normalised first (`normalizeBriefLayout`); sub-parts are budgeted inside their question (never double-counted); the rubric is read from its own heading; the working thesis comes from the AI: up to three proposals shown as "AI suggestion" cards (the first fills an empty thesis, never over the student's own), plus "Refine with AI" (`/thesis/refine`, saved only when accepted); `briefGroundedStances` (the brief's own wording) appear only when there are no AI options, labelled as not AI. The outline is the AI's (headings, H2/H3 levels, purpose, word budgets), with each section's purpose, the budget notes and per-section "Regenerate" (`/outline/section`); with none there is "No outline yet" (write it with AI, or start from a plain outline, not AI). The footer button approves the outline |
| 03 Sources | `AssignmentSourcesStage.tsx`, `realScholarlyDiscoveryService.ts`, `agentRoutes.ts` (`/agent/sources`) | 3-5 keyword phrases built from the brief (`buildSourceSearchQueries`, never the raw prompt), each carrying the brief's subject word (`briefDomainTerms`); papers without it are dropped (`scoreSourceRelevance`, 0-100). OpenAlex, Crossref, Semantic Scholar, DOAJ, DataCite and arXiv queried with `Promise.allSettled` and timeouts. A reference list printed in the brief is parsed into full entries (`parsePrescribedBibliography`) and pinned first with a `Prescribed in Brief` badge. Rows show the title first; author names go through `parsePersonName` (never "al., A. e.", never inverted). The student approves sources and can upload lecture material |
| 04 Drafting | `AssignmentDraftingStage.tsx`, `draftingRoutes.ts` | Sections come from the approved outline (with none, Drafting asks for it first; nothing is made up). The AI's word budgets are kept in proportion and fitted to the exact total in clean multiples of 5 (10 from 1,000 words) by `fitAiOutline` (`src/domain/assignment/aiOutlineFit.ts`); a marked question the AI left out gets a section titled from the brief, and every change is listed in `budgetNotes` (marks are guidance to the AI and a note when a section's share of words is more than 20% off its marks share). `applyMarksBudget` is used only for the plain starter outline. Per-question word counts the student types are kept (`applyQuestionWordTargets`). `/stream-section` takes `allocatedWords` (capped by `remainingEssayWords`), asks for ±5%, counts words as the app does (`countProseWords`), streams the model's own tokens as they arrive (a router fallback that drops partial output sends `{ replace }`), and when short streams one visible continuation (a continuation that repeats the draft is dropped). Stop aborts the request and the model; the text that had arrived is kept in `assignment_section_partials` (also saved every 5 s while streaming) with Resume (continues from the last full sentence via `continueFrom`), Keep this text and Discard. One section is drafted at a time; a second click does nothing. Long drafts are trimmed at a sentence boundary after citation tokens are expanded (`server/src/utils/sectionBudget.ts`). Each section prompt carries a contract (`server/src/utils/sectionContract.ts`): every lettered sub-part, the citations the question names, its place in the report and the chosen writing style (including "My Own Writing Style" from a pasted sample). No `[Unverified Claim]` tag is written into prose; unmatched citations are removed and adjacent author-date citations merge. With every AI provider out of credit it sends a labelled offline scaffold (`server/src/utils/sectionScaffold.ts`); failed revisions never overwrite text. The stream opens before the model call: a 426 hand-off is decided first (`handOffBeforeStream`), then SSE headers (`no-cache, no-transform`, `X-Accel-Buffering: no`) are flushed with a `: keep-alive` comment every 5 s (`server/src/utils/sectionStream.ts`); after that every failure is a `{ error, recoverable: true }` event, never a dropped socket, and the client retries a dropped connection once, only if no text had arrived. Only sources with a title, an author and a year are offered for citation; nothing is filled in. The prompt asks for 2-4 paragraphs separated by blank lines; streamed tokens keep whitespace exactly and `ensureParagraphBreaks` / `formatProseToParagraphHtml` (`src/shared/proseParagraphs.ts`) keep or rebuild paragraphs (a single block over 120 words is regrouped every 3-4 sentences) in the editor and exports. In the manual editor, Enter starts a new paragraph. Approved sources compile into a `ReferencesCard`, appended to the compiled draft |
| 05 Submission | `AssignmentSubmissionStage.tsx`, `submissionRoutes.ts` | 10-point rubric audit (`RubricComplianceCard`), citation reconciliation (`CitationReconciliationCard`), `.docx` and PDF export (`exportAssignmentToPdf`, helpers in `exportText.ts`): no raw prompt on the cover, only cited and prescribed sources (deduplicated), real italics |

Stage copilots (`src/desk/assignment/types.ts`): Advisor (Understand), Librarian (Sources), Scribe (Drafting), Examiner (Submission), served by `assignmentCopilotService.ts` and `POST .../assignment/copilot-chat` and `.../agent/{extract,understand,sources,review,evidence}`. With no AI answer the copilot reports it; it never sends canned advice.

Saved projects are cleaned of legacy template text on load (`src/domain/assignment/legacyPurge.ts`). State is held in `AssignmentContext` and saved as keyed answers (`saveAnswers`, which calls `PATCH /api/projects/:id/intake`) into the project's `answers` object in `public.projects`. The `assignment_projects` table exists in the schema but no application code reads or writes it.

## 4. Journal article (`OT-10`)

25 stages in five phases (`RESEARCH_PHASES` in `src/desk/workspace/types.ts`), implemented by `ResearchWorkspace` and the stage components, with server routes under `/api/projects/:id/agentic/*` (`server/routes/project/agentic/`).

| Phase | Stages |
| :--- | :--- |
| I. Foundation | 1 Research Definition, 2 Literature Discovery, 3 Gap Identification, 4 Gap Selection, 5 Title Generation, 6 Title Lock |
| II. Evidence | 7 Knowledge Vault, 8 Vault Approval, 9 Primary Data, 10 AI Extraction, 11 External Research, 12 External Approval, 13 Evidence Matrix, 14 Researcher Review |
| III. Drafting | 15 Journal Discovery, 16 Journal Rules, 17 AI Draft Generation, 18 Citation Audit, 19 Originality Check, 20 Draft Preview |
| IV. Peer Review | 21 AI Peer Review, 22 AI Revision |
| V. Publication | 23 Final Editor, 24 Readiness Check, 25 Format & Export |

The same workspace also exposes a five-mode studio (Protocol Blueprint, Evidence Matrix, Manuscript Studio, Referee Rebuttal, Audit & Export: `ProtocolBlueprintMode.tsx`, `EvidenceMatrixMode.tsx`, `ManuscriptStudioMode.tsx`, `RefereeRebuttalMode.tsx`, `AuditExportMode.tsx`). Notes:

- **Peer review** runs one bounded model call per lens over seven lenses (`REVIEW_LENSES`: contribution, literature, methodology, evidence, argument, citation, journal_fit; `src/app/review/peerReview.ts`). A failed lens is recorded, not fatal. Critiques are stored in `peer_review_critiques` and can be waived. The rebuttal matrix and rebuttal-letter export hang off `/agentic/rebuttal-matrix` and `/agentic/export/rebuttal-letter`.
- **Claims and evidence**: `/api/projects/:id/claims` and `/evidence` hold the claim-evidence graph (claims, evidence items, bindings; unsupported claims can be listed and marked).
- **Gates** (`src/domain/project/gates.ts`): G0 Intake, G1 Requirements, G2 Sources, G3 Structure, G4 Draft, G5 Review, G6 Compliance, G7 Export, signed off via `/api/projects/:id/gates/:gate/signoff`. G2 allows a smaller corpus through `/gates/G2/accept-smaller-corpus`.
- **Writing Studio** (`ManuscriptStudioMode.tsx`, `src/desk/journal/studio/`): one section at a time. The text lives in `manuscript_sections` and the assembled `manuscript_markdown`, the one canonical manuscript key (`src/domain/journal/manuscriptText.ts`: `readManuscriptMarkdown` is the only reader, `manuscriptAnswerPatch` the only writer; `full_text_markdown`, `assembled_draft` and `manuscript_draft` are read only as a fallback and blanked on save). `useManuscriptTexts` saves 800 ms after typing stops and at once when the studio closes or the tab hides; only the newest save updates the project, and changes made in Review or Delivery are picked up when nothing is unsaved. Words are counted by `countManuscriptWords` (header and studio agree); the reference list uses the project's citation style (`citedReferences`, the same formatter as Delivery). AI drafts and polishes are shown before they replace text, and the author's previous text can be restored. Prompts: `scholarBrain.journalPrompts`.
- **Manuscript generation** (the desk's job, for output types other than `OT-10`) is a resumable job (`/manuscript/start`, `next-section`, `pause`, `resume`) followed by `coherence-check`, `peer-review` and `resolve-citations`. Each `next-section` drafts with the same section drafter as the Writing Studio.
- **One section drafter** (`server/src/services/sectionDrafter.ts`, `scholarBrain.draftSection`): every AI-written manuscript section, from the Writing Studio and from the generation job, is drafted the same way: a bounded research context (`researchContextFromAnswers`, never the whole answer set), the section's brief, excerpts of sections already written, and only the citable sources; one expansion when more than 8% short; citations outside the list removed and verified ones kept as `[CITE:id]` tokens (`resolveCitations` also reads older bare `[ev-…]` tokens); the voice pass with tokens masked. It saves nothing; each caller stores the text its own way.
- **Extras**: cover letter, anonymization (propose then apply), journal compliance report (`/compliance`), submission tracking (`/submissions`).
- **Export** (`POST/GET /api/projects/:id/export[/:format]`): `docx`, `odt`, `pdf`, `latex`, `typst`, `camera_ready_pdf`, `markdown`/`md`, `rebuttal_letter`. A project with no document returns 400.

## 5. Thesis (`OT-07`)

`ThesisWorkspace` has six steps: 1 Proposal & Framing, 2 Literature Matrix, 3 Methodology & Ethics, 4 Write Chapters, 5 Discussion & Audit, 6 Viva Voce Simulator. Server routes (`server/routes/project/thesis.ts`): `POST /viva-simulate` (examiner questions from the thesis title and research questions), `/chapter-audit`, `GET /gate-status`, `/draft-chapter`. Export: `thesisExport.ts`, `thesisLatex.ts`; references: `thesisReferences.ts`. Thesis and proposal routes answer with a browser hand-off when the user's only AI is a local model.

## 6. Proposal (`OT-15`)

`ProposalWorkspace` has eight steps: 1 Agency & Rubric, 2 Specific Aims (1-Page), 3 Preliminary Studies, 4 Significance & Innovation, 5 Research Strategy & Risk, 6 Budget & Resources, 7 Broader Impacts & Data Plan, 8 Study Section Scorer. Server routes (`server/routes/project/proposal.ts`): `POST /study-section-simulate`, `/aims-audit`, `/draft-section`. Export in `proposalExport.ts`.

## 7. Presentation Studio (`OT-22`)

Four steps (Understand, Design, Edit Slides, Present) and the card engine are documented in [`presentation-studio.md`](presentation-studio.md). Step 01 is a card-by-card outline: an uploaded brief (`POST /api/presentations/parse-document`, which strips course codes and page footers and returns the real topic, never a department banner) or a topic goes to `POST /api/projects/:id/presentation/outline` (`scholarBrain.presentationOutline`; with no AI, an outline built from the brief's own questions). Step 02 adds per-slide Visual & Graphic Requirements the presenter confirms; Step 03 has a 7-layout switcher, typed blocks and `POST .../presentation/write-block`. Decks are saved with `PUT /api/projects/:id/presentation/deck` (project decks) and `/api/presentations/:id` (library decks, `public.presentation_decks`).

## 8. Knowledge Vault (`/vault`)

`KnowledgeVault` and `SourceLibraryScreen` show sources; `AddSourceModal` adds them from a URL, DOI, pasted BibTeX or RIS record (read by the shared `citation_compliance` importers), cloud drive or manual entry.

1. **Set-up**: passphrase and recovery code, storage mode `local` or `synced` (`src/services/userVault.ts`, table `user_vaults`). The vault can be locked and unlocked per session.
2. **Add a source**: DOI (`POST /api/vault/lookup-doi`, or `POST /api/lookup-doi`), file upload (`POST /api/vault/parse-file`, ≤ 10 MB), URL (`POST /api/vault/parse-url`, SSRF-guarded), BibTeX or RIS (`src/citation_compliance/importers/`, `referenceImport.ts`), Zotero and Mendeley sync (`POST /api/vault/zotero/sync`, `/mendeley/sync`), Google Drive and OneDrive file listing (`GET /api/vault/drive/files`, `/onedrive/files`) with stored connections (`/api/vault/cloud/connections`).
3. **Search**: semantic search over the user's sources (`POST /api/vault/search-semantic`).
4. **Persist**: rows go to `public.user_vault_items` with `canonical_reference`, `citation_status`, authors, year, journal and metadata. `POST /api/vault/reset` clears the vault.
5. **Use**: journal stages 7-8 pull from the Vault; coursework approves sources into the project.

## 9. AI Access (`/ai-access`)

1. Overview shows what is connected and the active routing. Providers lists the catalogued cloud providers and local runners.
2. For a cloud provider the user adds a key and verifies it (`POST /api/ai-access/models` discovers models from the provider with that key); the key can be saved to the account for other devices (`PUT /api/ai-access/keys/:providerId`).
3. For a local runner the browser probes `localhost` (`src/services/localRunnerProbe.ts`) and hardware can be profiled (`hardwareProfiler.ts`).
4. Premium is shown as "Coming soon"; there is no Premium code or endpoint.
5. Preferences set default routing. During onboarding the same page appears with continue and skip actions.

## 10. Ask Scholar (`/projects`)

The prompt bar and chat on the projects screen (`src/desk/ProjectListScreen.tsx`) ask `POST /api/ai/agent` for grounded answers with web and scholarly retrieval and citation validation, can run `POST /api/ai/search` or `/api/ai/deep-research`, and can start a project from an answer (formats `OT-01`, `OT-10`, `OT-19`, `OT-09`, `OT-22`).
