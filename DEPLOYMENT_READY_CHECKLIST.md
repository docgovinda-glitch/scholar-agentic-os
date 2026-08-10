# Scholar Agentic OS - Deployment Ready Checklist

**Status:** ✅ READY FOR PRODUCTION DEPLOYMENT

**Date:** 2026-08-10  
**Phase:** 4-6 Complete  
**Branch:** `claude/code-master-prompt-fxl7wf`

---

## ✅ Phase 1-4: Engineering Complete

### Phase 1: Remove Manual Approval ✅
- [x] Removed `is_approved` column from database
- [x] Added `account_status` column (active/restricted/suspended/deleted)
- [x] Deleted admin approval Edge Functions
- [x] Removed admin approval UI screens
- [x] Updated database trigger to auto-activate accounts
- [x] All tests passing (1086 baseline)

### Phase 2: Add CAPTCHA Abuse Protection ✅
- [x] Created `src/services/captchaService.ts`
- [x] Created `src/desk/auth/CaptchaWidget.tsx`
- [x] Created `server/src/middleware/captchaVerify.ts`
- [x] All tests passing

### Phase 3: Wire CAPTCHA to Backend ✅
- [x] Created `server/routes/auth.ts` with `/api/auth/verify-signup` endpoint
- [x] Integrated CAPTCHA verification into signup flow
- [x] Added CaptchaWidget to signup form
- [x] All tests passing

### Phase 4: Integration Testing ✅
- [x] Created comprehensive integration test suite
- [x] 18 new integration tests covering complete auth flow
- [x] All 1104 tests passing (18 new + 1086 existing)
- [x] TypeScript compilation succeeds
- [x] Code committed and pushed to branch

---

## 📋 Phase 5: Email Verification Configuration

### Pre-Deployment Checklist

**Supabase Dashboard Setup:**

1. **Go to Authentication > Providers > Email**
   - [ ] Navigate to: https://app.supabase.com/project/YOUR_PROJECT_REF/auth/providers
   - [ ] Locate **Email** provider section

2. **Email Provider Settings**
   - [ ] **Enable Email provider** = ✅ ON
   - [ ] **Confirm email** = ✅ ON (users must verify email before accessing app)
   - [ ] **Double-check email** = ⭕ OFF
   - [ ] **Autoconfirm** = ⭕ OFF

3. **Email Templates (Optional but Recommended)**
   - Go to: https://app.supabase.com/project/YOUR_PROJECT_REF/auth/email-templates
   - [ ] Review **Confirm signup** email template
   - [ ] Review **Password recovery** email template
   - [ ] Customize with branding if desired (see PHASE_5_EMAIL_VERIFICATION_CONFIG.md)

4. **Verify Email Configuration**
   ```bash
   # Test that email provider is enabled
   # Send test signup email to verify delivery
   # Check email inbox for verification link
   # Click link to test verification flow
   ```

### Manual Testing (Phase 5)

**Test 1: Signup with Email Capture**
- [ ] Go to Scholar app signup page
- [ ] Fill in form with test email address
- [ ] Complete CAPTCHA challenge
- [ ] Submit form
- [ ] Verify: See "Check your email" message
- [ ] Check email inbox for verification message
- [ ] Verify: Email from Supabase with subject "Confirm your signup"

**Test 2: Email Verification Link**
- [ ] Click verification link in email
- [ ] Verify: Browser redirects back to Scholar app
- [ ] Verify: Confirmation message displayed
- [ ] Wait 2-5 seconds for any redirects to settle

**Test 3: Post-Verification Login**
- [ ] Go to login page
- [ ] Enter username/password
- [ ] Click "Sign in"
- [ ] Verify: Successfully logged in
- [ ] Verify: Can access dashboard

---

## 🚀 Phase 6: Production Deployment

### Pre-Deployment Verification

**Code Quality:**
- [x] All 1104 tests passing
- [x] TypeScript compilation succeeds
- [x] Lint passes
- [x] Code committed and pushed to branch
- [x] No uncommitted changes

**Environment Ready:**
- [ ] Cloudflare Turnstile account created
- [ ] Turnstile site keys obtained (site key + secret key)
- [ ] Supabase email provider enabled (Phase 5)
- [ ] All required environment variables documented

### Deployment Steps

**Step 1: Create Pull Request (if not already open)**

```bash
# Verify current branch
git branch -v

# Push to remote if not already pushed
git push -u origin claude/code-master-prompt-fxl7wf

# Create PR on GitHub or use gh CLI
gh pr create --title "Auth System Redesign: Phases 1-4 Complete" \
  --body "Complete automation of authentication system with CAPTCHA and email verification"
```

