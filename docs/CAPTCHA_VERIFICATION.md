# CAPTCHA Configuration Verification Guide

## Overview

Scholar Core uses Cloudflare Turnstile for CAPTCHA protection on signup and password reset flows. This document outlines the configuration requirements and verification steps needed before production deployment.

## Current Configuration Status

✅ **Frontend Components Implemented:**
- CaptchaWidget component renders Turnstile widget
- VITE_CAPTCHA_SITE_KEY configured for public key exposure
- Widget rendering conditional on environment variable presence

✅ **Backend Verification Implemented:**
- /api/auth/verify-signup endpoint verifies CAPTCHA tokens
- CAPTCHA_SECRET_KEY used for server-side verification
- Verification blocks signup if token is missing/invalid

✅ **Database Configuration:**
- No modifications needed for CAPTCHA (security controlled at auth layer)

## Required Verification Before Production

### 1. Cloudflare Turnstile Setup
- [ ] Create or access Cloudflare account with domain access
- [ ] Go to Cloudflare Turnstile dashboard
- [ ] Create a new Turnstile site for production domain
- [ ] Verify domain is correctly registered (e.g., scholar.gkshah.com.np)
- [ ] Note the Site Key (VITE_CAPTCHA_SITE_KEY) and Secret Key (CAPTCHA_SECRET_KEY)

### 2. Environment Variables Deployment
- [ ] Set VITE_CAPTCHA_SITE_KEY in `.env` (or build-time env)
  - Must match the Turnstile site key for your production domain
  - Will be exposed in browser (this is correct for public key)
  
- [ ] Set CAPTCHA_SECRET_KEY in server environment
  - Must match the Turnstile secret key
  - Never expose to browser or version control
  - Used by /api/auth/verify-signup endpoint

### 3. Testing on Production Domain

**Critical:** CAPTCHA widgets only work on their registered domain. Testing must happen on the actual production domain, not localhost or staging subdomains.

#### Test Checklist:

1. **Widget Rendering**
   - [ ] Navigate to signup page on production domain
   - [ ] Verify Turnstile challenge loads and displays
   - [ ] Challenge should show appropriate difficulty level
   - [ ] If widget fails to load, check browser console for errors

2. **Challenge Completion**
   - [ ] Complete the CAPTCHA challenge
   - [ ] Observe token generation in network tab
   - [ ] Token should be passed to /api/auth/verify-signup

3. **Server Verification**
   - [ ] Complete signup flow with valid CAPTCHA token
   - [ ] Verify account creation succeeds
   - [ ] Check server logs for verification success
   - [ ] Test with invalid/expired tokens - should fail appropriately

4. **Error Handling**
   - [ ] Disable CAPTCHA_SECRET_KEY temporarily
   - [ ] Attempt signup with valid challenge token
   - [ ] Should show clear error message (not crash app)
   - [ ] Re-enable SECRET_KEY and verify signup works

5. **Cross-Browser Testing**
   - [ ] Test on Chrome (has Local Network Access restrictions)
   - [ ] Test on Firefox
   - [ ] Test on Safari
   - [ ] Verify widget displays consistently

## Known Limitations & Considerations

### Chrome Local Network Access (LNA)
- Chrome 142+ (released Oct 28, 2025) enforces LNA restrictions
- If local runners are used alongside CAPTCHA on production domain:
  - User will see LNA permission prompt when accessing local runners
  - This is expected and separate from CAPTCHA
  - Resolved by user granting permission or configuring CORS headers

### Domain-Specific Registration
- Turnstile site must be registered for each domain used:
  - Production: `scholar.gkshah.com.np`
  - Staging: `staging.scholar.gkshah.com.np` (if different)
  - Development: localhost won't work in Turnstile

### Configuration Changes
- Changing production domain requires new Turnstile site setup
- Old keys will stop working after cutover
- Plan domain migration carefully with Turnstile reconfiguration

## Files Involved

- **Frontend:**
  - `src/desk/auth/CaptchaWidget.tsx` - Renders Turnstile widget
  - `src/desk/auth/AuthFlow.tsx` - SignUpScreen and ForgotScreen use widget
  - `src/services/captchaService.ts` - Configuration detection

- **Backend:**
  - `server/routes/auth.ts` - /api/auth/verify-signup endpoint
  - `server/src/middleware/captchaVerify.ts` - Token verification logic

- **Configuration:**
  - `.env.example` - Documents required variables
  - Cloudflare dashboard - CAPTCHA site and key management

## Rollback Plan

If CAPTCHA fails in production:

1. **Immediate (keep site online):**
   - Unset VITE_CAPTCHA_SITE_KEY environment variable
   - Widget will not render (gracefully degrades)
   - Signup continues without CAPTCHA
   - Allows users to register while investigating issue

2. **Investigation:**
   - Check Cloudflare Turnstile dashboard for site health
   - Verify SECRET_KEY configuration on server
   - Check browser console for widget loading errors
   - Review /api/auth/verify-signup server logs

3. **Recovery:**
   - After resolving, re-enable by setting VITE_CAPTCHA_SITE_KEY
   - Redeploy frontend to pick up new env var
   - Verify widget loads and challenges work

## Additional Resources

- Cloudflare Turnstile Docs: https://developers.cloudflare.com/turnstile/
- Turnstile Widget Documentation: https://developers.cloudflare.com/turnstile/features/web-platform/

## Status Checklist Before Production Launch

- [ ] Cloudflare Turnstile site created for production domain
- [ ] VITE_CAPTCHA_SITE_KEY obtained and noted
- [ ] CAPTCHA_SECRET_KEY obtained and noted
- [ ] Environment variables deployed to production
- [ ] Widget rendering verified on production domain
- [ ] Challenge completion verified
- [ ] Token verification verified via API logs
- [ ] Error handling tested
- [ ] Cross-browser compatibility verified
- [ ] Monitoring/alerting set up for /api/auth/verify-signup failures
- [ ] Rollback plan documented and team trained
