# Scholar Core — The Agentic Scientific Operating System

**Scholar Core** is an enterprise-grade academic research, thinking, writing, and verification operating system. Built for researchers, postgraduates, and undergraduate scholars, it replaces generic AI text generation with deterministic evidence ledgers, adversarial multi-agent peer review, and human-centered academic workspaces.

---

## 🏛️ The 6 Dedicated Academic Workspaces

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

6. **✨ Academic Text Humanizer (`OT-07`)**:
   - **Side-by-Side Stylometric Studio**: *AI Marker & Cliché Diagnostic → Scholarly Register & Author Persona Calibration → Asymmetric Sentence Burstiness & Rhythm Tuning → Epistemic Hedging → Provenance Grounding Gate*.

---

## 🔐 Source Library & Zero Document Storage Architecture

In compliance with **Revision 2 / Document 43 Rev 5**, Scholar Core operates under a strict **Zero Document Storage Policy**:
- **Zero Full-Text Retention**: Scholar Core does NOT store full proprietary PDFs, copyrighted manuscripts, or full paper texts on its servers.
- **Verifiable Citation & Metadata Pointers**: The Source Library retains only structured cryptographic metadata, canonical references, DOIs, URLs, and client-authorized cloud storage pointers.
- **Reference Manager Integrations**:
  - **Zotero Web API**: Direct two-way sync for collections, tags, and DOI metadata.
  - **Mendeley & BibTeX**: Instant batch parsing of `.bib` records into structured Canonical References.
  - **Cloud Drives**: Direct one-click authentication and indexing from Google Drive and Microsoft OneDrive.
  - **DOI & Web Scraping**: Live CrossRef / DataCite metadata lookup and client-side extraction.
- **Retraction Scanning**: Automated Crossref and OpenAlex retraction radar for flagging compromised citations in real time.

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

## 📦 Database & Migrations

Database schema and security policies are managed via Supabase:
```bash
# Verify and push migrations to Supabase
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push
```

---

## 📄 License & Attribution
Scholar Core © 2026. All rights reserved.
