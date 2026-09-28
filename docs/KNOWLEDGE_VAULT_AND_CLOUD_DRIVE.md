# Knowledge Vault & Cloud Drive Integration Guide

Scholar Core's **Knowledge Vault** is a zero-document-storage academic repository designed to organize research sources, automate citation metadata extraction, and power deterministic AI literature review synthesis across multiple projects.

---

## 1. Zero Document Storage Architecture

In compliance with strict copyright guidelines and university research data policies:
* **Zero Full-Text Copies**: Scholar Core **never** stores full proprietary PDF files, copyrighted books, or raw manuscript documents on its servers.
* **Lightweight Cryptographic Pointers**: The Knowledge Vault retains only structured bibliographical metadata (Title, Authors, Year, Publisher/Journal, DOI, URL), client-authorized cloud storage web links, and extracted analytical key points.
* **Client-Side Resolution**: Metadata extraction and parsing occur in the researcher's browser or via secure read-only APIs without duplicating source files.

---

## 2. Cloud Drive Integrations

Scholar Core enables researchers to link their private research documents stored in **Google Drive** and **Microsoft OneDrive** directly into their project bibliographies.

### Google Drive
1. **Direct Web Launch**: Click `↗ Open Google Drive` in the modal header to navigate straight to your drive.
2. **Metadata Auto-Inference**: When selecting any document (e.g. `Govinda_Shah_CV.docx` or `Quantum_Algorithms_Paper.pdf`), Scholar Core intelligently infers:
   - **Clean Title**: Strips extensions and underscores, formatting into academic title case.
   - **Author(s)**: Extracted from filename naming conventions (e.g. `LastName, FirstName`).
   - **Publication Year**: Extracted from embedded dates or file metadata.
   - **Document Type**: Classified as Article, Book, Report, Thesis, or Webpage.
   - **Drive Web URL**: Direct clickable link opening the source in Google Drive / Google Docs.
3. **Direct Share Link Input**: Paste any Google Drive share link (`https://drive.google.com/file/d/...`) for instantaneous zero-setup intake.

---

### Microsoft OneDrive & SharePoint

#### Why Might Azure OAuth Show an Error?
If you click **Sign In with Microsoft OAuth** and receive:
```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```
This indicates that the **Azure provider** has not been enabled in the backend Supabase authentication dashboard (`Authentication -> Providers -> Azure`).

#### Zero-Setup Alternatives in Scholar Core:
You **do not need** to configure Azure OAuth to use your OneDrive sources in Scholar Core:
1. **Option 1: Paste OneDrive / SharePoint Share Link (Instant & Zero Setup — Recommended)**:
   - In OneDrive or SharePoint, click **Share** -> **Copy Link**.
   - Paste the link (`https://1drv.ms/...` or `https://<org>.sharepoint.com/...`) into the input.
   - Scholar Core instantly indexes the document reference and extracts citation metadata.
2. **Option 2: Connect Workspace Email**:
   - Enter your institutional or personal Microsoft email (`researcher@outlook.com` or university email) to associate your cloud workspace.
3. **Direct Browser Navigation**:
   - Click `↗ Open OneDrive` to launch Microsoft 365 / OneDrive directly in a new tab.

---

## 3. Projects vs. Thematic Tags (Conceptual Taxonomy)

To keep academic research organized without confusion, Scholar Core enforces a clear distinction between **Projects** and **Tags**:

| Dimension | 📁 Projects (Deliverable Workspaces) | 🏷️ Thematic Tags (Conceptual Taxonomy) |
| :--- | :--- | :--- |
| **Scholarly Purpose** | Represents a **specific manuscript, chapter, thesis, or assignment** you are writing. | Represents **cross-cutting methodologies, theories, disciplines, or paradigms**. |
| **Examples** | `Master's Thesis`, `Capstone Project`, `Nature Article Review`, `Chapter 3` | `#mixed-methods`, `#decoloniality`, `#reinforcement-learning`, `#CV`, `#systematic-review` |
| **Scope** | **Local & Deliverable-Bound**: Defines the exact boundary of what gets cited in a specific paper. | **Global & Library-Wide**: Applies across all your past, present, and future projects. |
| **In-Text Citation Role** | Sources assigned to a project are automatically loaded into that project's workbench for **inline citations** (e.g. `(Shah, 2026)`) and **reference bibliographies**. | Tags do not alter citation scope; they allow finding evidence on a concept across 10 different projects. |
| **AI Synthesis Role** | Powers **Project Drafting**, **Evidence Extraction**, and **Chapter Backgrounds**. | Powers **Cross-Disciplinary Synthesis**, **Literature Matrix Filtering**, and **Theme Discovery**. |

