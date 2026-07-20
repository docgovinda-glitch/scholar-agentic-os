# State Management and Persistence Architecture Report

## Executive Summary

The application uses a dual persistence strategy: React Context for runtime state management and localStorage for persistence. State flows through auth context → project updates → localStorage → App migration → restoration on reload.

---

## 1. Complete State Flow Diagram

```
Project Creation
    ↓
DEFAULT_STATE(username)
    - Creates PaperProject with default fields
    - Sets aiSettings.provider to "gemini"
    ↓
Auth Context (authContext.tsx)
    - AuthProvider wraps App
    - user, project, loading, onboardingStep in React state
    ↓
Profile Persistence
    - localStorage key: `${PROFILE_STATE_PREFIX}${username}` → UserProfile
    - LocalStorage key: `phd_active_session_username` → current user
    - LocalStorage key: `phd_profiles_meta` → list of usernames
    ↓
App Migration
    - useEffect detects missing usageLogs/costMetrics/modelPreferences
    - Updates project with defaults
    ↓
Project Updates
    - updateProject() merges changes
    - Saves to localStorage immediately
    - Dispatches `scholar_project_updated` event (T002 Complete)
    - Updates both projectState and projects[] array
    ↓
Export
    - handleExportLaTeX() generates LaTeX blob
    - Direct download from browser memory
```

---

## 2. State Management Components

### 2.1 Auth Context (`src/auth/authContext.tsx`)

**Purpose:** React Context for authentication and project state.

**State:**
```typescript
const [user, setUser] = useState<string | null>(null);
const [project, setProject] = useState<PaperProject | null>(null);
const [loading, setLoading] = useState<boolean>(false);
const [onboardingStep, setOnboardingStepState] = useState<OnboardingStep>("login");
```

**Persistence Logic:**
- Loads from localStorage on mount: `phd_profile_state_${username}` → UserProfile
- Saves on login/logout/signup/activate
- Onboarding step persisted to profile JSON
- Updates immediately via localStorage.setItem()

### 2.2 App Component State (`src/App.tsx`)

**Local State:**
```typescript
const [activeTab, setActiveTab] = useState<...>("workspace");
const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
const [viewMode, setViewMode] = useState<...>("dashboard");
const [allProjects, setAllProjects] = useState<PaperProject[]>([]);
```

**Migration Logic (lines 220-251):**
- Adds missing fields: aiSettings, usageLogs, costMetrics, modelPreferences
- Triggers on user/project change

**Update Logic (lines 253-284):**
- Merges partial updates
- Persists to localStorage
- **Dispatches `scholar_project_updated` event with updated project** (T002)

### 2.3 localStorage Keys

| Key | Purpose | Type |
|-----|---------|------|
| `phd_active_session_username` | Current logged-in user | string |
| `phd_profile_state_${username}` | UserProfile JSON | UserProfile |
| `phd_profiles_meta` | List of all usernames | { profilesList: string[] } |

---

## 3. PaperProject State Model

Located in `src/types.ts` (lines 537-613):

**Core Fields:**
- Identity: id, title
- Research: objectives, researchQuestions, researchGap, methodology, field, keywords
- Settings: preferredJournalScope, articleType, styleAspiration, aiSettings
- Authors: authorDetails, authorName, orcidId, affiliation, email, coAuthor fields

**Phase Outputs:**
- groundingMap: GroundingMap
- dataSources: DiscoveredDataSource[]
- targetJournal: RecommendJournal
- complianceRules: ComplianceRules
- sections: Record<string, string> (section keys to text)
- qcReport: QCReport
- submissionPack: SubmissionPack

**Analytics:**
- usageLogs: Array of task execution records
- costMetrics: { totalCost, totalCalls }
- modelPreferences: per-task model selection

**Versioning:**
- versions: ProjectVersion[]
- responseHistory: ResponseLogItem[]

---

## 4. Architecture Review

### 4.1 Multiple Sources of Truth
**VERIFIED:**
- `project` in AuthContext
- `projectState` in UserProfile (localStorage)
- `projects[]` array in UserProfile (localStorage)
- `allProjects` in App state (memory only)

**RISK:** Potential inconsistency between projectState and projects[] array.

### 4.2 State Synchronization
**VERIFIED:**
- Hash-based navigation synchronizes URL with state
- `scholar_project_updated` event listener exists and dispatcher implemented (T002 Complete)

**Event Contract (T002):**
- Event name: `scholar_project_updated`
- Payload: PaperProject object (the updated project)
- Dispatch location: `updateProject()` in App.tsx
- Listener location: App.tsx (lines 127-139)
- Purpose: Notify components of project state updates

### 4.3 Persistence Strategy
**VERIFIED:**
- Immediate localStorage writes on every update
- No debounce or batching
- No error handling for localStorage quota exceeded

**RISK:**
- Race conditions possible with rapid updates
- No backup mechanism if localStorage fails

### 4.4 Migration Strategy
**VERIFIED:**
- Client-side schema migration in App component
- Adds missing fields with defaults
- No version tracking in project state

**RISK:** No persisted schema version - migrations run on every load if fields missing.

---

## 5. Event Flow Map

```
URL Hash Changes
    ↓
hashchange event
    ↓
parseAndApplyHash()
    - Updates onboardingStep
    - Updates viewMode
    - Updates activeTab

State Changes
    ↓
setProject() / setOnboardingStep()
    ↓
Auth Context state updated
    ↓
App hears: scholar_project_updated (T002 - DISPATCHER ADDED)
    ↓
App updateProject()
    - Updates React state via setProject()
    - Persists to localStorage
    - Dispatches CustomEvent with updated project
    ↓
All components receive updated project state
```

**Note:** The event dispatcher was added to `updateProject()` in T002. However, the listener in the same component will receive its own dispatched events. This is intentional - it ensures localStorage->React state synchronization is consistent.

---

## 6. Export / Import Architecture

**Export:**
- `handleExportLaTeX()` in App.tsx (lines 83-125)
- Generates LaTeX from sections
- Creates Blob and triggers download
- **No import mechanism found**

---

## 7. Known Risks

### Critical
- **No Import Flow**: Export to LaTeX exists but no import capability

### High
- **No Schema Versioning**: Migration runs on every session if fields missing
- **LocalStorage Errors**: No handling for quota exceeded or unavailable storage

### Medium
- **Race Conditions**: No debouncing on rapid state updates
- **Memory State Duplication**: allProjects in App duplicates localStorage data

### Low
- **Session Persistence**: No explicit session expiration handling

---

## 8. Remaining Unknowns

- Whether there are additional persistence mechanisms in other files
- How server-side persistence is intended to work
- Whether IndexedDB is planned for future use