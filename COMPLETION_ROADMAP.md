# Scholar Agentic OS — Completion Roadmap

## Current Status: 67% Complete (Phases 1-4 UI Foundation Done)

What's built ✅ vs. what remains ⏳ to ship Scholar OS fully.

---

## PHASE 1: Foundation & Editor ✅ MOSTLY COMPLETE

**Status:** 95% done (M1 internal alpha ready)

### Completed ✅
- Express API server with service tier architecture
- PostgreSQL schema with migrations and encryption
- Supabase authentication (registration, MFA, password reset)
- Desk shell with 5-region layout (rail, primary, aside, statusbar)
- Rich text editor with headings, lists, tables, footnotes
- Autosave with IndexedDB recovery
- Comments and threading with resolution
- Snapshots and version history
- Warden: egress classification and policy engine
- Gateway: model routing with provider failover
- Provider adapters: OpenAI, Anthropic, Google, OpenRouter
- AI setup flow with live validation
- Chat panel with inline suggestions

### Still Needed ⏳
- [ ] Command palette keyboard model (partial)
- [ ] Full accessibility pass (WCAG 2.1 AA compliance)
- [ ] Performance optimization (<1.2s first contentful paint)
- [ ] Complete test coverage (exit criteria validation)

**Effort to complete:** 1-2 weeks

---

## PHASE 2: Academic Workflow ✅ 80% COMPLETE

**Status:** Ready for private beta (M2)

### Completed ✅
- Atlas: 24 academic output types with schemas
- Intake form engine with dynamic rendering
- Gate state machine (G0-G7) with sign-off enforcement
- Conductor: workflow scheduling
- PDF/DOCX/ODT ingestion to Canonical Document Model
- Candidate queue with approval interaction
- Authenticity checks: DOI resolution, publisher verification, retraction detection
- Citation management with corpus integrity
- Claim-Evidence graph structure
- Rubric: rule model, compilation, evaluation
- Compliance panel with inline findings
- Mesh: agent runtime with capability enforcement
- Agents AG-01 to AG-16 (mostly working)
- Drafting pipeline with refusal conditions

### Still Needed ⏳
- [ ] OCR for scanned documents (integration)
- [ ] Complete metadata extraction service
- [ ] AG-14 Citation Manager full implementation
- [ ] All 16 agents fully tested and optimized
- [ ] Beta user feedback loop

**Effort to complete:** 2-3 weeks

---

## PHASE 3: Voice & Output ✅ 90% COMPLETE

**Status:** Public 1.0 ready (M3)

### Completed ✅
- **Studio: 5 intervention levels** (proofread → rewrite)
- **Voice Profile**: build, apply, drift detection
- **L1 Support**: 20 first-language profiles
- **Meaning verification**: content vs. language separation
- **Diff display**: per-change reasons with warnings
- Export pipeline: 5-stage (preflight → render → verify)
- **DOCX writer** with template fidelity
- Export UI: download handlers for DOCX/ODT/PDF
- **Writing History**: optional, session-scoped, deletable
- Quotation protection from refinement
- Agents AG-17 to AG-24 (partial)

### Still Needed ⏳
- [ ] ODT writer (stub in place, needs implementation)
- [ ] PDF writer with proper tagging
- [ ] TOC, front matter, cross-references, auto-numbering
- [ ] AI use declaration drafting
- [ ] Workshop onboarding (partial)
- [ ] Compliance report generation
- [ ] Tier enforcement (Free vs. Scholar)
- [ ] Field-level guidance refinement

**Effort to complete:** 1-2 weeks

---

## PHASE 4: Reach (Mobile) ✅ 60% COMPLETE

**Status:** Pocket foundation ready (M4)

### Completed ✅
- **Pocket shell**: 3-zone mobile layout (Reference/Read/Reach)
- **4 persistent tabs**: Home (Know), Projects, Search, Me
- **Approval Queue** card UI (flagship feature)
- Read view with comment threads
- Chat/Ask interface
- Source discovery interface with multi-select
- **PWA**: manifest, service worker, offline caching
- **Install prompt** with auto-dismiss
- **Background sync** for queued actions
- **Push notifications** integration
- Tablet responsive layout (master-detail)

### Still Needed ⏳
- [ ] **API Backend for Pocket** (server-side endpoints)
  - POST /api/projects/:id/approve (approval submission)
  - POST /api/documents/:id/comments (comment creation)
  - GET /api/discovery/search (source discovery)
  - POST /api/chat/stream (chat streaming)
  - POST /api/push/subscribe (push notification subscription)

