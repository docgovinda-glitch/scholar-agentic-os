# Infrastructure Reference Card

## Quick Setup Status

| Component | Status | Link |
|-----------|--------|------|
| GitHub Repo | ✅ Connected | https://github.com/docgovinda-glitch/scholar-agentic-os |
| Local .env | ✅ Created | `/home/user/scholar-agentic-os/.env` |
| Build | ✅ Passing | `npm run build` |
| Supabase | ✅ Connected | https://gfjhsijrwodjvkisouzw.supabase.co |
| Render | ⏳ Needs Config | https://dashboard.render.com/scholar-agentic-os |
| Cloudflare DNS | ⏳ Needs Config | https://dash.cloudflare.com/ |
| GitHub Actions | ✅ Ready | `.github/workflows/deploy.yml` |
| GitHub Secrets | ⏳ Needs Config | GitHub → Settings → Secrets |

---

## Credentials (KEEP SECURE)

```
Supabase Project:        gfjhsijrwodjvkisouzw
Database Host:           db.gfjhsijrwodjvkisouzw.supabase.co
Database User:           postgres
Database Password:       N345fmu0SLqrZE3
Service Role Key:        sb_secret_AkT4uAkV4o4meeHt0meQeg_yhjtgEfN
Anon Key:                sb_publishable_JxKCbS4Ly4gF1KtdX4s8Iw_CkkBn2W

Resend API Key:          re_8135Bb8B_KhF8HTm4LQUJyHmgbh4hJDUi
Resend From Email:       noreply@gkshah.com.np

Cloudflare Zone ID:      ebe3014aae026860cd09a75e4fa882dc
Cloudflare API Key:      cfk_Fhcli9pPqkHBZDBO9girVj5Z7gsBFGaJ52JiyyOaa4d0faa4

GitHub PAT:              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

Render Service ID:       srv-d9lgbn710e5c73dl8sk0
Render Service Name:     scholar-agentic-os
Render URL:              https://scholar-agentic-os-gynr.onrender.com

Domain:                  scholar.gkshah.com.np
Admin Email:             doc.govinda@gmail.com
Encryption Key:          06450897c8ac72b4cfcb8af714e4dd449dd96f779a29d1986f3303b30aa7a6c1
```

---

## Environment Variables

### Local Development (.env)
```bash
DATABASE_URL=postgresql://postgres:N345fmu0SLqrZE3@db.gfjhsijrwodjvkisouzw.supabase.co:5432/postgres
VITE_SUPABASE_URL=https://gfjhsijrwodjvkisouzw.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_JxKCbS4Ly4gF1KtdX4s8Iw_CkkBn2W
SUPABASE_SERVICE_ROLE_KEY=sb_secret_AkT4uAkV4o4meeHt0meQeg_yhjtgEfN
RESEND_API_KEY=re_8135Bb8B_KhF8HTm4LQUJyHmgbh4hJDUi
RESEND_FROM_EMAIL=noreply@gkshah.com.np
NODE_ENV=production
PORT=3000
APP_URL=https://scholar.gkshah.com.np
ADMIN_EMAIL=doc.govinda@gmail.com
ENCRYPTION_KEY=06450897c8ac72b4cfcb8af714e4dd449dd96f779a29d1986f3303b30aa7a6c1
```

### Production (Render)
Must set same variables above in Render Dashboard → Environment

### GitHub Actions Secrets
```
RENDER_DEPLOY_KEY      = [Get from Render Deploy Hook]
VITE_SUPABASE_URL      = https://gfjhsijrwodjvkisouzw.supabase.co
VITE_SUPABASE_ANON_KEY = sb_publishable_JxKCbS4Ly4gF1KtdX4s8Iw_CkkBn2W
DATABASE_URL           = postgresql://postgres:N345fmu0SLqrZE3@db.gfjhsijrwodjvkisouzw.supabase.co:5432/postgres
```

---

## Setup Checklist (DO THIS NEXT)

Follow these steps in order. Detailed instructions in `scripts/setup-infrastructure.md`

