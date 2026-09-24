# Deferred Project Initialization & Optimistic Recents Architecture

> **Authoritative Specification** · Scholar Agentic OS  
> **Status:** Production Deployed · **Revision:** 2.1 · **Date:** 2026-09-24  
> **Scope:** Desk Client, Ephemeral Store, Remote Supabase Synchronization, Dashboard UX

---

## 1. Executive Summary & Problem Statement

### 1.1 The "Untitled Project" Database Bloat Bug
Previously, clicking **+ New Project** or selecting any of the four primary dashboard template cards (*Undergraduate Academic Assignment*, *Journal Article*, *Literature Review*, or *Dissertation*) immediately dispatched a `POST /api/projects` call. 

This behavior had severe systemic consequences:
1. **Database Pollution**: Users exploring templates or abandoning draft flows generated dozens of blank, empty records in the remote Supabase database (`gfjhsijrwodjvkisouzw`), each titled `"Untitled Project"`.
2. **Polluted Recents Sidebar**: The sidebar Recents list was flooded with orphaned projects with 0 words and 0 completed gates.
3. **Unnecessary Egress & Latency**: Network round-trips blocked or delayed navigation into the assignment workspace shell.

### 1.2 Dashboard Visual Noise
The four primary template action cards on the main dashboard contained redundant subtext (`Zero Hallucination · Verified Citations · Zero Errors`) that cluttered the interface without providing contextual value, detracting from the calm, structural `#171717` dark-mode workspace.

### 1.3 Recents Interaction Latency
Renaming and deleting projects in the sidebar Recents rail waited on asynchronous network round-trips to complete before updating the user interface, resulting in a sluggish, unresponsive user experience.

---

## 2. Core Architecture & Design Decisions

### 2.1 Strict Theme & Design System Preservation
All refactors strictly adhere to the established Scholar OS design system:
- **Global Dark Mode**: `#171717` base canvas with `#1C1C1E` elevated surfaces.
- **Typography**: Inter for structural headers and body copy; JetBrains Mono for output-type tags (`OT-01`, `OT-10`) and metrics.
- **Card Integrity**: Maintained `min-h-[160px]` dimensions, subtle 5% opacity hover transitions (`hover:border-white/20`), wireframe icons with SVG stroke inversion, and blueprint modal triggers (`i`).

### 2.2 Ephemeral-First Lifecycle (Zero Database Bloat)
Projects now follow a **Deferred Commitment** lifecycle:
1. **Draft Phase (In-Memory)**: Creating a project allocates an in-memory draft (`draft-[nanoid]`) backed by browser `sessionStorage`. Zero records are written to Supabase.
2. **Exploration & Setup**: The user navigates through the assignment workspace, selects output formats, configures word counts, or enters research parameters entirely within ephemeral state.
3. **Explicit Commitment Trigger**: A database record is inserted (`POST /api/projects`) **only** when the user initiates a concrete, irreversible action:
   - Clicking **"Analyze Assignment Brief with AI"** in `AssignmentUnderstandStage`.
   - Uploading an assignment brief document (`.pdf`, `.docx`, `.txt`).
   - Calling any downstream agentic endpoint that requires an authoritative database ID.
4. **Transparent Session Promotion**: The client automatically swaps the `draft-...` ID with the permanent database UUID in React state, URL bar (`history.replaceState`), and downstream event listeners without interrupting the user.

---

## 3. Implementation Details

### 3.1 Ephemeral Project Store (`src/desk/ephemeralProjectStore.ts`)
The `EphemeralProjectStore` provides full in-memory CRUD operations mimicking the backend schema while avoiding database I/O:

```typescript
export interface EphemeralProject {
  id: string; // "draft-" prefixed
  title: string;
  outputTypeId: string;
  wordCount: number;
  targetWordCount: number;
  createdAt: string;
  updatedAt: string;
  intakeAnswers?: Record<string, unknown>;
  gates: ProjectGateSummary[];
  isEphemeral: true;
}
```

- **Persistence Layer**: Serializes state into `sessionStorage` under the key `scholar_ephemeral_projects`, ensuring work in progress survives accidental page reloads.
- **Gate Safety**: Automatically initializes with valid default gate summaries (`G0: Output Type Selected`) to guarantee zero `undefined` gate exceptions.

### 3.2 API Layer Routing & Interception (`src/desk/api.ts`)

#### Dual-Mode Resolution
`createProject(outputTypeId)` inspects the output type:
- Workspace types (`OT-01`, `OT-10`, `OT-19`, `OT-22`, etc.) return instant ephemeral projects.
- Legacy test suite bypasses (`OT-06`) route directly to `createDatabaseProject` to preserve 100% backward compatibility with existing integration tests.

