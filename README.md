# Scholar Core — The Agentic Scientific Operating System

**Scholar Core** is an enterprise-grade academic research, thinking, writing, and verification operating system. Built for researchers, postgraduates, and undergraduate scholars, it replaces generic AI text generation with deterministic evidence ledgers, adversarial multi-agent peer review, and human-centered academic workspaces.

---

## 🏛️ The 5 Dedicated Academic Workspaces

Rather than generic forms, each academic format in Scholar Core operates through its own purpose-built workspace tailored to the exact cognitive process of researchers:

1. **📝 Assignment Workspace (`OT-01`)**:
   - **8-Phase Academic Workflow**: *Understand → Plan → Research → Evidence Evaluation → Think/Critique → Structure → Grounded Drafting → Submission Review*.
   - Features dynamic rubric alignment, interactive AI tutoring, and evidence-gated drafting.

2. **📄 Journal Article Workspace (`OT-10`)**:
   - **25-Stage Empirical Pipeline**: *Topic Selection → Literature Matrix → Claim-Evidence Graph → Methodological Framing → Empirical Generation → Double-Blind Adversarial Peer Review*.
   - Includes 5 specialized reviewer lenses (Methodologist, Domain Specialist, Biostatistician, Synthesizer, Formal Editor).

3. **🎓 Thesis / Dissertation Workspace (`OT-09`)**:
   - **Multi-Chapter Milestone Framework**: *Proposal & Theoretical Framing → Comprehensive Lit Review → Methodological Design & IRB → Empirical Findings → Critical Discussion & Contributions → Conclusion & Future Trajectory*.
   - Features an interactive **15-Question Viva Voce / Doctoral Defense Simulator**.

4. **💡 Research Proposal Workspace (`OT-19`)**:
   - **Competitive Grant Pipeline**: *Funding Agency Rubric Alignment → 1-Page Specific Aims → Significance & Innovation → Research Strategy & Pitfalls → Timeline & Gantt Work Packages → Budget Justification*.
   - Includes a **Study Section Review Simulator (NIH / NSF Scoring Criteria)**.

5. **📊 Academic Presentation Workspace (`OT-22`)**:
   - **Visual Narrative & Defense Studio**: *Timing & Constraint Profiler (10m/20m/45m) → Narrative Arc & Hook → Slide Deck Architecture → Word-for-Word Speaker Scripts → Interactive 16:9 Slide Canvas → Marp/PPTX Export → Audience Q&A Anticipator*.

---

## 🔐 Source Library & Zero Document Storage Architecture

In compliance with **Revision 2 / Document 43 Rev 5**, Scholar Core operates under a strict **Zero Document Storage Policy**:
- **Zero Full-Text Retention**: Scholar Core does NOT store full proprietary PDFs, copyrighted manuscripts, or full paper texts on its servers.
- **Verifiable Citation & Metadata Pointers**: The Source Library retains only structured cryptographic metadata, canonical references, DOIs, URLs, and client-authorized cloud storage pointers.
- **Cloud Drives (Google Drive & Microsoft OneDrive)**:
  - **Google Drive**: Automatic metadata inference (Authors, Year, Publisher, Doc Type) and direct `↗ Open in Google Drive` navigation.
  - **Microsoft OneDrive & SharePoint**: Instant zero-setup share link ingestion (`https://1drv.ms/...`), institutional email workspace connect, and graceful Azure OAuth handling.
- **Project Selector & Thematic Taxonomy**:
  - **Ongoing Project Selector**: Interactive dropdown and quick-toggle pills (`listProjects()`) linking sources directly to project research workbenches for in-text citations (`(Author, Year)`) and references bibliography generation.
  - **Thematic Tags**: Cross-project conceptual and methodological taxonomy (`#mixed-methods`, `#climate-policy`) powering library-wide semantic search and AI literature review synthesis.
- **Literature Review Synthesis Matrix**: Automated comparative matrix extraction, continuous review narrative generation, and grounded multi-source analytical Q&A ("Ask Your Sources").
- **Reference Manager Integrations**:
  - **Zotero Web API**: Direct two-way sync for collections, tags, and DOI metadata.
  - **Mendeley & BibTeX**: Instant batch parsing of `.bib` records into structured Canonical References.
  - **DOI & Web Scraping**: Live CrossRef / DataCite metadata lookup and client-side extraction.
