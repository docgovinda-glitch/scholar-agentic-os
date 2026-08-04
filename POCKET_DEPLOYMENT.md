# Pocket API Deployment Guide

This guide covers deploying the Pocket mobile API backend (approval queue, comments, chat, offline sync) to Supabase and testing locally.

## Step 1: Apply Database Schema to Supabase

1. Open your Supabase project dashboard: https://app.supabase.com
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase/schema_pocket.sql`
5. Paste into the SQL editor
6. Click **Run** (or Cmd+Enter / Ctrl+Enter)

**What this creates:**
- `pocket_approvals` table: Tracks user approval/rejection/deferral decisions on sources
- `pocket_comments` table: Document section comments with threading support
- `pocket_chat_messages` table: Conversation history for Scholar OS assistant
- `pocket_push_subscriptions` table: Web Push API subscription endpoints
- Row Level Security (RLS) policies restricting access to user's own data
- Indexes on commonly-queried columns for performance

## Step 2: Verify Environment Variables

Your `.env` file should have:

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres:password@your-project.supabase.co:5432/postgres?schema=public
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Getting these values:**
1. Go to Supabase project **Settings → API**
2. Copy **Project URL** → `VITE_SUPABASE_URL`
3. Copy **anon public** → `VITE_SUPABASE_ANON_KEY`
4. Copy **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`
5. For `DATABASE_URL`:
   - Click **Connection Pooling** (below API keys)
   - Copy the connection string
   - Replace `[PASSWORD]` with your database password
   - Append `?schema=public` to the end

## Step 3: Test Pocket API Locally

### Start the dev server:
```bash
npm run dev
```

The server should start on http://localhost:3000.

### Test approval endpoint (with curl):

```bash
# Create a test project first via the project API, then:

curl -X POST http://localhost:3000/api/pocket/projects/YOUR_PROJECT_ID/approve-source \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "sourceId": "source-123",
    "decision": "approved"
  }'
```

**To get a JWT token for testing:**
1. Sign up/login via the Scholar OS UI at http://localhost:3000
2. Open browser DevTools → Application → Cookies
3. Find the Supabase auth cookie and copy the JWT value
4. Or use: `curl -X POST http://localhost:3000/api/auth/login` to get a token

### Test comment endpoint:

```bash
curl -X POST http://localhost:3000/api/pocket/documents/YOUR_DOC_ID/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "text": "This source needs better justification",
    "sectionId": "section-1"
  }'
```

### Test chat streaming:

```bash
curl -X POST http://localhost:3000/api/pocket/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "messages": [
      {
        "role": "user",
        "content": "How should I approach this literature review?"
      }
    ]
  }'
```

Response will be Server-Sent Events (SSE) format:
```
data: {"token":"The"}
data: {"token":" "}
data: {"token":"literature"}
...
data: [DONE]
```

## Step 4: Wire UI Components to Backend

The Pocket UI components in `src/pocket/` need to be updated to use the new API hooks:

### In ApprovalQueueView.tsx:
```tsx
import { useApprovalQueue } from "../hooks/usePocketApi";

export function ApprovalQueueView({ projectId }: Props) {
  const { queueStats, submitDecision, loading } = useApprovalQueue(projectId);

  const handleApprove = async (sourceId: string) => {
    await submitDecision(sourceId, "approved");
  };

  return (
    // Render approval cards with submitDecision callback
  );
}
```

### In ReadView.tsx:
```tsx
import { useDocumentComments } from "../hooks/usePocketApi";

export function ReadView({ docId }: Props) {
  const { comments, addComment, updateComment } = useDocumentComments(docId);

  const handleAddComment = async (text: string) => {
    await addComment(text, sectionId);
  };

  return (
    // Render document with comment thread
  );
}
```

### In AskView.tsx:
```tsx
import { usePocketChat } from "../hooks/usePocketApi";

export function AskView({ projectId }: Props) {
  const { messages, sendMessage, loading } = usePocketChat(projectId);

  const handleSend = async (text: string) => {
    await sendMessage(text);
  };

  return (
    // Render chat interface with streaming messages
  );
}
```

## Step 5: Test End-to-End Workflow

1. **Create a project** via Desk UI or API
2. **Add sources** to the approval queue
3. **Open Pocket UI** on mobile or responsive mode
4. **Approve/reject sources** from approval queue
5. **Add comments** to document sections
6. **Chat with Scholar OS** assistant
7. **Go offline** (DevTools → Network → Offline)
8. **Queue actions** while offline (approvals, comments)
9. **Go online** and verify sync happens automatically

## Troubleshooting

### "Cannot find module" errors
- Ensure `DATABASE_URL` env var is set
- Check that `SUPABASE_SERVICE_ROLE_KEY` is in `.env`
- Run `npm run lint` to verify TypeScript compilation

### "Invalid or expired token" auth errors
- Verify JWT token is from current Supabase session
- Check that `SUPABASE_SERVICE_ROLE_KEY` is correct
- Ensure user has permission to access the project

### Database queries fail
- Verify schema_pocket.sql was successfully applied
- Check that `DATABASE_URL` connection string is correct
- Verify row level security (RLS) policies allow the operation

### Chat streaming doesn't work
- Check browser console for fetch errors
- Verify Server-Sent Events header is being set
- Ensure `Accept: text/event-stream` header is sent by client

## API Reference

### Approval Queue
- **POST** `/api/pocket/projects/:projectId/approve-source`
  - Body: `{ sourceId: string, decision: "approved" | "rejected" | "deferred" }`
  - Returns: `{ success: boolean, approval: ApprovalRecord }`

- **GET** `/api/pocket/projects/:projectId/approval-queue`
  - Returns: `{ projectId: string, stats: { total, approved, rejected, pending } }`

### Comments
- **POST** `/api/pocket/documents/:docId/comments`
  - Body: `{ text: string, sectionId?: string }`
  - Returns: `{ comment: PocketComment }`

- **GET** `/api/pocket/documents/:docId/comments`
  - Returns: `{ comments: PocketComment[], total: number }`

- **PATCH** `/api/pocket/comments/:commentId`
  - Body: `{ text?: string, resolved?: boolean }`
  - Returns: `{ comment: PocketComment }`

### Chat
- **POST** `/api/pocket/chat/stream`
  - Body: `{ projectId: string, messages: ChatMessage[] }`
  - Returns: Server-Sent Events stream with tokens

- **GET** `/api/pocket/chat/:projectId`
  - Returns: `{ messages: ChatMessage[], total: number }`

### Push Notifications
- **POST** `/api/pocket/push/subscribe`
  - Body: `{ subscription: PushSubscription }`
  - Returns: `{ success: boolean, message: string }`

### Offline Sync
- **POST** `/api/pocket/sync/actions`
  - Body: `{ actions: QueuedAction[] }`
  - Returns: `{ synced: number, failed: number, total: number }`

## Next Steps

1. ✅ Backend API built (all 9 endpoints)
2. ✅ Database schema created
3. ✅ Auth middleware implemented
4. ⏳ Wire UI components to use new hooks
5. ⏳ Test approval workflow end-to-end
6. ⏳ Test comment creation and threading
7. ⏳ Test chat streaming with real Claude API
8. ⏳ Test offline queue and background sync
9. ⏳ Deploy to production (Render)
