# Pocket API Testing Guide

This guide walks through testing the Pocket mobile API endpoints end-to-end.

## Prerequisites

1. **Database schema applied**: Follow POCKET_DEPLOYMENT.md Step 1 to apply schema_pocket.sql to Supabase
2. **Environment variables set**: Ensure .env has all Supabase credentials (see POCKET_DEPLOYMENT.md Step 2)
3. **Dev server running**: `npm run dev` (port 3000)

## Test Workflow

### 1. Get authentication token

You need a valid JWT token from Supabase to test authenticated endpoints.

**Option A: Via browser**
1. Open http://localhost:3000 in browser
2. Sign up or login
3. Open DevTools → Application → Cookies or Local Storage
4. Find the Supabase auth token (usually in localStorage as `supabase.auth.token`)
5. Copy the JWT value

**Option B: Via curl + Supabase API**
```bash
# Get a test user's JWT (requires service_role key)
curl -X POST https://your-project.supabase.co/auth/v1/token \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "password",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. Test approval queue endpoint

**Get queue statistics:**
```bash
curl -X GET http://localhost:3000/api/pocket/projects/PROJECT_ID/approval-queue \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "projectId": "PROJECT_ID",
  "stats": {
    "total": 5,
    "approved": 2,
    "rejected": 1,
    "pending": 2
  }
}
```

**Submit approval decision:**
```bash
curl -X POST http://localhost:3000/api/pocket/projects/PROJECT_ID/approve-source \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "sourceId": "source-123",
    "decision": "approved"
  }'
```

Expected response:
```json
{
  "success": true,
  "approval": {
    "id": "uuid",
    "project_id": "PROJECT_ID",
    "source_id": "source-123",
    "user_decision": "approved",
    "decided_at": "2026-08-04T12:00:00Z"
  },
  "message": "Source approved"
}
```

Test all three decision types:
```bash
# Reject
curl -X POST http://localhost:3000/api/pocket/projects/PROJECT_ID/approve-source \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"sourceId": "source-124", "decision": "rejected"}'

# Defer
curl -X POST http://localhost:3000/api/pocket/projects/PROJECT_ID/approve-source \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"sourceId": "source-125", "decision": "deferred"}'
```

### 3. Test comments endpoint

**Create a comment:**
```bash
curl -X POST http://localhost:3000/api/pocket/documents/DOC_ID/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "text": "This paragraph needs citation",
    "sectionId": "section-1"
  }'
```

Expected response:
```json
{
  "comment": {
    "id": "uuid",
    "text": "This paragraph needs citation",
    "section_id": "section-1",
    "created_at": "2026-08-04T12:00:00Z",
    "user_id": "uuid"
  }
}
```

**Get all comments for a document:**
```bash
curl -X GET http://localhost:3000/api/pocket/documents/DOC_ID/comments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "comments": [
    {
      "id": "uuid",
      "text": "This paragraph needs citation",
      "section_id": "section-1",
      "created_at": "2026-08-04T12:00:00Z",
      "resolved": false,
      "user_id": "uuid"
    }
  ],
  "total": 1
}
```

**Update a comment (resolve it):**
```bash
curl -X PATCH http://localhost:3000/api/pocket/comments/COMMENT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"resolved": true}'
```

### 4. Test chat streaming endpoint

**Stream chat response (Server-Sent Events):**
```bash
curl -N -X POST http://localhost:3000/api/pocket/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "projectId": "PROJECT_ID",
    "messages": [
      {
        "role": "user",
        "content": "How should I approach the literature review?"
      }
    ]
  }'
