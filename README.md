# Scholar Core — The Agentic Scientific Operating System

**Scholar Core** is an enterprise-grade academic research, thinking, structured writing, and verification operating system. Built for researchers, postgraduates, and undergraduate scholars, it replaces generic AI text generation with deterministic evidence ledgers, adversarial multi-agent peer review, and human-centered academic workspaces.

---

## 🏛️ Dedicated Academic Workspaces

Rather than generic forms, each academic format in Scholar Core operates through its own purpose-built workspace tailored to the exact cognitive process of researchers:

1. **📝 Coursework & Essay Engine (`OT-01`)**:
   - **4-Phase Lifecycle**:
     - **Phase 1 · Understand & Structure**: Unified assignment setup box (prompt input, academic level, assignment type, and citation style in a clean single-component workspace), question-specific analytical structure generator (`outlineService.ts`) decomposing prompts into relational entities without generic templates, calibrated thesis statement generation, dynamic word count allocator & editor (`DynamicStructurePlanner.tsx`), and authentic academic voice selection (`WritingStyleSelector.tsx`) across 6 styles.
     - **Phase 2 · Sources & Discovery**: Question-led literature discovery engine (`scholarlyDiscoveryService.ts`), connecting directly to Phase 1 subheadings with research status indicators, explicit assignment roles (*Empirical evidence*, *Theoretical framework*, *Core theory*), relevance categorization, contextual justifications, 2024-2026 recency prioritization with seminal core theory anchors, and a lecture/slide upload dropzone (`LectureUploadDropzone.tsx`).
     - **Phase 3 · Drafting**: Subheading-by-subheading drafting alignment matching the confirmed structure (`DraftingSectionIndex.tsx`), live target vs. actual word counters, TipTap WYSIWYG editor, and pre-formatted in-text citation insertion.
     - **Phase 4 · Submission**: 10-point rubric compliance evaluator, citation reconciliation auditor (100% in-text citations checked against the bibliography), and one-click `.docx` and PDF export with running headers and formatted references.
   - **Stage-Scoped Copilot Personas** (`ContextPanel.tsx`):
     - Phase 1 → **Advisor** (prompt deconstruction and structural guidance)
     - Phase 2 → **Librarian** (source curation and bibliographic rigor)
     - Phase 3 → **Scribe** (PEEL structure and academic register)
     - Phase 4 → **Examiner** (rubric evaluation and citation audit)

2. **📄 Journal Article Workspace (`OT-10`)**:
   - **25-Stage Empirical Pipeline**: *Topic Definition → Literature Matrix → Gap Identification → Claim-Evidence Graph → Methodological Framing → Empirical Generation → Double-Blind Adversarial Peer Review*.
   - Includes 5 specialized reviewer lenses (Methodologist, Domain Specialist, Biostatistician, Synthesizer, Formal Editor).

3. **💡 Research Proposal Workspace (`OT-19`)**:
   - **Competitive Grant Pipeline**: *Funding Agency Alignment → 1-Page Specific Aims → Significance & Innovation → Research Strategy & Pitfalls → Timeline & Gantt Work Packages → Budget Justification*.
   - Includes a **Study Section Review Simulator (NIH / NSF Scoring Criteria)**.

4. **📊 Academic Presentation Studio (`OT-22`)**:
   - **4-Step Guided Workflow**: *01 Understand (Define Topic & Outline) → 02 Design (4 Curated Presets & Custom Accent Picker) → 03 Edit Slides (100% WYSIWYG Editable Canvas with Split Image + Text Layouts) → 04 Present (Stage View, Rehearsal Timing, & Clean Export)*. Zero developer database leakages and purged feature bloat.

5. **🎓 Thesis & Dissertation Workspace (`OT-09` / `OT-07`)**:
   - Multi-chapter milestone tracker, literature synthesis matrix, and 15-question Viva Voce oral defense simulator.

6. **💬 Full-Screen Conversational Ask Scholar (`/projects`)**:
   - Immersive dashboard research chat that collapses template starter cards upon interaction, creating an expansive full-screen canvas with citation grounding and direct project initiation.


---

## 🔐 Source Library & Zero Document Storage Architecture

Scholar Core operates under a strict **Zero Document Storage Policy**:
- **Zero Full-Text Retention**: Scholar Core does NOT store full proprietary PDFs, copyrighted manuscripts, or full paper texts on its servers.
- **Verifiable Citation & Metadata Pointers**: Retains only structured bibliographic metadata, canonical references, DOIs, URLs, and client-authorized cloud storage pointers.
- **Cloud Drives (Google Drive & Microsoft OneDrive)**:
  - **Google Drive**: Automatic metadata extraction and direct `↗ Open in Google Drive` navigation.
  - **Microsoft OneDrive & SharePoint**: Instant share link ingestion (`https://1drv.ms/...`), institutional email workspace connect, and Azure OAuth handling.
- **Reference Management**: Direct DOI lookup via Crossref/OpenAlex, plus BibTeX (`.bib`) and RIS (`.ris`) import.

---

## ⚡ Multi-Tier AI Gateway & BYOK Infrastructure

Scholar Core features a flexible, multi-tiered AI architecture configurable in `/ai-access`:
- **5 Operating Modes**: Smart Gateway, Bring Your Own Key (BYOK), Free Tier, Local AI (Ollama, LM Studio on `localhost`), and Offline Mode.
- **Provider Support**: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, xAI, OpenRouter, and Together AI.
- **Automatic Failover**: Transparent fallback on HTTP 429 rate limits or provider outages with exponential quarantine recovery.

---

## 🚀 Quick Start

### Installation
```bash
# Clone repository
git clone https://github.com/docgovinda-glitch/scholar-agentic-os.git
cd scholar-agentic-os

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
```

### Run Locally
```bash
npm run dev
```
Access the application at `http://localhost:3000`.

### Run Verification & Tests
```bash
# Type checking
npx tsc --noEmit

# Run tests
npm test

# Linting & design checks
npm run lint

# Production build
npm run build
```

---

## 📚 Documentation Directory

Complete authoritative documentation is available in the [`/docs`](docs/README.md) directory:

- [**`docs/README.md`**](docs/README.md): Master documentation index.
- [**`docs/PRODUCT.md`**](docs/PRODUCT.md): Current product capabilities and user roles.
- [**`docs/UI-UX.md`**](docs/UI-UX.md): UI layout, component design, Day/Night theme, and interaction states.
- [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md): Fullstack architecture, topology, and security model.
- [**`docs/WORKFLOWS.md`**](docs/WORKFLOWS.md): Step-by-step user journeys across all major features.
- [**`docs/AI-SYSTEM.md`**](docs/AI-SYSTEM.md): AI routing, failover, local runners, and prompt design.
- [**`docs/DATA-MODEL.md`**](docs/DATA-MODEL.md): Domain models, TypeScript interfaces, and PostgreSQL schemas.
- [**`docs/API.md`**](docs/API.md): Server endpoints, authentication, and request/response specifications.
- [**`docs/DEVELOPMENT.md`**](docs/DEVELOPMENT.md): Local development environment, commands, and standards.
- [**`docs/DEPLOYMENT.md`**](docs/DEPLOYMENT.md): Docker, Render, environment configuration, and Supabase setup.
