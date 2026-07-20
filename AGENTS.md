# Doctoral Research & Journal Publication Assistant

This project is an AI-powered assistant designed to support PhD scholars and academic researchers in writing, citing, checking compliance, and managing literature for journal publication.

---

## 🛠 Tech Stack

*   **Frontend**: React 19 (TypeScript), Vite, Tailwind CSS (v4), Framer Motion (`motion`), Lucide React (icons)
*   **Backend**: Node.js & Express.js (runs Vite dev middleware in development, serves static assets in production)
*   **AI Integration**: `@google/genai` (Gemini SDK) with client/server proxy routing. Includes fallback providers (Ollama, custom OpenAI-compatible endpoints)
*   **Document Parsers**: `mammoth` (Word/DOCX extraction), `pdf-parse` (PDF parsing), `xlsx` (Excel sheets processing)

---

## 📁 Repository Structure

*   [`server.ts`](file:///Users/pobpkf/antigravity/Doctoral-Research-and-Journal-Publication-Assistant/server.ts): Express server implementing file parsing endpoints, user authentication stubs, and unified AI prompting routes with exponential backoff and retries.
*   [`src/App.tsx`](file:///Users/pobpkf/antigravity/Doctoral-Research-and-Journal-Publication-Assistant/src/App.tsx): Core React component managing routing/tabs, layout, and state synchronization.
*   [`src/types.ts`](file:///Users/pobpkf/antigravity/Doctoral-Research-and-Journal-Publication-Assistant/src/types.ts): Data models representing projects, citation items, workflow phases, cost metrics, and user profiles.
*   [`src/components/`](file:///Users/pobpkf/antigravity/Doctoral-Research-and-Journal-Publication-Assistant/src/components):
    *   `ThesisReader.tsx` / `KnowledgeVaultManager.tsx`: Interfaces for reading, parsing, and searching uploaded documents.
    *   `ResearchIntakeWizard.tsx`: Guides users in setting up a research topic, hypotheses, and scope.
    *   `ManuscriptDraftingWorkspace.tsx` / `ManuscriptEditorWorkspace.tsx`: Collaborative environments for editing manuscript drafts with AI assistance.
    *   `AIControlCenter.tsx` / `AISetupWizard.tsx`: Interfaces to manage LLM providers, endpoints, and generation settings.
    *   `VedicDatabase.tsx`: Custom module for searching and incorporating ancient text references.
*   [`src/services/`](file:///Users/pobpkf/antigravity/Doctoral-Research-and-Journal-Publication-Assistant/src/services):
    *   `aiGateway.ts` & `aiService.ts`: Manage communications with the Express LLM proxy endpoint.
    *   `citationService.ts`: Standardizes formatting of research citations (APA 7th, IEEE, etc.).
    *   `knowledgeVaultService.ts`: Local/server storage utility for managing literature databases.

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+) and npm.

### Installation
```bash
npm install
```

### Run Locally (Development)
Create a `.env` file based on `.env.example` containing your `GEMINI_API_KEY`, then run:
```bash
npm run dev
```
This command starts the TSX Express server (`server.ts`) on port `3000`, which wraps Vite's dev server and handles the API requests.

### Production Build
```bash
npm run build
npm start
```

---

## 🎨 Coding Guidelines & Preferences

1.  **Tailwind CSS (v4)**: Use Tailwind CSS classes for styling. Avoid styling components with raw inline styles or custom style sheets unless absolutely necessary.
2.  **TypeScript Safety**: Strictly type-check all variables, function arguments, and component props. Make sure models defined in [`src/types.ts`](file:///Users/pobpkf/antigravity/Doctoral-Research-and-Journal-Publication-Assistant/src/types.ts) are strictly adhered to.
3.  **LLM Failure Resiliency**: When editing server interactions with LLMs, always use the retry/backoff middleware (`generateContentWithRetry` in `server.ts`) to avoid breaking when hit with `429 Too Many Requests` or `503 Service Unavailable` exceptions.
4.  **Preserve Context**: Always retain existing inline documentation, comments, and docstrings.
5.  **SPA Routing & History Compatibility**: When adding or updating top-level views or tabs, always synchronize states (`onboardingStep`, `viewMode`, `activeTab`) with the URL hash (`window.location.hash`). Listen to `hashchange` to preserve browser Back & Forward button navigation.
6.  **Robust JSON Parsing**: Always parse LLM text responses using brace-extracting helper logic (e.g. searching for `{` and `}`) to extract valid JSON blocks, preventing parser crashes caused by LLM conversational preambles.
7.  **Academic Reference Formatting Compliance**: Ensure citation rendering systems automatically normalize cases (e.g. cleaning ALL-CAPS inputs) and format author lists, journals, volumes, issues, and page ranges in strict compliance with APA 7th, IEEE, MLA 9th, Chicago, Harvard, and Vancouver styles.

---

## 🏛 Senior Research Architect Directives

*   **Role & Persona**: Senior Research Architect for the 'Doctoral Research and Journal Publication Assistant'. Facilitate high-level academic production by managing a ten-phase research workflow. Act as a scholarly research collaborator, proposing structural improvements to code while maintaining a scholarly tone.
*   **Academic Integrity**: All outputs must prioritize originality. When drafting, query the 'Knowledge Vault' first to ensure theoretical alignment with Vedic Samhitas and specific IR frameworks.
*   **Technical Resilience**: Always implement the AI Gateway with exponential backoff. Do not sacrifice code quality for speed.
*   **Constraint Adherence**: Strictly follow the user's specific formatting requirements (e.g., no 'Limitations' or 'Final Statement' sections in specific chapters).
*   **Workflow Management**: Actively track the 10-phase progression. Map user tasks to their current phase and highlight dependencies.

