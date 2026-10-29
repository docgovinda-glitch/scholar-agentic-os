#!/usr/bin/env node
/**
 * Prepares a LOCAL Supabase for the signed-in E2E specs: creates the two test
 * accounts (confirmed, no email sent) and completes their profile so they
 * skip onboarding. Refuses to run against a hosted Supabase project.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… \
 *   E2E_A_EMAIL=… E2E_A_PASSWORD=… E2E_B_EMAIL=… E2E_B_PASSWORD=… node scripts/e2e-setup.mjs
 */
const SUPA = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPA)) throw new Error("refusing: e2e-setup only runs against a local Supabase");
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function ensure(email, password) {
  if (!email || !password) throw new Error("missing E2E account env");
  const res = await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "E2E Test Account" } }),
  });
  let id;
  if (res.ok) id = (await res.json()).id;
  else {
    const list = await (await fetch(`${SUPA}/auth/v1/admin/users?per_page=1000`, { headers })).json();
    id = (list.users || []).find((u) => u.email === email)?.id;
    if (!id) throw new Error(`could not create or find ${email}: HTTP ${res.status}`);
  }
  const p = await fetch(`${SUPA}/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ user_type: "student", education_level: "masters" }),
  });
  if (!p.ok) throw new Error(`profile update failed for test account: HTTP ${p.status} ${await p.text()}`);
  console.log(`ready: test account ${email.split("@")[0].slice(0, 1)}***`);
}

await ensure(process.env.E2E_A_EMAIL, process.env.E2E_A_PASSWORD);
await ensure(process.env.E2E_B_EMAIL, process.env.E2E_B_PASSWORD);
