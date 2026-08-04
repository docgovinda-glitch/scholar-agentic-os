# Scholar Agentic OS — Final Deployment Plan

Complete checklist for deploying Pocket mobile experience to production.

## ✅ Pre-Deployment Checklist

- [x] Pocket API backend built (9 endpoints)
- [x] React integration hooks created (4 hooks)
- [x] Database schema file ready (schema_pocket.sql)
- [x] Auth middleware implemented
- [x] All code compiled (npm run lint passes)
- [x] Documentation complete
- [x] CI/CD pipeline configured
- [x] Environment variables set in .env

---

## DEPLOYMENT TIMELINE

### Phase 1: Supabase Database Setup (15 min - USER ACTION)
**You do this manually in Supabase dashboard**

**Steps:**
1. Open https://app.supabase.com and login
2. Select your Scholar Agentic OS project
3. Click **SQL Editor** in the left sidebar
4. Click **+ New Query** button
5. Open `supabase/schema_pocket.sql` from your repo
6. Copy the entire file contents
7. Paste into the SQL Editor
8. Click **Run** (or Cmd+Enter / Ctrl+Enter)
9. Wait for success message
10. Verify 4 tables created:
    - `pocket_approvals`
    - `pocket_comments`
    - `pocket_chat_messages`
    - `pocket_push_subscriptions`

**Expected output:**
```
Query successful (ran 23 commands)
```

---

### Phase 2: Local Testing (1-2 hours)
**You test locally before deploying to production**

**Prerequisites:**
- Supabase schema applied (from Phase 1)
- Dev server running: `npm run dev`
- Terminal with curl or Postman

**Test Checklist:**

1. **Approval Queue Endpoint**
   ```bash
   # Get queue stats
   curl http://localhost:3000/api/pocket/projects/PROJECT_ID/approval-queue \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```
   Expected: Queue statistics with totals

2. **Comments Endpoint**
   ```bash
   # Create a comment
   curl -X POST http://localhost:3000/api/pocket/documents/DOC_ID/comments \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"text": "Test comment", "sectionId": "section-1"}'
   ```
   Expected: Comment created with UUID

3. **Chat Streaming**
   ```bash
   curl -N -X POST http://localhost:3000/api/pocket/chat/stream \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"projectId": "PROJECT_ID", "messages": [{"role": "user", "content": "test"}]}'
   ```
   Expected: Server-Sent Events stream

4. **UI Integration Test**
   - Open http://localhost:3000/pocket (or your navigation path)
   - Click "Start Reviewing"
   - Approve/reject/defer a source
   - Check browser console for errors
   - Verify data appears in Supabase `pocket_approvals` table

**Troubleshooting:**
- If auth fails: Make sure you have a valid JWT token from Supabase session
- If database error: Check DATABASE_URL in .env is correct
- If tables not found: Re-run schema_pocket.sql in Supabase

**Reference:** See POCKET_TESTING.md for detailed testing guide

---

### Phase 3: Production Deployment (30-60 min)
**Automatic deployment via GitHub → Render**

**Steps:**

1. **Push code to GitHub**
   ```bash
   git push origin claude/remaining-project-tasks-ok41cg
   ```
   This triggers GitHub Actions workflow

2. **Monitor CI/CD Pipeline**
   - Go to https://github.com/docgovinda-glitch/scholar-agentic-os
   - Click **Actions** tab
   - Watch the workflow run:
     - Checkout code ✓
     - Install dependencies ✓
     - Build (npm run build) ✓
     - Lint (npm run lint) ✓
     - Test (npm test) ✓
     - Deploy to Render ✓

3. **Render Deployment**
   - GitHub Actions automatically triggers Render deploy via webhook
   - Render rebuilds and deploys your app
   - Takes 2-5 minutes typically
   - Check Render dashboard: https://dashboard.render.com

4. **Verify Production**
   - Open your production domain: https://scholar.gkshah.com.np
   - Navigate to Pocket mobile UI
   - Test approval queue endpoint works
   - Test creating a comment
   - Test chat streaming
   - Monitor browser console for errors

---

## DEPLOYMENT COMMANDS

**To deploy to production:**

```bash
# Ensure all changes are committed
git status

# Push to the deploy branch (auto-deploys to Render)
git push origin claude/remaining-project-tasks-ok41cg

# Monitor deployment:
# 1. GitHub Actions: github.com/docgovinda-glitch/.../actions
# 2. Render Dashboard: dashboard.render.com
```

**To verify deployment logs:**
```bash
# Render shows deployment logs automatically
# Check for errors in:
# 1. Build logs (npm run build)
# 2. Start logs (npm run dev on Render)
# 3. Runtime logs (stderr/stdout during requests)
```

