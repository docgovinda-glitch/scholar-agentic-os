import express from "express";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

import "express-async-errors";
import { rateLimit } from "./server/src/middleware/rateLimit.ts";
import { errorHandler } from "./server/src/middleware/errorHandler.ts";
import { getMaxUploadMb } from "./server/src/middleware/uploadGuard.ts";
import { registerDefaultParsers, detectHeadings } from "./src/document_intelligence/index.ts";
import { registerBuiltinAgents } from "./src/app/mesh/agents/index.ts";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "./src/citation_compliance/model/reference.ts";
import { CitationStyleRegistry, CitationFormatterFactory } from "./src/citation_compliance/formattingEngine.ts";
import { APA7Formatter } from "./src/citation_compliance/formatters/apa7.ts";
import { IEEEFormatter } from "./src/citation_compliance/formatters/ieee.ts";
import { MLA9Formatter } from "./src/citation_compliance/formatters/mla9.ts";
import { ChicagoFormatter } from "./src/citation_compliance/formatters/chicago.ts";
import { ChicagoNotesFormatter } from "./src/citation_compliance/formatters/chicagoNotes.ts";
import { HarvardFormatter } from "./src/citation_compliance/formatters/harvard.ts";
import { VancouverFormatter } from "./src/citation_compliance/formatters/vancouver.ts";
import { importBibTex } from "./src/citation_compliance/importers/bibtexImporter.ts";
import { importRis } from "./src/citation_compliance/importers/risImporter.ts";
import {
  getCloudProvider,
  chatUrl,
  buildAuthHeaders,
  DIRECT_BROWSER_CALL_ORIGINS,
  type CloudProviderSpec,
} from "./src/config/providerCatalog.ts";
import http from "node:http";
import { LOCAL_RUNNERS } from "./src/config/localRunnerCatalog.ts";
import { registerHealthRoutes, registerAdminRoutes, registerAuthRoutes, registerAIRoutes, registerStudioRoutes, registerProjectRoutes, registerDraftingRoutes, registerAiAccessRoutes, registerSearchRoutes, registerVaultRoutes, registerPresentationRoutes, registerSupabaseProxy, registerSupabaseWsProxy } from "./server/routes/index.ts";

if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
  dotenv.config();
}

// Bind to environment $PORT if provided (e.g. Render), defaulting to 3000.
const PORT = Number(process.env.PORT) || 3000;

// Resolve server directory across both dev ESM (`tsx server.ts`) and production CJS (`dist/server.cjs`).
function resolveServerDirname(): string {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  // @ts-ignore - __dirname is provided by Node's CJS runtime in the bundled dist/server.cjs
  return __dirname;
}
const serverDirname = resolveServerDirname();

const app = express();
app.set("trust proxy", 1);

