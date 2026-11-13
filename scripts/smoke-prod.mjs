#!/usr/bin/env node
/**
 * Production smoke suite (STATUS.md Section 6). Run after every production change.
 *
 *   source ~/.scholar-agent.env && node scripts/smoke-prod.mjs [--setup] [--base https://…]
 *
 * Needs (env, never printed): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * SMOKE_A_EMAIL, SMOKE_A_PASSWORD, SMOKE_B_EMAIL, SMOKE_B_PASSWORD.
 *
 * Sign-in: the site's /api/auth/login requires a Turnstile token, which a script
 * cannot produce. The suite instead mints a session for each test account with a
 * service-role magic-link token (/auth/v1/admin/generate_link → /auth/v1/verify).
 * It checks separately that /api/auth/login rejects a request without CAPTCHA.
 *
 * --setup creates the two test accounts (confirmed, no email sent) when missing.
 * Output: one line per check, "ok"/"FAIL"; exit 1 on any failure. No secrets,
 * tokens, emails or user ids are printed.
 */
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg('base', process.env.SMOKE_BASE_URL || 'https://scholar.gkshah.com.np').replace(/\/$/, '');
const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const A = { email: process.env.SMOKE_A_EMAIL, password: process.env.SMOKE_A_PASSWORD };
const B = { email: process.env.SMOKE_B_EMAIL, password: process.env.SMOKE_B_PASSWORD };

for (const [k, v] of Object.entries({ SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, SMOKE_A_EMAIL: A.email, SMOKE_B_EMAIL: B.email, SMOKE_A_PASSWORD: A.password, SMOKE_B_PASSWORD: B.password })) {
  if (!v) {
    console.error(`missing env ${k}`);
    process.exit(2);
  }
}

const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`ok   ${name}${detail ? `  (${detail})` : ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL ${name}  — ${e.message}`);
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const req = async (method, path, { token, body, headers = {}, raw } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !raw) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text };
};

const admin = (path, init = {}) =>
  fetch(`${SUPA}/auth/v1${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

async function ensureUser(u) {
  const res = await admin('/admin/users', { method: 'POST', body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: 'Smoke Test Account' } }) });
  if (res.ok) return 'created';
  const t = await res.text();
  if (/already|exists|registered/i.test(t)) return 'exists';
  throw new Error(`create user failed: HTTP ${res.status}`);
}

async function session(u) {
  const link = await admin('/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: u.email }) });
  expect(link.ok, `generate_link HTTP ${link.status}`);
  const j = await link.json();
  const tokenHash = j.hashed_token || j.properties?.hashed_token;
  expect(tokenHash, 'no hashed_token');
  const v = await fetch(`${SUPA}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }) });
  expect(v.ok, `verify HTTP ${v.status}`);
  const s = await v.json();
  expect(s.access_token, 'no access_token');
  return s.access_token;
}

if (process.argv.includes('--setup')) {
  console.log(`test account A: ${await ensureUser(A)}`);
  console.log(`test account B: ${await ensureUser(B)}`);
}

const minimalPdf = () => {
  const objs = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    null,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  ];
  const stream = 'BT /F1 18 Tf 72 720 Td (Scholar Core smoke test document) Tj ET';
  objs[3] = `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj`;
  let out = '%PDF-1.4\n';
  const offs = [];
  for (const o of objs) {
    offs.push(out.length);
    out += o + '\n';
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
};
const upload = (path, token, buf, name, type) => {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  return req('POST', path, { token, body: fd, raw: true });
};

// ── Positive checks ─────────────────────────────────────────────────────────
await check('GET /api/health → 200 healthy', async () => {
  const r = await req('GET', '/api/health');
  expect(r.status === 200 && r.json?.status === 'healthy', `HTTP ${r.status}`);
});
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
if (!LOCAL) await check('/api/auth/login without CAPTCHA is rejected (no session issued)', async () => {
  const r = await req('POST', '/api/auth/login', { body: { identifier: A.email, password: A.password } });
  expect(r.status >= 400 && r.status < 500 && !r.json?.session, `HTTP ${r.status}`);
});

let tokA;
let tokB;
await check('session for TEST_A and TEST_B', async () => {
  tokA = await session(A);
  tokB = await session(B);
});
if (!tokA || !tokB) {
  console.log('cannot continue without sessions');
  process.exit(1);
}

