# Infrastructure Setup Guide

This guide walks you through the manual steps needed to complete the infrastructure authorization.

## Prerequisites

You have the following credentials saved securely:

- **Supabase Project**: gfjhsijrwodjvkisouzw
- **Supabase Database Password**: N345fmu0SLqrZE3
- **Resend API Key**: re_8135Bb8B_KhF8HTm4LQUJyHmgbh4hJDUi
- **Cloudflare Zone ID**: ebe3014aae026860cd09a75e4fa882dc
- **Cloudflare API Key**: cfk_Fhcli9pPqkHBZDBO9girVj5Z7gsBFGaJ52JiyyOaa4d0faa4
- **GitHub PAT**: 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
- **Render Service**: scholar-agentic-os (srv-d9lgbn710e5c73dl8sk0)
- **Render Deployment URL**: https://scholar-agentic-os-gynr.onrender.com

---

## STEP 4.1: Configure Render Environment Variables

**What**: Add production environment variables to your Render deployment.

**Why**: Your app needs database and API credentials to run in production.

**How**:

1. Go to: https://dashboard.render.com/
2. Click: **scholar-agentic-os** (your web service)
3. Click: **Environment** (left sidebar)
4. Click: **Edit** (top right button)
5. Update or add these environment variables:

```
DATABASE_URL=postgresql://postgres:N345fmu0SLqrZE3@db.gfjhsijrwodjvkisouzw.supabase.co:5432/postgres

SUPABASE_SERVICE_ROLE_KEY=sb_secret_AkT4uAkV4o4meeHt0meQeg_yhjtgEfN

APP_URL=https://scholar.gkshah.com.np

RESEND_API_KEY=re_8135Bb8B_KhF8HTm4LQUJyHmgbh4hJDUi

RESEND_FROM_EMAIL=noreply@gkshah.com.np

NODE_ENV=production
```

6. Click: **Save Changes**
7. Render will automatically redeploy your app with these variables

**Verify**: After 2-3 minutes, check if deployment is successful:
- Green checkmark next to your service = ✅ Success
- Deployment history shows "Deploy succeeded"

---

## STEP 4.2: Configure Cloudflare DNS

**What**: Point your domain `scholar.gkshah.com.np` to Render deployment.

**Why**: Without DNS records, your domain doesn't route traffic to your server.

**How**:

1. Go to: https://dash.cloudflare.com/
2. Select: **scholar.gkshah.com.np** (your domain)
3. Click: **DNS** (left sidebar)
4. Click: **Add record** (blue button)
5. Fill in:
   - Type: **CNAME**
   - Name: **scholar.gkshah.com.np** (or leave blank for @)
   - Content: **scholar-agentic-os-gynr.onrender.com**
   - TTL: **Auto**
   - Proxy Status: **Proxied** (orange cloud)

6. Click: **Save**

**Expected DNS Records**:
```
Type  | Name                      | Content
------|---------------------------|--------------------------------
CNAME | scholar.gkshah.com.np    | scholar-agentic-os-gynr.onrender.com
```

**Verify DNS** (takes 5-15 minutes):
```bash
# From your terminal
nslookup scholar.gkshah.com.np
# Should show: scholar-agentic-os-gynr.onrender.com

# Or check DNS propagation:
dig scholar.gkshah.com.np
```

---

## STEP 4.3: Add Custom Domain to Render

**What**: Tell Render to accept traffic for your custom domain.

**Why**: Render needs to know which domains to handle traffic for.

**How**:

1. Go to: https://dashboard.render.com/
2. Click: **scholar-agentic-os** (your web service)
3. Click: **Settings** (left sidebar, scroll down)
4. Find: **Custom Domains** section
5. Click: **Add Custom Domain**
6. Enter: `scholar.gkshah.com.np`
7. Click: **Add Domain**

**Verify**: After adding, you should see:
- Domain listed with status "Verifying"
- Then "Active" after DNS propagates (5-15 minutes)

---

## STEP 4.4: Add GitHub Secrets for CI/CD

**What**: Give GitHub access to your Render deployment key and Supabase credentials.

**Why**: GitHub Actions needs these to deploy automatically when you push code.