---

## POST-DEPLOYMENT VERIFICATION

After deploying to Render, test these critical paths:

### 1. Approval Queue (Primary Feature)
- [ ] Click "Start Reviewing" in Pocket home
- [ ] Source card appears
- [ ] Approve/reject/defer button works
- [ ] Data persists (check Supabase table)
- [ ] Move to next source or see "All sources reviewed"

### 2. Comments (Secondary Feature)  
- [ ] View a document in ReadView
- [ ] Add a comment on a section
- [ ] Comment appears in comment thread
- [ ] Can resolve comment
- [ ] Data persists in Supabase

### 3. Chat (Optional for MVP)
- [ ] Open AskView
- [ ] Type a question
- [ ] Assistant responds with streaming text
- [ ] Message history loads on refresh
- [ ] Works on mobile viewport

### 4. Offline Functionality (Optional for MVP)
- [ ] DevTools → Network → Go offline
- [ ] Queue an approval decision
- [ ] Go back online
- [ ] Auto-sync should occur
- [ ] Check browser console for sync logs

### 5. Error Handling
- [ ] Navigate to non-existent project (should 404)
- [ ] Try to access other user's project (should 403)
- [ ] Disconnect network mid-request (should handle gracefully)

---

## ROLLBACK PROCEDURE

If production deployment fails:

**Option 1: Revert to previous commit**
```bash
# Find the previous working commit
git log --oneline | head -5

# Revert to it
git revert HEAD
git push origin claude/remaining-project-tasks-ok41cg

# This will auto-deploy the revert
```

**Option 2: Disable Pocket routes temporarily**
Edit `server/routes/index.ts` and comment out:
```typescript
// export { registerPocketRoutes } from "./pocket.ts";
```

Then in `server.ts` comment out:
```typescript
// registerPocketRoutes(app);
```

Push to redeploy without Pocket routes.

**Option 3: Manual Render restart**
- Go to Render dashboard
- Click your service
- Click "Manual Deploy" button
- Re-runs the last successful deployment

---

## MONITORING & SUPPORT

### After Deployment

**Monitor these metrics:**
- Error logs (Render dashboard)
- API response times (should be < 200ms)
- Database connection pool status
- SSL certificate validity

**Check for issues:**
```bash
# Render logs page will show:
# 1. Build errors (if npm run build fails)
# 2. Runtime errors (if server crashes)
# 3. Request logs (stderr output from server)
```

**Common Production Issues:**

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | Check Render logs, may need restart |
| 401 Unauthorized | Verify SUPABASE_SERVICE_ROLE_KEY is set in Render env |
| 500 Database Error | Check DATABASE_URL connection string |
| Chat streaming timeout | May need to increase Render timeout settings |
| High latency | Check database connection pooling limits |

---

## ENVIRONMENT VARIABLES (Render)

Verify these are set in Render dashboard under "Environment":

- `DATABASE_URL` = your Supabase connection string
- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key

**Render connects these automatically from GitHub Secrets if configured.**

---

## SUCCESS CRITERIA

Deployment is successful when:

1. ✅ GitHub Actions workflow completes without errors
2. ✅ Render deployment shows "Live"
3. ✅ Production domain responds to requests
4. ✅ Pocket approval queue works end-to-end
5. ✅ Comments can be created and persisted
6. ✅ Chat streaming responds with text
7. ✅ No 500 errors in Render logs
8. ✅ Database queries execute in < 200ms

---

## FINAL CHECKLIST

Before declaring "shipped":

- [ ] Phase 1 Complete: Supabase schema applied
- [ ] Phase 2 Complete: Local testing passed
- [ ] Phase 3 Complete: GitHub Actions workflow passed
- [ ] Phase 3 Complete: Render deployment successful
- [ ] Phase 4 Complete: Production verification tests passed
- [ ] Phase 5 Complete: Documentation updated with deployment date

---

## TIMELINE

- **Phase 1 (Supabase)**: 15 minutes
- **Phase 2 (Testing)**: 1-2 hours
- **Phase 3 (Deploy)**: 30-60 minutes
- **Total**: 2-3 hours for complete deployment

---

## SUPPORT

If you encounter issues:

1. Check POCKET_TESTING.md for API testing examples
2. Check POCKET_DEPLOYMENT.md for detailed setup guide
3. Check Render logs for errors
4. Check Supabase SQL Editor for schema errors
5. Check browser console for client-side errors

---

**Status**: Ready for deployment 🚀

**Last Updated**: 2026-08-04  
**Branch**: `claude/remaining-project-tasks-ok41cg`  
**Estimated Completion**: 2-3 hours from now