- **Retraction Scanning**: Automated Crossref and OpenAlex retraction radar for flagging compromised citations in real time.
- **Comprehensive Guide**: See [`docs/KNOWLEDGE_VAULT_AND_CLOUD_DRIVE.md`](docs/KNOWLEDGE_VAULT_AND_CLOUD_DRIVE.md) for full configuration and workflow details.

---

## 🚀 Quick Start & Development

### Prerequisites
- Node.js 20+
- PostgreSQL or Supabase account

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env` file from `.env.example`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3000
```

### Running Locally
```bash
# Start Vite development server & Node backend
npm run dev
```

### Running Test Suites
```bash
# Run all 40 Desk test suites (342 unit & integration tests)
npx vitest run src/desk/
```

### Production Build
```bash
# Build Vite frontend and bundled Node server
npm run build
```

---

## 🖥️ Modern Dual-Pane AI Agent Workspace
Scholar Core implements a ChatGPT/Claude-style dual-pane layout for deep academic research and writing:
- **Left Navigation Pane (`<aside>`)**: 260px fixed width with `flex-shrink-0`, full-width `+ New Project` button, platform links (Knowledge Vault, Editorial Agents, AI Access), Settings, and anchored multi-account profile menu (`dropUp={true}`).
- **Desktop Collapsibility**: Toggle between full navigation and distraction-free reading mode (`w-0`) via the aside collapse button or top-left panel toggle icon.
- **Responsive Mobile Drawer**: Slide-over navigation with an interactive backdrop overlay (`fixed inset-0 z-40 bg-black/40`) for natural tap-to-dismiss.
- **Custom Agentic Scrollbars**: `.scholar-scrollbar` webkit styling with 6px track and subtle thumb mapped to `var(--theme-fg)/20`.
- **Pinterest-Inspired Destructive Interactions**: Standalone `#E60023` red text `Delete` buttons on project cards and confirmation modals with clear typography and zero distracting glyphs.

---

## 📦 Database & Migrations

Database schema and security policies are managed via Supabase:
```bash
# Push migrations to the linked Supabase project (project ref: gfjhsijrwodjvkisouzw)
SUPABASE_ACCESS_TOKEN=<your-personal-access-token> npx supabase db push

# Or authenticate interactively via CLI
npx supabase login
npx supabase db push
```

---

## 🌓 Strict Day / Night Theming System
Scholar Core replaces muddy legacy themes with a high-contrast, toggleable Day/Night engine:
- **Night Mode (ChatGPT-Inspired True Dark)**:
  - Sidebar: Pure deep black (`#000000`) with subtle `1px` right border (`#262626`).
  - Canvas: Deep neutral gray (`#171717`) with elevated cards at (`#212121`).
  - Typography: Crisp white primary text (`#ECECEC`) and muted secondary text (`#9B9B9B`). Zero muddy navy or blue tints.
  - Buttons: Solid white pill buttons (`#FFFFFF`) with deep black text and active scaling micro-animations.
- **Day Mode (Sand & Snow Academic Aesthetic)**:
  - Canvas: Warm sand canvas (`#F7F5F0`).
  - Cards & Sidebar: Elevated pure white cards (`#FFFFFF`) with soft drop shadows (`--shadow-card`).
  - Typography: Deep charcoal primary text (`#111111`) and secondary text (`#666666`).
  - Buttons: Solid black pill buttons (`#000000`) with pure white text.
- **Theme Switcher**: An interactive Sun/Moon button anchored in the bottom of the Left Sidebar dynamically toggles `data-theme="light"` / `data-theme="dark"` and persists choices in `localStorage['scholar-theme']`.

---

## 🎨 Design System & Typography

Scholar Core features a warm, modern, Airbnb-inspired design system with geometric sans-serif typography (`Plus Jakarta Sans` & `Manrope`), generous leading for academic long-form reading, sentence-case tags, and WCAG AA/AAA certified contrast (82/82 pairings passing).
- **Specification Document**: [`docs/AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md`](docs/AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md)

---

## 📄 License & Attribution
Scholar Core © 2026. All rights reserved.