**How**:

1. Go to: https://github.com/docgovinda-glitch/scholar-agentic-os
2. Click: **Settings** (top navigation)
3. Click: **Secrets and variables** → **Actions** (left sidebar)
4. Click: **New repository secret** (green button)

Add these 4 secrets:

### Secret 1: RENDER_DEPLOY_KEY

**Name**: `RENDER_DEPLOY_KEY`
**Value**: 
```
[Get from Render: Dashboard → scholar-agentic-os → Settings → Deploy Hook]
```

To get this:
1. Go to: https://dashboard.render.com/
2. Click: **scholar-agentic-os**
3. Click: **Settings** (left sidebar)
4. Scroll to: **Deploy Hook** section
5. Copy the URL (looks like: `https://api.render.com/deploy/srv-...?key=...`)
6. Extract just the `key=` value (the part after `key=`)
7. Paste that as the secret value

### Secret 2: VITE_SUPABASE_URL

**Name**: `VITE_SUPABASE_URL`
**Value**: `https://gfjhsijrwodjvkisouzw.supabase.co`

### Secret 3: VITE_SUPABASE_ANON_KEY

**Name**: `VITE_SUPABASE_ANON_KEY`
**Value**: `sb_publishable_JxKCbS4Ly4gF1KtdX4s8Iw_CkkBn2W`

### Secret 4: DATABASE_URL

**Name**: `DATABASE_URL`
**Value**: `postgresql://postgres:N345fmu0SLqrZE3@db.gfjhsijrwodjvkisouzw.supabase.co:5432/postgres`

**After adding all 4**:
- You should see them listed in **Actions secrets**
- They appear as dots (hidden for security)

---

## STEP 4.5: Test Deployment

**What**: Make sure everything works end-to-end.

**How**:

1. Make a small test change to the code:
```bash
# Add a comment to a file
echo "# Test deployment" >> src/app.tsx
git add src/app.tsx
git commit -m "test: verify CI/CD deployment"
git push origin claude/remaining-project-tasks-ok41cg
```

2. Go to: https://github.com/docgovinda-glitch/scholar-agentic-os/actions
3. You should see **Deploy to Render** workflow running
4. Wait for it to complete (2-5 minutes)
5. Check Render dashboard to confirm deployment
6. Visit: https://scholar.gkshah.com.np (or https://scholar-agentic-os-gynr.onrender.com)
7. You should see your app loaded!

---

## STEP 4.6: Verify All Connections

Run this checklist:

- [ ] Render environment variables set (DATABASE_URL, RESEND_API_KEY, etc.)
- [ ] Render deployment successful (green checkmark)
- [ ] Cloudflare DNS record added (CNAME pointing to Render)
- [ ] Custom domain added to Render (status: Active)
- [ ] GitHub secrets added (4 secrets visible)
- [ ] Test deployment pushed and deployed
- [ ] Domain accessible: https://scholar.gkshah.com.np
- [ ] App loads without errors
- [ ] Database connected (check for data loading)

---

## Troubleshooting

### Domain not resolving?
```bash
# Check DNS propagation
nslookup scholar.gkshah.com.np
dig scholar.gkshah.com.np +short

# May take up to 15 minutes - check back later
```

### Render deployment failed?
- Check Render Dashboard → Logs tab
- Look for error messages
- Verify all environment variables are set
- Check DATABASE_URL format (no extra spaces)

### GitHub Actions not running?
- Make sure you're pushing to `main` or `claude/remaining-project-tasks-ok41cg` branch
- Check GitHub Actions tab for errors
- Verify RENDER_DEPLOY_KEY secret is set correctly

### Can't access the app?
- Wait 5-15 minutes for DNS to propagate
- Try: https://scholar-agentic-os-gynr.onrender.com (direct Render URL)
- Check browser console for errors
- Check Render logs for server errors

---

## Next Steps

Once all steps are complete and your app is live at **scholar.gkshah.com.np**:

1. Run tests to verify everything works
2. Monitor Render logs for any errors
3. Set up monitoring/alerts
4. Resume building Phase 5 features

**You're ready to deploy! 🚀**