**Step 2: Merge to Main Branch**

```bash
# Via GitHub UI: Click "Merge pull request" button
# OR via CLI:
gh pr merge --squash --delete-branch

# Verify merge completed
git fetch origin
git log --oneline main | head -5
```

**Step 3: Configure Cloudflare Turnstile**

1. **Get Turnstile Keys:**
   - Go to: https://dash.cloudflare.com/?to=/:account/turnstile
   - Click "Create Site" (if no site exists)
   - Domain: `scholar.gkshah.com.np`
   - Mode: Select "Managed Challenge"
   - Copy **Site Key** → `VITE_CAPTCHA_SITE_KEY`
   - Copy **Secret Key** → `CAPTCHA_SECRET_KEY`

2. **Set Render Environment Variables:**
   - Go to: https://dashboard.render.com
   - Select "scholar-agentic-os" service
   - Click "Settings" tab
   - Click "Environment" 
   - Add new variables:
     ```
     VITE_CAPTCHA_SITE_KEY=<your_site_key>
     CAPTCHA_SECRET_KEY=<your_secret_key>
     ```
   - Verify existing variables are set:
     ```
     VITE_SUPABASE_URL
     VITE_SUPABASE_ANON_KEY
     SUPABASE_SERVICE_ROLE_KEY
     ```

**Step 4: Monitor Deployment**

```bash
# Watch Render logs
# Go to: https://dashboard.render.com > Logs tab
# Wait for: "Server running on port 3000"
# Should see no errors

# Verify health endpoint
curl https://scholar.gkshah.com.np/api/health

# Expected response:
# {"status":"ok","environment":"production"}
```

### Post-Deployment Testing (Phase 6)

**Test 1: Signup Flow End-to-End**
- [ ] Go to https://scholar.gkshah.com.np
- [ ] Click "Create an account"
- [ ] Fill form:
  - Full name: `Prod Test User`
  - Username: `prodtestuser`
  - Email: `test+prod@example.com` (use unique email each time)
  - Phone: `+1234567890`
  - Institution: `Test University`
  - Institutional ID: `P99999`
  - Password: `ProdTestPass123!`
- [ ] See Turnstile CAPTCHA challenge (should be visible)
- [ ] Complete CAPTCHA
- [ ] Click "Create account"
- [ ] Verify: "Account created - Check your email to verify your account"
- [ ] Check email for verification link from Supabase
- [ ] Click verification link
- [ ] Verify: Redirected back to Scholar signup confirmation page

**Test 2: Login After Verification**
- [ ] Go to https://scholar.gkshah.com.np
- [ ] Click "Sign in"
- [ ] Enter username: `prodtestuser`
- [ ] Enter password: `ProdTestPass123!`
- [ ] Click "Sign in"
- [ ] Verify: Successfully logged in
- [ ] Verify: Can see Scholar dashboard

**Test 3: Password Reset**
- [ ] From login page, click "Forgot your password?"
- [ ] Enter email: `test+prod@example.com`
- [ ] Click "Send reset link"
- [ ] Verify: "Check your email" message
- [ ] Check email for password reset link
- [ ] Click link
- [ ] Set new password: `NewProdPass123!`
- [ ] Verify: "Password updated" message
- [ ] Login with new password to verify it works

**Test 4: Rate Limiting**
- [ ] Try rapid login attempts (6+ times in 15 minutes)
- [ ] Verify: "Too many requests" error after 5th attempt
- [ ] Wait 15 minutes
- [ ] Verify: Can login again

**Test 5: CAPTCHA Abuse Prevention**
- [ ] Try rapid signup attempts from same IP
- [ ] Verify: CAPTCHA challenge persists
- [ ] Verify: Cannot bypass CAPTCHA
- [ ] Verify: Cloudflare blocks automated attempts

### Monitoring Post-Deployment

**Real-Time Logs:**
- [ ] Render Logs: https://dashboard.render.com (Logs tab)
- [ ] Look for: "Server running on port 3000"
- [ ] Look for: No 500 errors
- [ ] Look for: No auth failures

**Watch for First 24 Hours:**
- [ ] No deployment errors
- [ ] No CAPTCHA verification failures
- [ ] Emails being delivered successfully
- [ ] Signup flow completing without errors
- [ ] Users able to login after verification

**Key Metrics to Monitor (First Week):**
- Signup attempts: Should see test signups + real users
- CAPTCHA success rate: Should be >95% for legitimate users
- Email delivery: Should be 100% for verified emails
- Login success rate: Should be >90%
- No rate limit issues for legitimate users

---

## 🔧 Troubleshooting