### Practical Workflow:
* **Assign to Project**: When you find an empirical study specifically needed for your Master's Thesis, assign it to `Master's Thesis`. In your thesis drafting workspace, this study will immediately appear in your citation dropdown and automatic bibliography.
* **Apply Tags**: Add tags like `#qualitative-interviews` and `#public-policy` to tag the methodological design and subject area. When you later write a completely different grant proposal on public policy, searching for `#public-policy` will instantly surface this paper.

---

## 4. Interactive Project Selector & Citation Integration

In the **Add Source** dialog:
1. **Automatic Ongoing Project Discovery**:
   - Queries all active research projects and assignments via `listProjects()`.
   - Populates an interactive `<select>` dropdown with all active projects.
2. **Interactive Quick-Toggle Pills**:
   - One-click toggling between `+ [Project Name]` and `✓ [Project Name] (Assigned)`.
3. **Citation & Reference Confirmation**:
   - Upon assignment, the system displays:
     > **✓ Connected to project research workbench: will be available for in-text citation and references bibliography**
4. **Storage & Persistence**:
   - Saved under `collection` and `metadata.projects` in the database.
   - Immediately available across all project workspace stages:
     - `EvidenceAnalysisStage`
     - `EvidenceExtractionStage`
     - `LiteratureMatrixModal`
     - `DraftStage` (automatic APA 7th, MLA 9th, Chicago, Harvard, IEEE, Vancouver reference generation).

---

## 5. Synthesis Matrix & Multi-Source Grounded Q&A

* **Literature Matrix (`LiteratureMatrixModal`)**:
  - Side-by-side comparative extraction of Research Question, Methodology, Key Findings, Limitations, and Project Relevance.
  - Automated continuous narrative synthesis with parenthetical citations.
  - One-click export to Markdown (`.md`), CSV (`.csv`), and BibTeX (`.bib`).
* **Ask Your Sources (`groundedSynthesisService`)**:
  - Direct grounded Q&A across selected papers with strict AI isolation boundary.
  - Analytical presets: *Compare Methodologies*, *Common Consensus*, *Gaps & Divergences*, and *Evidence Summary*.

---

## 6. Knowledge Vault UI Layout & Responsive Split-Pane Architecture

To maintain high visual quality when accessed alongside the Ask Scholar Copilot or on narrower displays:
* **Decoupled Badge & Milestone Hierarchy**:
  - The project format tag (`Journal Article`, `Assignment`, etc.) and pipeline stage badge (`Evidence intake`, `Drafting stage`) reside in an adaptive `min-w-0 flex-1` container.
  - The gate milestone indicator (`{verified}/{total} gates`) is rendered in a dedicated right-aligned pill badge with an emerald check icon (`CheckCircle2`), preventing overlap or collision in split-screen viewports.
* **Responsive Column Layout (`grid-cols-1 lg:grid-cols-2`)**:
  - Automatically collapses to a spacious single-column card view when the Vault is docked beside the AI copilot drawer, avoiding 200px column compression.
  - Dynamically scales to two balanced columns when full desktop width is available.
* **Responsive Cloud Drive Controls**:
  - Google Drive and Microsoft OneDrive accounts use responsive flex containers (`flex-col sm:flex-row`).
  - Action buttons (`Verify`, `Open Drive ↗`, `Disconnect`) wrap cleanly without leaking out of the card borders.
* **Symmetric Security Mode Cards**:
  - `Universal Cloud Sync` and `Local Device Encrypted` cards feature matching vertical heights (`h-full flex flex-col justify-between`) and aligned bottom indicators/actions (`Currently Active` status bar vs. action button).

