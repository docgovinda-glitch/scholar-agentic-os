import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";

import { rateLimit } from "./server/src/middleware/rateLimit.ts";
import { PDFParser } from "./src/document_intelligence/parser/parsers/pdfParser.ts";
import { DOCXParser } from "./src/document_intelligence/parser/parsers/docxParser.ts";
import { TXTParser } from "./src/document_intelligence/parser/parsers/txtParser.ts";
import { MarkdownParser } from "./src/document_intelligence/parser/parsers/markdownParser.ts";
import { detectHeadings } from "./src/document_intelligence/parser/headingDetection.ts";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "./src/citation_compliance/model/reference.ts";
import { CitationStyleRegistry, CitationFormatterFactory } from "./src/citation_compliance/formattingEngine.ts";
import { APA7Formatter } from "./src/citation_compliance/formatters/apa7.ts";
import { IEEEFormatter } from "./src/citation_compliance/formatters/ieee.ts";
import { MLA9Formatter } from "./src/citation_compliance/formatters/mla9.ts";
import { ChicagoFormatter } from "./src/citation_compliance/formatters/chicago.ts";
import { HarvardFormatter } from "./src/citation_compliance/formatters/harvard.ts";
import { VancouverFormatter } from "./src/citation_compliance/formatters/vancouver.ts";
import { importBibTex } from "./src/citation_compliance/importers/bibtexImporter.ts";
import { importRis } from "./src/citation_compliance/importers/risImporter.ts";
import {
  getCloudProvider,
  chatUrl,
  buildAuthHeaders,
  type CloudProviderSpec,
} from "./src/config/providerCatalog.ts";
import { LOCAL_RUNNERS } from "./src/config/localRunnerCatalog.ts";
import { registerHealthRoutes, registerAdminRoutes, registerParseRoutes, registerAIRoutes, registerStudioRoutes } from "./server/routes/index.ts";

dotenv.config();

// Honour $PORT rather than hardcoding. Render assigns the port it expects the
// service to listen on through this variable; the literal 3000 happened to
// work only because render.yaml pins PORT=3000 to match. Reading the variable
// removes that coupling — a platform-assigned port now just works instead of
// producing a service that binds somewhere nothing is routed to.
const PORT = Number(process.env.PORT) || 3000;

// Production-readiness pass (2026-07-24): this used to be
// `const __filename = fileURLToPath(import.meta.url); const __dirname =
// path.dirname(__filename);` unconditionally — which crashes on startup
// under the CJS build `npm start` actually runs (`dist/server.cjs`,
// produced by esbuild --format=cjs): `import.meta.url` is empty in CJS, so
// `fileURLToPath(undefined)` threw ERR_INVALID_ARG_TYPE immediately
// (confirmed by actually running `node dist/server.cjs`, not just reading
// the build warning). Node/esbuild's CJS output already provides a real,
// working `__dirname` binding for free — this only needs to compute one
// from `import.meta.url` in the ESM path (`tsx server.ts`, used by `npm run
// dev`), and defer to the ambient one otherwise. Resolved once, at module
// load, not per-request.
//
// Warning cleanup (2026-07-30): the `npm run build` esbuild invocation now
// passes `--define:import.meta={}` — this is NOT a behavior change, only a
// way to silence esbuild's own "import.meta is not available with the cjs
// output format" warning. Confirmed by diffing the compiled output with and
// without the flag: esbuild already substitutes bare `{}` for `import.meta`
// in the CJS bundle by default (undocumented but consistent), so `--define`
// just makes that existing substitution explicit instead of implicit,
// producing identical compiled code either way. `typeof import.meta` stays
// `"object"` (not `"undefined"`), `import.meta.url` stays `undefined`
// (there's no `.url` property on `{}`), so this function's `if` branch is
// exactly as unreachable in the CJS bundle as it always was — only the
// dev/tsx ESM path (where esbuild's --define never applies) still takes it.
// This does NOT migrate the server bundle to ESM output — `dist/server.cjs`
// stays CJS, matching `"start": "node dist/server.cjs"` and this repo's
// `--packages=external` choice (externals are `require()`'d, not
// `import`'d, avoiding any CJS/ESM interop risk for the ~15 npm packages
// server.ts pulls in). A full ESM migration was considered and rejected as
// out of scope for a warning-only fix — it would change the actual output
// format/interop behavior of every external import, not just silence a
// cosmetic warning.
function resolveServerDirname(): string {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  // @ts-ignore — __dirname is a real binding injected by Node's CJS module
  // wrapper at runtime in the esbuild-bundled dist/server.cjs; it isn't a
  // declared identifier in this ESM-authored source file.
  return __dirname;
}
const serverDirname = resolveServerDirname();

const app = express();