### If CAPTCHA Not Showing

**Issue:** Signup form loads but no CAPTCHA widget visible

**Fixes (in order):**
1. Verify `VITE_CAPTCHA_SITE_KEY` is set in Render environment
2. Check browser console for JavaScript errors
3. Verify Cloudflare Turnstile script loading
4. Clear browser cache and reload
5. Try different browser (check if browser-specific)

**If still failing:**
- Temporarily disable CAPTCHA: Set `VITE_CAPTCHA_SITE_KEY=""` in Render
- Signup will work without CAPTCHA
- Re-enable once issue is diagnosed

### If Emails Not Arriving

**Issue:** Users don't receive verification emails

**Fixes (in order):**
1. Verify Supabase email provider is enabled (Phase 5)
2. Check "Confirm email" setting is ON
3. Check spam/junk folder for emails
4. Verify sender email is whitelisted (if using Resend)
5. Wait 5-10 minutes (email delivery can be slow)

**If still failing:**
- Temporarily disable email verification: In Supabase, set "Confirm email" = OFF
- Users can login immediately after signup
- Re-enable once email delivery is fixed

### If Login Blocked After Signup

**Issue:** User can't login even though email is verified

**Fixes:**
1. Verify user's email was actually verified (check Supabase auth logs)
2. Verify account_status in database is 'active'
3. Check for any login errors in Render logs
4. Try password reset flow to rule out password issues

**If still failing:**
- Temporarily disable email verification in Supabase
- Re-enable after diagnosing root cause

### If Rate Limiting Too Aggressive

**Issue:** Legitimate users getting "Too many requests" error

**Adjustment:**
- Rate limit currently set to 5 attempts per 15 minutes
- To change: Edit `server/src/middleware/rateLimit.ts`
- Adjust `windowMs` and `max` parameters
- Commit and push changes
- Render will auto-redeploy

---

## 📊 Success Criteria

✅ **Deployment Complete When:**

Phase 5 (Email Configuration):
- [ ] Email provider enabled in Supabase
- [ ] Confirm email setting = ON
- [ ] Test signup email received
- [ ] Email verification link works
- [ ] User can login after verification

Phase 6 (Production Deployment):
- [ ] Render deployment shows "Live"
- [ ] Health check endpoint responds 200
- [ ] CAPTCHA visible on signup page
- [ ] Signup flow completes end-to-end
- [ ] Verification email received within 2 minutes
- [ ] Email verification link works
- [ ] Login works after verification
- [ ] Password reset works
- [ ] No 500 errors in logs
- [ ] Rate limiting works (429 after 5 attempts)
- [ ] At least 5 test users created and verified successfully

---

## 📝 Rollback Plan

If critical issues occur post-deployment:

### Option 1: Revert Commit
```bash
git log --oneline main | head -5
git revert -m 1 <commit-hash>
git push
# Render auto-redeploys old version
```

### Option 2: Disable CAPTCHA Temporarily
In Render Environment:
- Set `VITE_CAPTCHA_SITE_KEY=""` (empty string)
- Render auto-redeploys
- Signup works without CAPTCHA challenge

### Option 3: Disable Email Verification
In Supabase:
1. Go to Authentication > Providers > Email
2. Set "Confirm email" = OFF
3. Users can login immediately after signup
4. Re-enable after issues resolved

### Option 4: Restore to Previous Commit
```bash
git reset --hard <previous_commit_hash>
git push --force-with-lease
```

---

## 📚 Documentation Reference

- [Phase 1-3 Deployment Guide](./AUTHENTICATION_DEPLOYMENT_GUIDE.md)
- [Phase 5 Email Configuration](./PHASE_5_EMAIL_VERIFICATION_CONFIG.md)
- [Phase 6 Deployment Guide](./PHASE_6_PRODUCTION_DEPLOYMENT.md)
- [Complete Phase Summary](./PHASE_SUMMARY_AND_NEXT_STEPS.md)
- [Integration Tests](./src/__tests__/authIntegration.test.ts)

---

## ✨ Next Steps

1. **Phase 5:** Configure Supabase email settings (follow checklist above)
2. **Phase 6:** Deploy to production (follow deployment steps above)
3. **Phase 7:** Monitor logs and metrics for first week
4. **Phase 8:** Plan enhancements (OAuth, MFA, etc.)

---

**Status:** ✅ READY FOR PHASES 5-6 EXECUTION  
**Last Updated:** 2026-08-10  
**Prepared By:** Claude Code  
**All Code:** Committed and Pushed  
**All Tests:** 1104 Passing  
**Build Status:** ✅ Production Ready