```

The `-N` flag tells curl to not buffer output, so you see streaming responses in real-time.

Expected response (Server-Sent Events format):
```
data: {"token":"The"}
data: {"token":" "}
data: {"token":"literature"}
data: {"token":" "}
data: {"token":"review"}
data: {"token":"..."}
data: [DONE]
```

**Get chat history:**
```bash
curl -X GET http://localhost:3000/api/pocket/chat/PROJECT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "How should I approach the literature review?",
      "created_at": "2026-08-04T12:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "The literature review should...",
      "created_at": "2026-08-04T12:00:05Z"
    }
  ],
  "total": 2
}
```

### 5. Test push notifications endpoint

**Register for push notifications:**
```bash
curl -X POST http://localhost:3000/api/pocket/push/subscribe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "subscription": {
      "endpoint": "https://push.example.com/endpoint/123",
      "keys": {
        "auth": "auth_key_here",
        "p256dh": "p256dh_key_here"
      }
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Subscription registered"
}
```

### 6. Test offline sync endpoint

**Sync queued actions:**
```bash
curl -X POST http://localhost:3000/api/pocket/sync/actions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "actions": [
      {
        "type": "approve",
        "projectId": "PROJECT_ID",
        "sourceId": "source-200",
        "decision": "approved"
      },
      {
        "type": "comment",
        "docId": "DOC_ID",
        "text": "Offline comment",
        "sectionId": "section-2"
      }
    ]
  }'
```

Expected response:
```json
{
  "synced": 2,
  "failed": 0,
  "total": 2
}
```

## Error Testing

### Missing/invalid token
```bash
curl -X GET http://localhost:3000/api/pocket/projects/PROJECT_ID/approval-queue \
  -H "Authorization: Bearer invalid_token"
```

Expected response:
```json
{
  "error": "Invalid or expired token"
}
```

### Missing body data
```bash
curl -X POST http://localhost:3000/api/pocket/documents/DOC_ID/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

Expected response:
```json
{
  "error": "Comment text required"
}
```

### Project access denied
```bash
# Try to approve source in a project you don't own
curl -X POST http://localhost:3000/api/pocket/projects/OTHER_USER_PROJECT_ID/approve-source \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"sourceId": "source-999", "decision": "approved"}'
```

Expected response:
```json
{
  "error": "Project not found or access denied"
}
```

## Browser-based testing

### Test with Insomnia/Postman

1. Import the Postman collection template below:
```json
{
  "info": {
    "name": "Pocket API Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Queue Stats",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          }
        ],
        "url": {
          "raw": "http://localhost:3000/api/pocket/projects/{{project_id}}/approval-queue",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["api", "pocket", "projects", "{{project_id}}", "approval-queue"]
        }
      }
    }
  ]
}
```

2. Set variables:
   - `jwt_token`: Your Supabase JWT
   - `project_id`: A project ID you own

### Test with Pocket UI

1. Open http://localhost:3000/pocket (or whatever path renders PocketShell)
2. Click "Start Reviewing" button
3. Approve/reject/defer a source
4. Verify data persists in Supabase (check pocket_approvals table)
5. Check browser console for any errors

## Database verification

After testing, verify data in Supabase:

```sql
-- Check approvals
SELECT * FROM pocket_approvals ORDER BY decided_at DESC LIMIT 10;

-- Check comments
SELECT * FROM pocket_comments ORDER BY created_at DESC LIMIT 10;

-- Check chat messages
SELECT * FROM pocket_chat_messages ORDER BY created_at DESC LIMIT 10;

-- Check RLS is working (these should be empty for other users)
SELECT * FROM pocket_approvals WHERE user_id != current_user_id();
```

## Performance testing

Test with many items:

```bash
# Create 100 approval decisions
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/pocket/projects/PROJECT_ID/approve-source \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -d "{\"sourceId\": \"source-$i\", \"decision\": \"approved\"}"
done
```

Monitor:
- Response times should be < 200ms for each request
- Concurrent requests should not cause conflicts
- Database indexes should speed up queue stats query

## Troubleshooting

### 401 Unauthorized
- JWT token may be expired, get a new one
- Token may be malformed, copy-paste carefully
- Supabase service_role key might be wrong

### 500 Internal Server Error
- Check server console for error message
- Verify DATABASE_URL is set correctly
- Check Supabase connection is alive
- Verify schema_pocket.sql was successfully applied

### Queries take > 1 second
- Check indexes exist in Supabase: `pocket_approvals(project_id)`, etc.
- Run `ANALYZE pocket_approvals;` to update query planner stats
- May need to add more specific indexes

### RLS blocking legitimate queries
- Verify user has correct UUID
- Check RLS policies allow the operation
- Test with service_role key to bypass RLS
