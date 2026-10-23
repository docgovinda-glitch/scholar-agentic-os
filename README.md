# Scholar Core — The Agentic Scientific Operating System

**Scholar Core** is an enterprise-grade academic research, thinking, structured writing, and verification operating system. Built for researchers, postgraduates, and undergraduate scholars, it replaces generic AI text generation with deterministic evidence ledgers, adversarial multi-agent peer review, and human-centered academic workspaces.

---

## 🏛️ Dedicated Academic Workspaces

Rather than generic forms, each academic format in Scholar Core operates through its own purpose-built workspace tailored to the exact cognitive process of researchers:

1. **📝 Coursework & Essay Engine (`OT-01`)**:
   - **Dual Execution Modes (`Minimal | Detailed`)**:
     - **Minimal Mode**: Streamlined setup (Topic, Assignment Type, Word Count Target, Citation Style) with a clean distraction-free writing canvas; defers intermediate telemetry and drawers.
     - **Detailed Mode**: Full architectural controls (Academic Tone selector with auto-binding, custom rubric, database filters) + live 4-phase atomic lifecycle stepper, OpenAlex/Crossref citation badges, `<20%` inter-section overlap indicator, and expanded ML Style Compliance Audit panel.
   - **4-Phase Atomic Lifecycle**:
     - **Phase 1 · Extract & Understand** (`current_phase = 'understand'` in Supabase DB):
       - **Part 1 (Extract)**: Assignment brief intake (paste prompt or upload `.pdf`, `.docx`), target word count stepper, level, citation style, and grading criteria extraction.
       - **Part 2 (Understand)**: Core working thesis calibration, target theoretical frameworks, tailored dynamic outline generator (`outlineService.ts`), dynamic word count editor (`DynamicStructurePlanner.tsx`), and collegiate writing style selection across 6 tones.
     - **Phase 2 · Sources & Discovery**: Literature discovery engine (`scholarlyDiscoveryService.ts`), connecting directly to Phase 1 subheadings with research status indicators, explicit assignment roles (*Empirical evidence*, *Theoretical framework*, *Core theory*), and lecture/slide upload dropzone (`LectureUploadDropzone.tsx`).
     - **Phase 3 · Drafting & Learned Prompt Injection**: Section drafting prompt generator (`drafting.ts`) injecting explicit quantitative writing constraints (mean sentence length 18–32 words, burstiness standard deviation 6.5–9.5 words, active voice `>= 80%`, citation density `>= 2.2%`, and archetype transition n-grams).
     - **Phase 4 · Submission**: 10-point rubric compliance evaluator, citation reconciliation auditor (100% in-text citations verified against references), and one-click `.docx` and PDF export.
   - **Stage-Scoped Copilot Personas** (`ContextPanel.tsx`): Advisor (Understand), Librarian (Sources), Scribe (Drafting), Examiner (Submission).

2. **📄 Journal Article Workspace (`OT-10`)**:
   - **25-Stage Empirical Pipeline**: *Topic Definition → Literature Matrix → Gap Identification → Claim-Evidence Graph → Methodological Framing → Empirical Generation → Double-Blind Adversarial Peer Review*.
   - **Q1 Journal Style Compliance Engine**: Live manuscript style compliance score card based on the 110-paper corpus, enforcing `Formal Academic` / `Objective` benchmarks during section generation and double-blind peer-review referee evaluation.

3. **💡 Research Proposal Workspace (`OT-19`)**:
   - **Competitive Grant Pipeline**: *Funding Agency Alignment → 1-Page Specific Aims → Significance & Innovation → Research Strategy & Pitfalls → Timeline & Gantt Work Packages → Budget Justification*.
   - Includes a **Study Section Review Simulator (NIH / NSF Scoring Criteria)**.

4. **📊 Academic Presentation Studio (`OT-22`)**:
   - **4-Step Guided Workflow**: *01 Understand (Define Topic & Outline) → 02 Design (Curated Presets & Screenshot Cloner) → 03 Edit Slides (100% WYSIWYG Editable Canvas) → 04 Present (Stage View & Live Slide Player)*.
   - **Learned Presentation Benchmark Integration**: Live `OT-22 Style: Conversational Academic · 6x6 Density` header badge and prompt builder enforcing concise assertion-evidence headlines, zero throat-clearing, and 6x6 bullet density.

5. **🎓 Thesis & Dissertation Workspace (`OT-09` / `OT-07`)**:
   - Multi-chapter milestone tracker, literature synthesis matrix, and 15-question Viva Voce oral defense simulator.

6. **💬 Full-Screen Conversational Ask Scholar (`/projects`)**:
   - Immersive dashboard research chat that collapses template starter cards upon interaction, creating an expansive full-screen canvas with citation grounding and direct project initiation.

---

## 🧠 Supervised ML Style Engine (110-Paper Open-Access Corpus)

Scholar Core includes a dedicated Supervised Machine Learning Style Engine (`ml-style-engine/`):
- **110-Paper Verified Corpus**: 10 full-text peer-reviewed open-access papers per archetype across 11 scholarly classes (`essay`, `literature_review`, `research_paper`, `case_study`, `report`, `critical_essay`, `argumentative_essay`, `policy_analysis`, `business_assignment`, `journal_article`, `presentation_slides`), totaling **752,811 verified words** with 0 duplicate PMCIDs and 0 duplicate hashes.
- **High-Precision ML Classifier**: Calibrated LinearSVC achieves **93.97% 5-Fold Stratified Cross-Validation Accuracy & Macro F1** (exceeding the 85% qualification gate).
- **Zero-Latency In-Memory Inference**: Model weights exported to JSON (`archetype_model_weights.json`) for deterministic client-side TF-IDF dot-product scoring and quantitative style auditing in TypeScript without network overhead.


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