let projectId;
await check('TEST_A creates, edits and re-reads a project', async () => {
  const c = await req('POST', '/api/projects', { token: tokA, body: { outputTypeId: 'OT-01' } });
  expect(c.status === 201, `create HTTP ${c.status}`);
  projectId = c.json.projectId || c.json.id;
  const title = `Smoke ${Date.now()}`;
  const p = await req('PATCH', `/api/projects/${projectId}`, { token: tokA, body: { title } });
  expect(p.status === 200, `patch HTTP ${p.status}`);
  const g = await req('GET', `/api/projects/${projectId}`, { token: tokA });
  expect(g.status === 200 && JSON.stringify(g.json).includes(title), 'edit not persisted');
});

let deckId;
await check('TEST_A creates, edits and re-reads a presentation', async () => {
  const c = await req('POST', '/api/presentations', { token: tokA, body: { title: 'Smoke deck', slides: [{ id: 's1', headline: 'First' }] } });
  expect(c.status === 201 || c.status === 200, `create HTTP ${c.status}`);
  deckId = c.json?.deck?.id || c.json?.id;
  expect(deckId, 'no deck id');
  const u = await req('PUT', `/api/presentations/${deckId}`, { token: tokA, body: { slides: [{ id: 's1', headline: 'Edited headline' }] } });
  expect(u.status === 200, `put HTTP ${u.status}`);
  const g = await req('GET', `/api/presentations/${deckId}`, { token: tokA });
  expect(g.status === 200 && g.text.includes('Edited headline'), 'edit not persisted');
});

await check('TEST_A uploads a 1-page PDF → parsed', async () => {
  const r = await upload('/api/vault/parse-file', tokA, minimalPdf(), 'smoke.pdf', 'application/pdf');
  expect(r.status === 200, `HTTP ${r.status}`);
  expect(/smoke test document/i.test(r.text), 'parsed text missing');
});

// The AI routes share a per-minute abuse limit (20/min). The browser suite that
// runs before this script uses that budget, so wait out one window first.
// Otherwise these checks would test the limiter (429), not the auth behaviour.
const waitForRateWindow = async () => {
  console.log('waiting 65s for the AI rate-limit window to reset');
  await new Promise((resolve) => setTimeout(resolve, 65_000));
};

