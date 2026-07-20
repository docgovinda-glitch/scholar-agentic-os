# UI Architecture Report

## Executive Summary

The frontend is a React SPA using Tailwind CSS v4 with hash-based navigation. The application follows a phased workflow pattern (A-I) with dedicated workspace tabs for each major function.

---

## 1. Component Catalog

### 1.1 Core Components

| Component | Purpose | State Sources |
|-----------|---------|-------------|
| `App.tsx` | Root application wrapper, AuthProvider consumer, hash navigation | `user`, `project`, `viewMode`, `activeTab`, `onboardingStep` |
| `ErrorBoundary.tsx` | React error boundary wrapper | Renders on component errors |
| `LoginScreen.tsx` | Login form UI | Uses `useAuth()` hook |
| `OnboardingWizard.tsx` | Multi-step onboarding flow | `onboardingStep`, `aiSettings`, `knowledgeVault` |
| `CommandPalette.tsx` | Keyboard-triggered command palette (Ctrl+K) | `isCommandPaletteOpen` state |

### 1.2 Phase Workspace Components

| Component | Phase | Purpose | Key Props/State |
|-----------|-------|---------|-----------------|
| `ResearchIntakeWizard.tsx` | A | Research input collection | `project`, `setProject` |
| `GroundingMapDisplay.tsx` | B | Dissertation grounding visualization | `project.groundingMap` |
| `DataDiscoveryPanel.tsx` | C | Data source discovery UI | `project.dataSources` |
| `JournalDiscoveryPanel.tsx` | D | Journal matching interface | `project.targetJournal` |
| `ComplianceChecklistPanel.tsx` | E | Journal requirements checklist | `project.complianceRules` |
| `ManuscriptDraftingWorkspace.tsx` | F | Section-by-section drafting | `project.sections`, `draftSection()` |
| `QualityControlSuite.tsx` | G | QC audit interface | `project.qcReport` |
| `QCBasedRedraftingSuite.tsx` | G1 | Redraft based on QC | `qcReport` |
| `ManuscriptEditorWorkspace.tsx` | G2 | Final manuscript editing | `project.sections` |
| `SubmissionPackagingSuite.tsx` | H | Cover letter & checklist | `project.submissionPack` |
| `ResearchIntelligenceDashboard.tsx` | Dashboard | Central overview/dashboard | `project`, `allProjects` |

### 1.3 Knowledge Vault Components

| Component | Purpose | Key Props/State |
|-----------|---------|-----------------|
| `ThesisReader.tsx` (KnowledgeVaultManager) | File upload & vault management | `project.knowledgeVault` |
| `VedicDatabase.tsx` | Scripture/spiritual text lookup | `includeScriptures` flag |

### 1.4 Settings & Configuration

| Component | Purpose | Key Props/State |
|-----------|---------|-----------------|
| `AIControlCenter.tsx` | AI provider/model configuration | `aiSettings` |
| `ProfileSettings.tsx` | User profile management | `user`, `setProject` |

---

## 2. Navigation Architecture

```
Hash-Based Navigation (No React Router)
========================================

#login → LoginScreen
  ↓
onboardingStep → OnboardingWizard
  ↓
#dashboard → ResearchIntelligenceDashboard
  ↓
#workspace/[tab] → App with activeTab state
    - workspace → ManuscriptDraftingWorkspace
    - vault → KnowledgeVaultManager (ThesisReader)
    - agents → (placeholder)
    - publishing → (placeholder)
    - citation → ExpertCitationEngine
    - settings → AIControlCenter + ProfileSettings
    - profile → ProfileSettings
```

**Key Observations:**
- No React Router - hash navigation provides browser history
- `onboardingStep` controls onboarding phases: login, ai-setup, knowledge-vault, workshop
- `activeTab` controls workspace tabs
- `viewMode` switches between dashboard and workspace

---

## 3. Layout System

**VERIFIED:**
- Tailwind CSS v4 classes throughout
- Single-column layout on mobile
- Tab-based navigation in workspace
- Modal overlays (PDF viewer, command palette)
- No explicit layout component hierarchy

**Layout Pattern:**
```
AuthProvider (authContext.tsx)
    ↓
App (state: user, project, viewMode, activeTab)
    ↓
Hash Navigation Listener
    ↓
Conditional Rendering:
    - !user → LoginScreen
    - onboardingStep ≠ workshop → OnboardingWizard
    - viewMode = dashboard → ResearchIntelligenceDashboard
    - viewMode = workspace → Tab Content
```

---

## 4. User Workflow Map

```
Phase A: Intake
    ResearchIntakeWizard
    - Collects: title, objectives, researchQuestions, researchGap, methodology
    - Stores in PaperProject

Phase B: Grounding
    GroundingMapDisplay
    - Shows: conceptualFramework, keyConstructs, philosophicalAnchors
    - Source: project.groundingMap

Phase C: Data Discovery
    DataDiscoveryPanel
    - Displays: dataSources array
    - Source: project.dataSources

Phase D: Journal Discovery
    JournalDiscoveryPanel
    - Shows: recommended journals with scope/fit
    - Stores: targetJournal

Phase E: Requirements
    ComplianceChecklistPanel
    - Displays: complianceRules
    - Shows: formatting, section, citation requirements

Phase F: Drafting
    ManuscriptDraftingWorkspace
    - Section selector + drafting prompts
    - Stores: sections in PaperProject

Phase G: Quality Control
    QualityControlSuite
    - ComplianceScore, RigorScore, actionableEdits
    - Source: project.qcReport

Phase G1: Redrafting
    QCBasedRedraftingSuite
    - Re-draft based on QC findings

Phase G2: Editing
    ManuscriptEditorWorkspace
    - Full editor + approve flow

Phase H: Submission
    SubmissionPackagingSuite
    - Cover letter, checklist, response to reviewers
```

---

## 5. State Ownership

**VERIFIED:**
- `AuthContext` owns: `user`, `project`, `loading`, `onboardingStep`
- `App.tsx` owns: `activeTab`, `viewMode`, `allProjects`, modal states
- Components receive state via props from App or use `useAuth()` hook
- Local component state for form inputs, loading states, selections

---

## 6. Component Dependencies

```
App.tsx
    ↓
AuthProvider (authContext.tsx)
    ↓
All components via useAuth() hook

KnowledgeVault
    ↓
knowledgeVaultService (upload, parse, chunk)
    ↓
server.ts /api/parse-file

AI Agents
    ↓
aiService (prompt building, JSON parsing)
    ↓
aiGateway (provider routing, streaming)
    ↓
server.ts /api/generate, /api/stream-generate
```

---

## 7. Architectural Review

### Large Components
**VERIFIED:**
- `App.tsx` - 1731 lines, handles routing, state, navigation, export

### Tight Coupling
**VERIFIED:**
- Components import `PaperProject` type directly
- No feature-based folder organization
- Utility functions duplicated across components

### Hash Navigation
**VERIFIED:**
- No React Router - custom hash-based implementation
- Good: No external dependency
- Risk: Non-standard patterns, potential edge cases

### Empty/Loading States
**UNKNOWN:**
- Not all components have explicit loading/empty state handling

---

## 8. Known Risks

### High
- **Monolithic App.tsx**: 1731 lines with multiple concerns
- **No React Router**: Custom navigation may have edge cases
- **Missing Components**: `agents` and `publishing` tabs have no dedicated component

### Medium
- **Direct localStorage Access**: Components read/write localStorage directly
- **No Component Tests**: Unknown test coverage for UI components

### Low
- **Tailwind Class Duplication**: Styling not using design system components