### Phase 1: Render Configuration (5 mins)
- [ ] Go to https://dashboard.render.com/
- [ ] Click: scholar-agentic-os → Environment
- [ ] Click: Edit
- [ ] Add/Update these environment variables:
  - DATABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - APP_URL=https://scholar.gkshah.com.np
  - RESEND_API_KEY
  - RESEND_FROM_EMAIL
- [ ] Click: Save Changes
- [ ] Wait for deployment (2-3 mins, green checkmark = ✅)

### Phase 2: Cloudflare DNS Setup (5 mins)
- [ ] Go to https://dash.cloudflare.com/
- [ ] Select: scholar.gkshah.com.np
- [ ] Click: DNS (left sidebar)
- [ ] Click: Add record
  - Type: CNAME
  - Name: scholar.gkshah.com.np (or @)
  - Content: scholar-agentic-os-gynr.onrender.com
  - TTL: Auto
  - Proxy: Proxied (orange cloud)
- [ ] Click: Save
- [ ] Wait 5-15 mins for DNS propagation

### Phase 3: Add Custom Domain to Render (2 mins)
- [ ] Go to: https://dashboard.render.com/
- [ ] Click: scholar-agentic-os → Settings
- [ ] Find: Custom Domains section
- [ ] Click: Add Custom Domain
- [ ] Enter: scholar.gkshah.com.np
- [ ] Click: Add Domain
- [ ] Wait for status: Active (5-15 mins)

### Phase 4: GitHub Secrets Configuration (5 mins)
- [ ] Go to: https://github.com/docgovinda-glitch/scholar-agentic-os
- [ ] Click: Settings → Secrets and variables → Actions
- [ ] Add 4 secrets:
  1. RENDER_DEPLOY_KEY = [from Render Deploy Hook URL]
  2. VITE_SUPABASE_URL = https://gfjhsijrwodjvkisouzw.supabase.co
  3. VITE_SUPABASE_ANON_KEY = sb_publishable_JxKCbS4Ly4gF1KtdX4s8Iw_CkkBn2W
  4. DATABASE_URL = postgresql://postgres:N345fmu0SLqrZE3@db.gfjhsijrwodjvkisouzw.supabase.co:5432/postgres

### Phase 5: Test Everything (5 mins)
```bash
# 1. Test local build
npm run build

# 2. Test local dev server
npm run dev
# Visit http://localhost:3000 - should load without errors

# 3. Commit test change to trigger CI/CD
echo "# Test" >> README.md
git add README.md
git commit -m "test: verify deployment pipeline"
git push origin claude/remaining-project-tasks-ok41cg

# 4. Check deployment
# Go to: https://github.com/docgovinda-glitch/scholar-agentic-os/actions
# Wait for "Deploy to Render" workflow to complete

# 5. Visit production
# https://scholar.gkshah.com.np
```

---

## Useful Commands

```bash
# Local development
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Build for production
npm run lint         # TypeScript check
npm run test         # Run tests

# Database
psql "$DATABASE_URL" # Connect directly to Postgres

# Git workflow (for Phase 4 development)
git checkout claude/remaining-project-tasks-ok41cg
git pull origin claude/remaining-project-tasks-ok41cg
# Make changes...
git add .
git commit -m "feature: ..."
git push origin claude/remaining-project-tasks-ok41cg
```

---

## Production URLs

| Service | URL |
|---------|-----|
| App (Production) | https://scholar.gkshah.com.np |
| App (Render) | https://scholar-agentic-os-gynr.onrender.com |
| GitHub Repo | https://github.com/docgovinda-glitch/scholar-agentic-os |
| Render Dashboard | https://dashboard.render.com/ |
| Cloudflare Dashboard | https://dash.cloudflare.com/ |
| Supabase Dashboard | https://app.supabase.com/ |
| Resend Dashboard | https://resend.com/ |

---

## Next: Resume Building Phase 5

Once setup is complete and production is live:

1. ✅ Infrastructure is authorized and configured
2. ✅ GitHub Actions deploys on every push
3. ✅ Custom domain scholar.gkshah.com.np is live
4. ✅ Database is connected (Supabase PostgreSQL)
5. ✅ Email is working (Resend)

**Ready to resume Phase 5 implementation! 🚀**

See: `README.md` → Phase roadmap for next features
