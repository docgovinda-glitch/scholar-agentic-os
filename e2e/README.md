# End-to-end tests (Playwright)

```bash
npm run dev            # app on :3000
npm run test:e2e       # signed-out specs run; signed-in specs skip
```

Signed-in specs need a **local** Supabase (never production):

```bash
supabase start                                    # in any scratch folder
scripts/db/replay-migrations.sh "$DB_URL"         # builds the schema from the repo
SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  E2E_A_EMAIL=… E2E_A_PASSWORD=… E2E_B_EMAIL=… E2E_B_PASSWORD=… node scripts/e2e-setup.mjs
# start the app with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY pointing at it
E2E_A_EMAIL=… E2E_A_PASSWORD=… E2E_B_EMAIL=… E2E_B_PASSWORD=… npm run test:e2e
```

`auth.setup.ts` signs each account in once and saves the session (the login
endpoint allows 5 attempts per 5 minutes per IP). CI does all of this in
`.github/workflows/e2e.yml`.