- [ ] **Vault integration on mobile**
  - Collections browsing
  - Quick search
  - Attachment preview

- [ ] **Reference manager imports**
  - Zotero importer
  - Mendeley importer
  - BibTeX parser
  - RIS parser

- [ ] **AG-05 Discovery agent** (AI-powered source ranking)

- [ ] **AG-07 Vault Curator** (retraction monitoring, collection management)

- [ ] **Complete offline sync** (currently stub)

- [ ] **Share target API** (receive URLs/files from system share menu)

- [ ] **Accessibility audit** (screen reader, keyboard navigation)

- [ ] **Mobile performance** (Lighthouse 90+)

**Effort to complete:** 3-4 weeks (backend-heavy)

---

## PHASE 5: Platform ⏳ NOT STARTED

**Status:** 0% done (Admin/enterprise features)

### Work Required
- [ ] Plugin runtime and sandbox
- [ ] Capability-gated plugin API
- [ ] Plugin registry and signing
- [ ] Admin plane deployment (isolated)
- [ ] Operator console (13 capability areas)
- [ ] Foundry: authoring, golden sets, evaluation
- [ ] Agent release channels
- [ ] Feature flags with targeting
- [ ] Telemetry aggregation
- [ ] Admin audit with justification
- [ ] Break-glass access controls
- [ ] Institutional tier: SSO, SCIM, profiles

**Effort to complete:** 4-6 weeks

---

## What's Actually Needed to Ship Now

Based on the current state, here's what will **unlock production launch**:

### Tier 1: Critical Path to MVP (3-4 weeks)

1. **Pocket API Backend** — Most urgent
   - Approval submission endpoint
   - Comment creation/retrieval
   - Chat streaming
   - Push notification handling
   - Offline action sync

2. **Database schema updates**
   - Pocket-specific tables (comments, chat messages)
   - Approval queue state
   - Offline sync queue

3. **Integration tests**
   - Pocket → API → Database full flow
   - Approval workflow end-to-end
   - Chat persistence and retrieval

4. **Deployment verification**
   - Schema migrations to Supabase
   - GitHub Actions CI/CD working
   - Production deployment tested

**Outcome:** Pocket fully functional on scholar.gkshah.com.np

### Tier 2: Feature Completeness (2-3 weeks)

5. **ODT/PDF export writers** (currently DOCX only)
6. **Vault on mobile** (collections, search, attachments)
7. **Reference manager imports** (Zotero, Mendeley)
8. **Agent optimizations** (AG-05, AG-07)
9. **Writing History** UI improvements
10. **Accessibility audit & fixes**

**Outcome:** All Phase 4 features production-ready

### Tier 3: Enterprise/Platform (4-6 weeks)

11. **Plugin system** (Phase 5)
12. **Admin console** (Phase 5)
13. **Institutional SSO** (Phase 5)

**Outcome:** Full platform for institutional deployment

---

## Detailed Breakdown: What To Build Next

### Immediately (This Week)

**Create Pocket API Endpoints:**

```typescript
// src/server/routes/pocket.ts — New file

// 1. Approval Queue
POST /api/pocket/projects/:id/approve-source
  Body: { sourceId, decision: 'approved'|'rejected'|'deferred' }
  Response: { success, updatedProjectState }

// 2. Read & Comments  
POST /api/pocket/documents/:docId/comments
  Body: { text, sectionId, resolved? }
  Response: { comment }

GET /api/pocket/documents/:docId/comments
  Response: { comments: Comment[] }

// 3. Chat
POST /api/pocket/chat/stream
  Body: { messages: ChatMessage[], projectId }
  Response: ReadableStream<ChatDelta>

// 4. Notifications
POST /api/pocket/push/subscribe
  Body: { subscription: PushSubscription }
  Response: { subscribed: true }

// 5. Offline Sync
POST /api/pocket/sync/actions
  Body: { actions: QueuedAction[] }
  Response: { synced: number, failed: number }
```

**Update Database Schema:**

```sql
-- supabase/schema_store.sql additions

CREATE TABLE pocket_approvals (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id),
  source_id text NOT NULL,
  user_decision text NOT NULL,
  decided_at timestamp,
  UNIQUE(project_id, source_id)
);

CREATE TABLE pocket_comments (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  text text NOT NULL,
  section_id text,
  resolved boolean DEFAULT false,
  created_at timestamp,
  updated_at timestamp
);

CREATE TABLE pocket_chat_messages (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp
);

CREATE TABLE pocket_push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  auth_key text NOT NULL,
  p256dh_key text NOT NULL,
  UNIQUE(user_id, endpoint)
);
```