// Security headers (helmet) — previously entirely absent from this server.
// CSP is skipped in dev: Vite's middleware-mode HMR needs inline
// scripts/eval and a websocket connection that a strict default CSP would
// block; production serves pre-built static assets instead and gets the
// full default policy.
//
// Bug fix (2026-07-31): this used to pass `contentSecurityPolicy: undefined`
// in production, which makes helmet apply its bare default directives —
// including `connect-src` falling back to `default-src 'self'` (same-origin
// only). That silently blocked every browser-side fetch() to any other
// origin, confirmed live in production: registration failed with a generic
// "Load failed" (Safari) / "TypeError: Failed to fetch" (Chrome) because
// the client's calls to Supabase Auth/REST/Edge Functions
// (`*.supabase.co`) never left the browser. The same gap also silently
// broke every literature/citation/dataset-discovery feature that fetches
// directly from the browser (OpenAlex, Crossref, DataCite, World Bank,
// OECD SDMX) — none of these go through server.ts as a proxy. Explicit
// `connect-src` added on top of helmet's other defaults (left unchanged)
// to allow exactly the origins this app's client-side code actually calls.
//
// `form-action` fix (2026-07-31, same day): helmet's default directives
// also include `form-action 'self'`, which silently blocked the real
// <form method="POST"> at /admin/approve-scholar from submitting to the
// approve-registration Edge Function (a different origin) — confirmed
// live via a direct form.submit() call producing zero network request and
// no visible error. Added a Supabase source here too.
//
// Wildcard-to-exact-origin fix (2026-07-31, same day): `https://*.supabase.co`
// worked in Chrome but confirmed live to NOT match in Safari — WebKit's CSP
// wildcard-matching didn't recognize the project's actual hostname
// (gfjhsijrwodjvkisouzw.supabase.co) against that pattern, so Safari
// refused the form-action with a CSP violation while Chrome allowed it
// silently. A single-tenant deployment only ever talks to one specific
// Supabase project anyway, so the wildcard bought nothing — replaced with
// the exact origin (derived from VITE_SUPABASE_URL, already required) in
// both directives, which is unambiguous across every browser.
// Gemini BYOK fix (2026-07-31): every cloud provider except Gemini is called
// through this server's own /api/generate proxy, so `'self'` covered them.
// Gemini is the one exception — GeminiAdapter.generate() in
// src/services/aiGateway.ts calls generativelanguage.googleapis.com DIRECTLY
// from the browser whenever the user has supplied their own Gemini key, and
// only falls back to the proxy when no client key is set. That origin was
// missing here, so "Bring Your Own Gemini key" was silently CSP-blocked in
// production (a bare `TypeError: Failed to fetch`) while leaving the key blank
// worked fine — an inversion that made the failure very hard to interpret.
// DIRECT_BROWSER_CALL_ORIGINS in src/config/providerCatalog.ts is the list any
// future direct-from-browser provider must be added to as well.
// Local AI fix (2026-07-31): "Local AI" is one of this app's five advertised
// AI modes, but production CSP had no localhost source — so a user running
// Ollama on their own machine could never connect from the deployed site, and
// the failure surfaced as a bare "could not reach" with no hint that the
// policy, not the program, was the obstacle. Local AI was effectively dead in
// production while being offered in the UI.
//
// Allowing localhost in connect-src only lets THIS app's own pages talk to
// the user's own machine, which is precisely the feature; it grants nothing
// to any other origin. Both a port wildcard and the catalog's explicit
// default ports are listed: the wildcard covers custom ports, and the
// explicit entries are the safety net after `https://*.supabase.co` was
// confirmed live not to match in Safari — if WebKit treats a port wildcard
// the same way, the default runner ports still work.
const localRunnerSources = Array.from(
  new Set(
    LOCAL_RUNNERS.flatMap((runner) => {
      const port = new URL(runner.defaultEndpoint).port;
      return port ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`] : [];
    })
  )
);

// upgrade-insecure-requests fix (2026-07-31): allowing localhost in
// connect-src above was necessary but did nothing on its own. Helmet's default
// directives include `upgrade-insecure-requests`, which rewrites every http://
// request to https:// BEFORE it is sent — so the browser never asked for
// http://localhost:11434 at all, it asked for https://localhost:11434 and got
// "An SSL error has occurred" (confirmed in a user's Safari console against
// every runner port). Local AI programs serve plain HTTP on loopback and have
// no certificate, so the upgrade can never succeed.
//
// The directive is dropped rather than overridden because it is all-or-nothing
// — there is no per-source exemption. The protection lost is small here: every
// other source in this policy is already an explicit https:// origin, and the
// app's own assets are same-origin HTTPS, so there is no http:// subresource
// left for it to upgrade. Loopback is exempt from mixed-content blocking by
// spec precisely because it is not attacker-reachable.
//
// It MUST be set to null rather than simply omitted from the spread: helmet
// defaults to `useDefaults: true` and merges its default directives back over
// whatever is supplied, so leaving the key out silently reinstates it. Checked
// against helmet directly — omitting keeps the directive in the header, null
// removes it.
const supabaseOrigin = process.env.VITE_SUPABASE_URL ? new URL(process.env.VITE_SUPABASE_URL).origin : undefined;
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "upgrade-insecure-requests": null,
        "connect-src": [
          "'self'",
          ...(supabaseOrigin ? [supabaseOrigin] : []),
          "https://generativelanguage.googleapis.com",
          "http://localhost:*",
          "http://127.0.0.1:*",
          ...localRunnerSources,
          "https://api.openalex.org",
          "https://api.crossref.org",
          "https://api.datacite.org",
          "https://api.worldbank.org",
          "https://sdmx.oecd.org",
        ],
        "form-action": ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
      },
    } : false,
  })
);

const USERS_DB_PATH = path.join(serverDirname, "users.json");

// Trimmed to the fields server.ts actually reads (2026-07-30): this used to
// mirror the full users.json record shape from the old custom auth routes
// (registration/activation/passcode-reset), removed in commit d61a69b —
// `username` (findUserByUsername) and `encryptedApiKeys` (resolveApiKey's
// server-stored-API-key fallback) are the only fields any code in this file
// still reads or writes. Type-only change, no runtime effect.
interface UserRecord {
  username: string;
  encryptedApiKeys?: {
    [provider: string]: string;
  };
}

// Production-readiness pass (2026-07-24): this used to fall back to a
// hardcoded literal ("scholar-agentic-secure-vault-32ch") whenever
// ENCRYPTION_KEY wasn't set — the exact same class of vulnerability fixed
// for the BYOK vault passphrase in an earlier session (a known constant
// standing in for a real secret defeats the point of encrypting at all).
// No fallback now: if unset, decryptServerKey refuses to decrypt (returns
// "" — resolveApiKey's caller already treats that as "no server-stored key
// available", not a crash) instead of silently using a guessable key.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.warn(
    "[Security] ENCRYPTION_KEY is not set — server-stored provider API keys (resolveApiKey's users.json fallback) cannot be decrypted until it's configured."
  );
}

function decryptServerKey(text: string): string {
  if (!ENCRYPTION_KEY) return "";
  try {
    let cipherKey = Buffer.alloc(32);
    cipherKey.write(ENCRYPTION_KEY, 'utf-8');

    const parts = text.split(':');
    const iv = Buffer.from(parts.shift() || '', 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("Failed to decrypt server key:", err);
    return "";
  }
}

function resolveApiKey(provider: string, apiKey: string, username?: string): string {
  let activeApiKey = apiKey;
  if ((!activeApiKey || activeApiKey === "defined_on_server" || activeApiKey === "") && username) {
    const db = readUsersDb();
    const userRec = findUserByUsername(db, username);
    if (userRec && userRec.encryptedApiKeys && userRec.encryptedApiKeys[provider]) {
      activeApiKey = decryptServerKey(userRec.encryptedApiKeys[provider]);
    }
  }
  return activeApiKey;
}

// ─────────────────────────────────────────────────────────
// GENERIC CLOUD-PROVIDER PROXY (src/config/providerCatalog.ts driven)
// ─────────────────────────────────────────────────────────
//
// Replaces five near-identical `if (aiProvider === "openai" | "deepseek" |
// "groq" | "together" | "openrouter")` blocks that differed only in a URL and
// a default model string. That copy-paste shape is what produced the Qwen bug:
// Qwen had a client adapter and a streaming branch here, but nobody added the
// sixth non-streaming block, so every non-streaming Qwen request returned
// `400 Unsupported provider: qwen` regardless of how valid the user's key was
// — and because the client's health check never inspected response.ok, the UI
// reported it as a vague "degraded — Unexpected response" instead. Driving
// both endpoints off the shared catalog removes that whole class of bug and
// means a new provider needs no server change at all.

/**
 * Guards the optional client-supplied base URL.
 *
 * Cloudflare Workers AI embeds the user's account id in its address, so the
 * catalog cannot know the full URL ahead of time and the client has to send
 * it. That makes this endpoint an SSRF surface: without a check, a caller
 * could point the proxy at cloud metadata services (169.254.169.254) or hosts
 * inside the deployment's private network and read the response. So an
 * override is accepted only when it is HTTPS and resolves to a public
 * hostname; anything else falls back to the catalog's own base URL.
 */
function isSafeOutboundBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (host === "[::1]" || host === "::1") return false;

  // Literal IPv4 addresses in private / link-local / loopback ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

function resolveProviderChatUrl(spec: CloudProviderSpec, baseUrlOverride?: string): string | null {
  if (baseUrlOverride && isSafeOutboundBaseUrl(baseUrlOverride)) {
    return chatUrl(spec, baseUrlOverride);
  }
  // Providers whose catalog entry has no base URL (Cloudflare) are unusable
  // without a valid override — better an explicit error than a request to "".
  if (!spec.baseUrl) return null;
  return chatUrl(spec);
}

function openAICompatibleBody(
  spec: CloudProviderSpec,
  opts: {
    model?: string;
    systemInstruction?: string;
    prompt: string;
    temperature?: number;
    stream?: boolean;
  }
): string {
  return JSON.stringify({
    model: opts.model || spec.defaultModel,
    messages: [
      { role: "system", content: opts.systemInstruction || "You are a helpful assistant." },
      { role: "user", content: opts.prompt },
    ],
    temperature: opts.temperature ?? 0.5,
    ...(opts.stream ? { stream: true } : {}),
  });
}

function readUsersDb(): UserRecord[] {
  try {
    if (!fs.existsSync(USERS_DB_PATH)) {
      fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users: [] }, null, 2));
      return [];
    }
    const raw = fs.readFileSync(USERS_DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.users || [];
  } catch (err) {
    console.error("Failed to read users database:", err);
    return [];
  }
}

/** Find a user record by username, trimming the lookup value for consistency. */
function findUserByUsername(db: UserRecord[], username: unknown): UserRecord | undefined {
  const trimmed = String(username ?? "").trim();
  return db.find((u) => u.username === trimmed);
}

let requestCount = 0;

function selectGeminiKey(clientKey?: string): string {
  if (clientKey && clientKey !== "defined_on_server" && clientKey !== "") {
    return clientKey;
  }
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY_2
  ].filter(Boolean) as string[];
  
  if (keys.length === 0) return "";
  
  const selected = keys[requestCount % keys.length];
  requestCount++;
  return selected;
}


// Body parser middleware.
//
// The limit was a hardcoded "50mb", which sits badly on the free plan's
// 512 MB of RAM (render.yaml): express buffers the raw body, then the decoded
// string, and /api/parse-file additionally base64-decodes it into a Buffer —
// so one 50 MB upload transiently costs a multiple of that, and two
// concurrent ones can push the instance into an OOM kill. On Render an OOM
// kill restarts the container, which means the next visitor pays a fresh
// cold start; the memory ceiling and the cold-start budget are the same
// problem viewed from two sides.
//
// Made configurable rather than merely smaller, so that moving to a
// larger plan is an env-var change and not a code change. At 25 MB of JSON
// the real ceiling is roughly an 18 MB file once base64's ~33% expansion is
// accounted for, which covers ordinary article and thesis PDFs.
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 25;
const BODY_LIMIT = `${MAX_UPLOAD_MB}mb`;
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// ==========================================
// T006 — Rate limiting & brute-force protection
// ==========================================

// AI abuse protection: bound generation & streaming by IP
const aiAbuseLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  limitBy: "ip",
});

