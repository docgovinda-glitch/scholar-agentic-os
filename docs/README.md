# Scholar Core Documentation

Welcome to the **Scholar Core** technical documentation. This documentation describes the application as it **currently exists and functions today**.

---

## What is Scholar Core?

**Scholar Core** is an enterprise-grade academic research, structured writing, evidence-grounded verification, and multi-agent peer review operating system. Designed for undergraduate students, postgraduates, doctoral researchers, and academic faculty, it replaces generic text generation with deterministic evidence ledgers, citation reconciliation, rubric alignment, and dedicated academic workspaces.

---

## Authoritative Documentation Directory

The documentation is organized into focused, authoritative specifications:

| Document | Description |
| :--- | :--- |
| [**`PRODUCT.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/PRODUCT.md) | Current product capabilities, user personas, active academic deliverable types, and core features. |
| [**`UI-UX.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/UI-UX.md) | Current UI/UX design system, component layouts, user interaction patterns, Day/Night theme, and view states. |
| [**`ARCHITECTURE.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/ARCHITECTURE.md) | Current technical architecture, fullstack topology (Vite, React 19, Express, Supabase), and security model. |
| [**`WORKFLOWS.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/WORKFLOWS.md) | Step-by-step current user journeys: Auth, Onboarding, Coursework 4-Phase flow, Journal Article pipeline, Vault. |
| [**`AI-SYSTEM.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/AI-SYSTEM.md) | Current AI architecture: Client-side routing, multi-provider failover, BYOK, local LLM runners, and prompt system. |
| [**`DATA-MODEL.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/DATA-MODEL.md) | Active domain entities, TypeScript schemas, PostgreSQL relational tables, JSONB schemas, and persistence. |
| [**`API.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/API.md) | Active server endpoints, parameters, request/response contracts, SSE streaming, and Supabase proxy routes. |
| [**`DEVELOPMENT.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/DEVELOPMENT.md) | Developer guide, prerequisites, local setup, build pipeline, testing standards, and verification commands. |
| [**`DEPLOYMENT.md`**](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/DEPLOYMENT.md) | Production deployment specifications, Docker containerization, Render configuration, and Supabase setup. |

---

## Major Application Modules

1. **Coursework & Essay Engine (`OT-01` & `OT-02`)**
   - 9-milestone structured workflow:
     - **Phase 1 · Understand & Structure**: Dual-tab brief intake, dynamic analytical outline generator & editor (`DynamicStructurePlanner`), word count allocation controls, and authentic academic voice selection (`WritingStyleSelector`).
     - **Phase 2 · Sources & Discovery**: Question deconstruction, multi-angle literature discovery (30+ authentic scholarly sources), lecture upload dropzone, relevance categorization, and approved evidence shelf.
     - **Phase 3 · Drafting**: Subheading-by-subheading drafting alignment, live word count targets, invisible academic chunker, citation insertion shortcuts, and evidence binding.
     - **Phase 4 · Submission & Verification**: 10-point rubric evaluator, citation audit reconciliation (100% in-text to bibliography match), automated reference list generation, and one-click `.docx` / PDF export.
     - **Copilot Personas**: Phase-specific copilots (Advisor, Librarian, Scribe, Examiner).

2. **Journal Article Workspace (`OT-10`)**
   - 25-stage empirical research pipeline across 5 logical phases: Foundation, Evidence, Drafting, Review, Publication.
   - Includes adversarial multi-agent peer review simulation with 5 specialized referee lenses.

3. **Thesis / Dissertation Workspace (`OT-09` / `OT-07`)**
   - Multi-chapter milestone tracker, literature synthesis matrix, and 15-question Viva Voce defense simulator.

4. **Research Proposal Workspace (`OT-19`)**
   - Grant development pipeline: Funding agency alignment, Specific Aims, Significance & Innovation, Work Packages, and NIH/NSF Study Section scoring simulator.

5. **Academic Presentation Workspace (`OT-22`)**
   - Visual narrative and defense studio: 10m/20m/45m timing profiler, slide deck architecture, speaker notes, and 16:9 canvas.

6. **Knowledge Vault (`/vault`)**
   - Cross-project source repository operating under a strict **Zero-Document Retention Policy** (metadata and canonical citations only).
   - Cloud drive integrations (Google Drive, Microsoft OneDrive/SharePoint), DOI lookup, and BibTeX/RIS import.

7. **AI Access Control (`/ai-access`)**
   - 5 operational AI modes: Smart Gateway, Bring Your Own Key (BYOK), Free Tier, Local AI (Ollama, LM Studio, etc.), and Offline.
   - Dynamic model discovery, local hardware profiling, and resilient provider failover engine.

8. **Account Settings (`/settings`)**
   - Multi-account registry, active profile switching, institutional credentials, and Day/Night theme toggling.

9. **Admin Infrastructure Panel (`/admin`)**
   - Dedicated dashboard for monitoring provider health, testing API keys, tracking latency, and auditing error rates.