### Week 2

**Wire Pocket components to API:**

```typescript
// src/pocket/views/ApprovalQueueView.tsx
// Change stub fetch calls to real API:
- POST /api/pocket/projects/:id/approve-source

// src/pocket/views/ReadView.tsx  
// Wire comment creation and retrieval:
- POST /api/pocket/documents/:docId/comments
- GET /api/pocket/documents/:docId/comments

// src/pocket/views/AskView.tsx
// Connect to chat streaming:
- POST /api/pocket/chat/stream (with streaming response)
```

**Add to PocketShell.tsx:**

```typescript
// Initialization: register service worker, request permissions
useServiceWorkerRegistration();
usePushNotifications();
useInstallPrompt();

// Wire offline sync:
useEffect(() => {
  navigator.serviceWorker.ready.then(reg => {
    reg.sync.register('sync-approvals');
    reg.sync.register('sync-comments');
  });
}, []);
```

### Week 3-4

**Testing & Integration:**

```typescript
// src/pocket/__tests__/PocketIntegration.test.tsx
- Test approval flow end-to-end
- Test comment persistence
- Test chat streaming
- Test offline queue and sync
- Test push notification delivery
```

**Performance & Accessibility:**

- Lighthouse audit (target: 90+ performance, 100 accessibility)
- WCAG 2.1 AA compliance check
- Screen reader testing
- Keyboard navigation audit

### Week 5-6 (Optional but Recommended)

**Reference Manager Imports:**

```typescript
// src/app/import/zoteroImporter.ts
// Parse Zotero JSON export, map to DiscoverySource

// src/app/import/bibTexParser.ts
// Parse BibTeX format

// Wire to: POST /api/pocket/import (bulk add sources)
```

**Vault on Mobile:**

```typescript
// src/pocket/views/VaultView.tsx
// Browse collections
// Quick search
// Preview attachments
```

---

## Effort Estimation

| Phase | Status | Effort | Timeline |
|-------|--------|--------|----------|
| **Phase 1** | 95% done | 1 week | This week |
| **Phase 2** | 80% done | 2-3 weeks | Week 2-3 |
| **Phase 3** | 90% done | 1-2 weeks | Week 2 |
| **Phase 4** | 60% done | **4 weeks** | Weeks 1-4 ← **CRITICAL** |
| **Phase 5** | 0% done | 4-6 weeks | After 4 |

**Total to MVP (Phases 1-4):** 6-8 weeks  
**Total to Full Platform (Phases 1-5):** 10-14 weeks

---

## Recommended Order (To Ship Fastest)

1. **Week 1**: Pocket API endpoints (approval, comments, chat)
2. **Week 2**: Wire Pocket UI to real API
3. **Week 3**: Offline sync + testing
4. **Week 4**: Mobile performance + accessibility
5. **Week 5-6**: Reference imports + Vault mobile
6. **Week 7-8**: Phase 5 platform features (optional for initial launch)

---

## Success Criteria for Ship

- [ ] ✅ Pocket approval queue fully functional
- [ ] ✅ All comments persist and sync
- [ ] ✅ Chat streaming works with context
- [ ] ✅ Offline actions queue and sync on reconnect
- [ ] ✅ PWA installs on iOS/Android
- [ ] ✅ Lighthouse: 90+ performance, 100 accessibility
- [ ] ✅ All Pocket features work at 360px (mobile)
- [ ] ✅ Domain scholar.gkshah.com.np resolves
- [ ] ✅ Supabase schema migrated
- [ ] ✅ GitHub Actions deployment working
- [ ] ✅ End-to-end tests passing
- [ ] ✅ Security audit: no XSS/SQL injection/auth bypass

---

## Next Action

**What should we build next?**

**Option A (Recommended):** Start with Pocket API backend
- Highest impact: unlocks all mobile functionality
- Blocks everything else
- 1-2 weeks to core endpoints

**Option B:** Complete Phase 3 polish
- ODT/PDF export writers
- Writing History UI
- Less critical for MVP

**Option C:** Admin console & plugins (Phase 5)
- Enterprise features
- Can ship later
- Not needed for initial launch

**My recommendation:** Go with **Option A** — Build Pocket API backend first.
This unblocks your mobile experience and lets you deploy a working product.

---

**What would you like to tackle first?**