// Parsing expensive endpoints: smaller bounds by IP
const parseFileLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  limitBy: "ip",
});

const parseExternalLinkLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  limitBy: "ip",
});

const lookupDoiLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  limitBy: "ip",
});

const studioLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  limitBy: "ip",
});

// ==========================================
// ROUTE REGISTRATION
// ==========================================

// Citation Style Registry (Scholar Core OS) - registered once at startup
const citationStyleRegistry = CitationStyleRegistry.getInstance();
citationStyleRegistry.register(new APA7Formatter());
citationStyleRegistry.register(new IEEEFormatter());
citationStyleRegistry.register(new MLA9Formatter());
citationStyleRegistry.register(new ChicagoFormatter());
citationStyleRegistry.register(new HarvardFormatter());
citationStyleRegistry.register(new VancouverFormatter());

// Register all route handlers
registerHealthRoutes(app);
registerAdminRoutes(app);
registerParseRoutes(app, parseFileLimit, parseExternalLinkLimit, lookupDoiLimit);
registerAIRoutes(app, aiAbuseLimit, citationStyleRegistry);
registerStudioRoutes(app, studioLimit);


// ==========================================
// VITE MIDDLEWARE SETUP
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Imported lazily, not at module top level. Vite is a dev-only concern —
    // this branch is the only thing that touches it — but a top-level import
    // becomes an unconditional require() in the esbuild CJS bundle, which
    // dragged Vite and its dependency tree into the production image and made
    // it load on every cold start. Inside the branch, production never
    // resolves the module at all.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production build files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Single page application support
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start Server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };

if (process.env.NODE_ENV !== "test") {
  startServer();
}