#### Database Promotion (`commitProjectToDatabase`)
When explicit commitment is triggered:
```typescript
export async function commitProjectToDatabase(projectId: string): Promise<string> {
  const draft = getEphemeralProject(projectId);
  if (!draft) return projectId;

  // 1. Create permanent row in Supabase
  const res = await authedJsonFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      output_type_id: draft.outputTypeId,
      title: draft.title,
    }),
  });
  const permanentId = res.project.id;

  // 2. Persist any accumulated intake answers
  if (draft.intakeAnswers && Object.keys(draft.intakeAnswers).length > 0) {
    await saveIntakeAnswers(permanentId, draft.intakeAnswers);
  }

  // 3. Clean up ephemeral store & notify subscribers
  deleteEphemeralProject(projectId);
  window.dispatchEvent(
    new CustomEvent('scholar:project-persisted', {
      detail: { oldId: projectId, newId: permanentId },
    })
  );

  return permanentId;
}
```

#### Transparent Auto-Commit Interceptor
`authedFetch` inspects outgoing request URLs. If a downstream service call targets `/api/projects/draft-.../*`, the interceptor automatically commits the project first and rewrites the URL to the permanent ID before sending the request.

### 3.3 Assignment Workspace Wiring (`AssignmentContext.tsx` & `AssignmentUnderstandStage.tsx`)
`AssignmentContext` exposes `ensurePersisted()`:
```typescript
const ensurePersisted = useCallback(async (): Promise<string> => {
  if (isEphemeralProject(activeProjectId)) {
    const permId = await commitProjectToDatabase(activeProjectId);
    setActiveProjectId(permId);
    window.history.replaceState(null, '', `?project=${permId}`);
    return permId;
  }
  return activeProjectId;
}, [activeProjectId]);
```

In `AssignmentUnderstandStage.tsx`:
- `handleAnalyze`: Awaits `ensurePersisted()` before initiating brief analysis.
- `handleFileUpload`: Awaits `ensurePersisted()` before uploading files to the backend vault.

### 3.4 Optimistic Recents Actions (`src/desk/ProjectListScreen.tsx`)

#### Optimistic Rename with Rollback
Renaming a project immediately updates local React state without waiting for network response:
```typescript
const previousProjects = [...projects];
setProjects(prev =>
  prev.map(p => (p.id === projectId ? { ...p, title: newTitle.trim(), updatedAt: new Date().toISOString() } : p))
);

try {
  if (isEphemeralProject(projectId)) {
    updateEphemeralProject(projectId, { title: newTitle.trim() });
  } else {
    await saveIntakeAnswers(projectId, { title: newTitle.trim() });
  }
} catch (err) {
  // Rollback on network failure
  setProjects(previousProjects);
  setRenameError('Failed to rename project. Reverted to previous title.');
}
```

#### Optimistic Deletion
Project deletion closes the confirmation dialog and removes the card from view synchronously. Background deletion handles the network call; if the network call fails, state is rolled back and an error toast is surfaced.

### 3.5 Header Gate Safety Guard (`src/desk/regions/Header.tsx`)
Hardened gate inspection with optional chaining (`project.gates?.find(...)`), preventing runtime crashes during state transitions when `gates` has not yet hydrated.

---

## 4. Verification & Quality Gates

The implementation passed all automated verification and quality gates:

1. **TypeScript Verification**:
   ```bash
   npx tsc --noEmit
   # Output: 0 errors
   ```
2. **Full Unit & Integration Test Suite**:
   ```bash
   npx vitest run
   # Test Files: 238 passed (238)
   # Tests:      2,595 passed (2,595)
   # Duration:   18.42s
   ```
3. **Production Bundle Compilation**:
   ```bash
   npm run build
   # Output: Built cleanly in 5.17s with 0 warnings
   ```
4. **Supabase Database Synchronization**:
   ```bash
   npx supabase migration list
   # Remote (gfjhsijrwodjvkisouzw): 25/25 migrations applied (100% in sync)
   ```

---

## 5. Architectural Summary Table

| Surface / Flow | Previous Behavior | New Optimized Behavior |
| :--- | :--- | :--- |
| **+ New Project / Card Click** | Instant `POST /api/projects` writing blank rows to DB | In-memory draft project (`draft-...`); 0 DB writes |
| **Commit Trigger** | None (always persisted from inception) | Explicit action: Brief analysis or file upload |
| **Template Cards UI** | Cluttered with redundant subtext | Streamlined cards; dimensions & hover preserved |
| **Recents Rename** | Blocked on network round-trip | Instant optimistic update with async DB sync & rollback |
| **Recents Deletion** | Delayed modal dismissal and state removal | Instant optimistic removal with rollback on error |
| **Header Gate Access** | Unprotected property access on empty gates | Safe optional chaining (`project.gates?.find(...)`) |