// ── Negative checks ─────────────────────────────────────────────────────────
await waitForRateWindow();
for (const path of ['/api/vault/parse-url', '/api/vault/search-semantic', '/api/search/live', '/api/ai/search', '/api/ai/agent']) {
  await check(`anonymous POST ${path} → 401`, async () => {
    const r = await req('POST', path, { body: {} });
    expect(r.status === 401, `HTTP ${r.status}`);
  });
}
for (const sub of ['', '/files', '/activity', '/document', '/claims']) {
  await check(`TEST_B reads TEST_A project${sub || ''} → 404`, async () => {
    const r = await req('GET', `/api/projects/${projectId}${sub}`, { token: tokB });
    expect(r.status === 404, `HTTP ${r.status}`);
  });
}
await check('TEST_B writes TEST_A project → 404, row unchanged', async () => {
  const before = await req('GET', `/api/projects/${projectId}`, { token: tokA });
  const r = await req('PATCH', `/api/projects/${projectId}`, { token: tokB, body: { title: 'hijacked' } });
  expect(r.status === 404, `HTTP ${r.status}`);
  const after = await req('GET', `/api/projects/${projectId}`, { token: tokA });
  expect(before.text === after.text && !after.text.includes('hijacked'), 'row changed');
});
await check('TEST_B reads / writes TEST_A deck → 404, deck unchanged', async () => {
  const g = await req('GET', `/api/presentations/${deckId}`, { token: tokB });
  const p = await req('PUT', `/api/presentations/${deckId}`, { token: tokB, body: { title: 'hijacked' } });
  const d = await req('DELETE', `/api/presentations/${deckId}`, { token: tokB });
  expect(g.status === 404 && p.status === 404 && d.status === 404, `GET ${g.status} PUT ${p.status} DELETE ${d.status}`);
  const a = await req('GET', `/api/presentations/${deckId}`, { token: tokA });
  expect(a.status === 200 && !a.text.includes('hijacked'), 'deck changed');
});
await check('11 MB upload → 413', async () => {
  const r = await upload('/api/vault/parse-file', tokA, Buffer.alloc(11 * 1024 * 1024, 32), 'big.txt', 'text/plain');
  expect(r.status === 413, `HTTP ${r.status}`);
});
// AI router: checks that never reach a provider (nothing is spent).
// The anonymous checks above used part of the window, so wait again.
await waitForRateWindow();
const keyringHeader = (entries) => Buffer.from(JSON.stringify(entries)).toString('base64url');
await check('/api/ai/run rejects a malformed request and an unreadable keyring', async () => {
  const bad = await req('POST', '/api/ai/run', { token: tokA, body: { task: 'fast', messages: [] } });
  const ring = await req('POST', '/api/ai/run', { token: tokA, headers: { 'x-ai-keyring': '%%%' }, body: { task: 'fast', messages: [{ role: 'user', content: 'hi' }] } });
  expect(bad.status === 400 && ring.status === 400, `body ${bad.status} keyring ${ring.status}`);
});
await check('/api/ai/models with no keys → empty list', async () => {
  const r = await req('GET', '/api/ai/models', { token: tokA });
  expect(r.status === 200 && Array.isArray(r.json?.providers) && r.json.providers.length === 0, `HTTP ${r.status}`);
});
await check('/api/ai/models refuses a cloud-metadata endpoint, key not echoed', async () => {
  const secret = 'smoke-not-a-real-key-123';
  const r = await req('GET', '/api/ai/models', { token: tokA, headers: { 'x-ai-keyring': keyringHeader([{ provider: 'custom', model: 'm', apiKey: secret, baseUrl: 'https://169.254.169.254/v1' }]) } });
  const err = r.json?.providers?.[0]?.error ?? '';
  expect(r.status === 200 && /private or internal/.test(err) && !r.text.includes(secret), `HTTP ${r.status}: ${err.slice(0, 80)}`);
});
for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://[::1]/', 'http://2130706433/']) {
  await check(`SSRF ${url} rejected`, async () => {
    const r = await req('POST', '/api/vault/parse-url', { token: tokA, body: { url } });
    expect(r.status >= 400 && r.status < 500, `HTTP ${r.status}`);
  });
}

// Direct Supabase (anon key, no session) — Hotfix 2 lockdown
const supa = (path, init = {}) => fetch(`${SUPA}${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
for (const t of ['project_research_gaps', 'project_titles', 'project_journal_candidates']) {
  await check(`anon read/write ${t} → no rows / denied`, async () => {
    const r = await supa(`/rest/v1/${t}?select=*&limit=1`);
    const rows = r.ok ? await r.json() : [];
    expect(!r.ok || rows.length === 0, `read returned ${rows.length} rows`);
    const w = await supa(`/rest/v1/${t}`, { method: 'POST', body: '{}' });
    expect(!w.ok, `write HTTP ${w.status}`);
  });
}
for (const b of ['project-files', 'id-documents']) {
  await check(`anon list bucket ${b} → nothing`, async () => {
    const r = await supa(`/storage/v1/object/list/${b}`, { method: 'POST', body: JSON.stringify({ prefix: '', limit: 5 }) });
    const j = r.ok ? await r.json() : [];
    expect(!r.ok || (Array.isArray(j) && j.length === 0), `listed ${j.length}`);
  });
}
for (const fn of ['email_for_identifier', 'check_email_available', 'check_username_available', 'check_phone_available', 'is_username_approved']) {
  await check(`anon RPC ${fn} → denied`, async () => {
    const r = await supa(`/rest/v1/rpc/${fn}`, { method: 'POST', body: '{}' });
    expect(!r.ok, `HTTP ${r.status}`);
  });
}

// ── Cleanup (only this run's own test rows) ─────────────────────────────────
await check('cleanup TEST_A test project and deck', async () => {
  const d1 = deckId ? await req('DELETE', `/api/presentations/${deckId}`, { token: tokA }) : { status: 200 };
  const d2 = projectId ? await req('DELETE', `/api/projects/${projectId}`, { token: tokA }) : { status: 200 };
  expect(d1.status < 300 && d2.status < 300, `deck ${d1.status} project ${d2.status}`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