// Security headers: CSP is enforced in production while disabled in dev to allow Vite HMR.
// The policy explicitly permits Supabase endpoints, Gemini BYOK, scholarly discovery APIs, and local AI loopback runners.
const localRunnerSources = Array.from(
  new Set(
    LOCAL_RUNNERS.flatMap((runner) => {
      const port = new URL(runner.defaultEndpoint).port;
      return port ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`] : [];
    })
  )
);

// upgrade-insecure-requests is explicitly set to null so local runners (Ollama, LM Studio) on plain HTTP loopback can connect.
// index.html's inline theme-flash-prevention <script> (the one wrapped in
// try/catch, setting data-theme from localStorage before first paint) has no
// nonce, so `script-src 'self'` alone silently blocks it in production —
// confirmed live via a browser console CSP violation naming that exact line.
// The dev server never catches this: CSP is skipped entirely below when
// NODE_ENV !== "production", and helmet was previously only exercised there.
// Fixed with a CSP hash source rather than 'unsafe-inline', which would
// reopen script-src to any injected inline script, not just this one.
// INLINE_THEME_SCRIPT_CSP_HASH must match this script's exact content
// (including whitespace) or the browser silently drops it again with no
// server-side signal — scripts/verify-csp-hash.mjs (run via `npm run lint`)
// recomputes the hash from index.html on every check and fails loudly if
// this constant is stale, so an edit to the script without updating the
// hash here cannot pass CI silently.
const INLINE_THEME_SCRIPT_CSP_HASH = "'sha256-5V5R0fGRHFWdp0DZAppTOANJPlyUyQLWp0eGom1+k2c='";

const rawSupabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseOrigin = rawSupabaseUrl && rawSupabaseUrl.startsWith("http")
  ? new URL(rawSupabaseUrl).origin
  : undefined;
// crossOriginOpenerPolicy:
// Helmet defaults to `Cross-Origin-Opener-Policy: same-origin`, which severs `window.opener`
// and blocks cross-origin postMessage communication. Setting this to `same-origin-allow-popups`
// still caused Chrome to log "Cross-Origin-Opener-Policy policy would block the window.postMessage call"
// when Google Identity Services (GIS) library (client:393) communicates via postMessage.
// Disabling COOP entirely (leaving browser default 'unsafe-none') preserves window.opener for all
// authentication popups and eliminates COOP postMessage blocks cleanly.
app.use(
  helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "upgrade-insecure-requests": null,
        "connect-src": [
          "'self'",
          ...(supabaseOrigin ? [supabaseOrigin, supabaseOrigin.replace("https://", "wss://")] : []),
          ...DIRECT_BROWSER_CALL_ORIGINS,
          "http://localhost:*",
          "http://127.0.0.1:*",
          ...localRunnerSources,
          "https://api.openalex.org",
          "https://api.crossref.org",
          "https://api.datacite.org",
          "https://europepmc.org",
          "https://doaj.org",
          "https://api.semanticscholar.org",
          "https://export.arxiv.org",
          "https://api.worldbank.org",
          "https://sdmx.oecd.org",
          "https://challenges.cloudflare.com",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
          "https://accounts.google.com",
        ],
        // CaptchaWidget (src/desk/auth/CaptchaWidget.tsx) injects Cloudflare
        // Turnstile's script tag at runtime and Turnstile renders its
        // challenge in an iframe — both are blocked by helmet's default
        // `'self'`-only script-src/frame-src without these two additions.
        // Google Identity Services (GIS) requires https://accounts.google.com for script and iframe.
        // The hash source allows exactly index.html's one inline script —
        // see INLINE_THEME_SCRIPT_CSP_HASH above.
        "script-src": ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com", INLINE_THEME_SCRIPT_CSP_HASH],
        "frame-src": ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com"],
        "form-action": ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
      },
    } : false,
  })
);

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

// Zero-Retention Privacy Guard: Client-held BYOK keys in transient headers
// are never logged, persisted, or leaked to console or disk.
app.use((req, _res, next) => {
  if (req.headers["x-ai-api-key"] || req.headers["x-api-key"]) {
    // Redact from standard console logging if request headers are inspected
    const key = (req.headers["x-ai-api-key"] || req.headers["x-api-key"]) as string;
    if (key) {
      Object.defineProperty(req.headers, "x-ai-api-key-safe", {
        value: `***${key.slice(-4)}`,
        enumerable: false,
        configurable: true,
      });
    }
  }
  next();
});


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
// Register Supabase streaming reverse proxy BEFORE body parsers to ensure
// raw, unbuffered streaming for database, auth, and storage endpoints.
registerSupabaseProxy(app);

const MAX_UPLOAD_MB = getMaxUploadMb();
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
  max: 60,
  limitBy: "ip",
});

const parseExternalLinkLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  limitBy: "ip",
});

const lookupDoiLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  limitBy: "ip",
});

const studioLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  limitBy: "ip",
});

const projectLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  limitBy: "ip",
});

// ==========================================
// ROUTE REGISTRATION
// ==========================================

// Initialize Document Intelligence Engine & Multi-Agent Mesh
registerDefaultParsers();
registerBuiltinAgents();

// Citation Style Registry (Scholar Core OS) - registered once at startup
const citationStyleRegistry = CitationStyleRegistry.getInstance();
citationStyleRegistry.register(new APA7Formatter());
citationStyleRegistry.register(new IEEEFormatter());
citationStyleRegistry.register(new MLA9Formatter());
citationStyleRegistry.register(new ChicagoFormatter());
citationStyleRegistry.register(new ChicagoNotesFormatter());
citationStyleRegistry.register(new HarvardFormatter());
citationStyleRegistry.register(new VancouverFormatter());

// Register all route handlers
registerHealthRoutes(app);
registerAdminRoutes(app);
registerAuthRoutes(app);
registerAIRoutes(app, aiAbuseLimit, citationStyleRegistry);
registerStudioRoutes(app, studioLimit);
registerProjectRoutes(app, projectLimit);
registerDraftingRoutes(app);
registerAiAccessRoutes(app);
registerSearchRoutes(app);
registerVaultRoutes(app);
registerPresentationRoutes(app);

// Global Error Handler (must be registered after all routes)
app.use(errorHandler);

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

    // Force-unregister any lingering Service Workers and prevent client asset freezing
    app.get(["/sw.js", "/registerSW.js"], (req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(`
        self.addEventListener('install', () => { self.skipWaiting(); });
        self.addEventListener('activate', (e) => {
          e.waitUntil(
            Promise.all([
              self.registration.unregister(),
              caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
              self.clients.claim()
            ]).then(() => {
              return self.clients.matchAll({ type: 'window' });
            }).then((clients) => {
              clients.forEach((c) => { if ('navigate' in c) c.navigate(c.url); });
            })
          );
        });
      `);
    });

    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html") || filePath.endsWith("sw.js") || filePath.endsWith("registerSW.js")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else if (filePath.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));

    // Static Route Guard (B5): Prevent missing assets and crawler files from falling through to index.html
    const staticExtensionRegex = /\.(js|css|json|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|txt)$/i;
    const knownRootFiles = new Set(["/robots.txt", "/llms.txt", "/ai-catalog.json", "/favicon.ico"]);

    app.get("*", (req, res, next) => {
      const cleanPath = req.path;
      if (knownRootFiles.has(cleanPath)) {
        const filePath = path.join(distPath, cleanPath);
        if (!fs.existsSync(filePath)) {
          return res.status(404).type("text/plain").send("Not Found");
        }
      }
      if (staticExtensionRegex.test(cleanPath)) {
        return res.status(404).type("text/plain").send("Not Found");
      }
      next();
    });

    // Single page application support with strict no-cache to guarantee fresh deployments
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Last-resort process guards.
  //
  // Node terminates on an unhandled promise rejection. Express 4 does not
  // await async route handlers, so a rejection inside one is unhandled by
  // definition — which is how a single failed database query killed the whole
  // service in production and returned 502 for every route, including the
  // static frontend and /api/health, neither of which touches the database.
  //
  // Individual handlers still catch their own errors and answer properly (see
  // asyncRoute in server/routes/project.ts); this is the net beneath that, so
  // one missed `await` degrades a request instead of the deployment. Deliberately
  // last-resort, not routine error handling: anything reaching here is a bug
  // worth the loud log.
  process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection (server staying up):", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("uncaughtException (server staying up):", err);
  });

  // Start Server
  const server = http.createServer(app);
  registerSupabaseWsProxy(server);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down HTTP server gracefully...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export { app };

if (process.env.NODE_ENV !== "test") {
  startServer();
}
