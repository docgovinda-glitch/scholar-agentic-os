import type { Express, Request, Response } from "express";
import https from "node:https";
import http from "node:http";
import tls from "node:tls";
import net from "node:net";
import { URL } from "node:url";
import { rateLimit } from "../src/middleware/rateLimit.ts";

const ALLOWED_SUPABASE_PREFIXES = [
  "/auth/v1",
  "/rest/v1",
  "/storage/v1",
  "/functions/v1",
  "/realtime/v1",
];

const httpsAgent = new https.Agent({
  rejectUnauthorized: true,
  keepAlive: true,
});

const supabaseProxyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  limitBy: "ip",
});

/**
 * Returns the remote upstream Supabase URL, or null when unconfigured (fail-closed, F-07).
 * Prefers SUPABASE_TARGET_URL, SUPABASE_URL, or an explicit full http(s) URL from VITE_SUPABASE_URL.
 */
export function getRemoteSupabaseUrl(): string | null {
  const candidates = [
    process.env.SUPABASE_TARGET_URL,
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ];

  for (const raw of candidates) {
    if (raw && raw.startsWith("http") && !raw.includes("/api/supabase")) {
      return raw.replace(/\/+$/, "");
    }
  }

  return null;
}

export function isAllowedSupabaseSubpath(subpath: string): boolean {
  const pathOnly = (subpath.split("?")[0] || "/").trim();
  if (pathOnly.includes("..") || pathOnly.includes("\\")) {
    return false;
  }
  return ALLOWED_SUPABASE_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );
}

/**
 * Registers a transparent, zero-memory-buffering streaming reverse proxy
 * for Supabase endpoints at `/api/supabase/*`.
 */
export function registerSupabaseProxy(app: Express): void {
  app.use("/api/supabase", supabaseProxyRateLimit, (req: Request, res: Response) => {
    const remoteUrlStr = getRemoteSupabaseUrl();
    if (!remoteUrlStr) {
      res.status(503).json({
        error: "Service Unavailable",
        message: "Supabase upstream URL is not configured (set VITE_SUPABASE_URL or SUPABASE_URL).",
      });
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(remoteUrlStr);
    } catch {
      res.status(503).json({
        error: "Service Unavailable",
        message: "Invalid Supabase upstream URL configuration.",
      });
      return;
    }

    // req.url inside app.use('/api/supabase') has /api/supabase stripped by Express
    const subpath = req.url || "/";

    if (!isAllowedSupabaseSubpath(subpath)) {
      res.status(403).json({
        error: "Forbidden",
        message: "Proxy path is not on the Supabase API allowlist (/auth/v1, /rest/v1, /storage/v1, /functions/v1).",
      });
      return;
    }

    if (req.headers.upgrade && String(req.headers.upgrade).toLowerCase() === "websocket") {
      res.status(426).json({
        error: "Upgrade Required",
        message: "WebSocket connections must connect directly to Supabase Realtime endpoint",
      });
      return;
    }

    const isHttps = targetUrl.protocol === "https:";
    const transport = isHttps ? https : http;
    const defaultPort = isHttps ? 443 : 80;

    // Clone and sanitize incoming headers
    const forwardedHeaders: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: targetUrl.hostname,
      "x-forwarded-host": req.headers.host || targetUrl.hostname,
      "x-forwarded-proto": req.protocol || "https",
    };

    // Remove hop-by-hop and length headers that might mismatch during streaming
    delete forwardedHeaders["content-length"];
    delete forwardedHeaders["connection"];
    delete forwardedHeaders["keep-alive"];

    const requestOptions: https.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port ? Number(targetUrl.port) : defaultPort,
      path: subpath,
      method: req.method,
      headers: forwardedHeaders,
      timeout: 30000,
      ...(isHttps ? { agent: httpsAgent, rejectUnauthorized: true } : {}),
    };

    const proxyReq = transport.request(requestOptions, (proxyRes) => {
      const responseHeaders: Record<string, string | string[] | undefined> = { ...proxyRes.headers };

      // Rewrite redirect Location headers if they point directly to the remote Supabase URL
      const location = responseHeaders["location"];
      if (typeof location === "string" && location.includes(targetUrl.host)) {
        const incomingProto = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const incomingHost = req.headers.host || targetUrl.hostname;
        responseHeaders["location"] = location.replace(
          `${targetUrl.protocol}//${targetUrl.host}`,
          `${incomingProto}://${incomingHost}/api/supabase`
        );
      }

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[Supabase Proxy] Upstream request error:", err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: "Bad Gateway",
          message: "Could not communicate with upstream Supabase database.",
        });
      }
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy(new Error("Upstream timeout"));
    });

    // Pipe the request body directly into the proxy request (streamed, zero buffering)
    req.pipe(proxyReq);
  });
}

/**
 * Registers an HTTP WebSocket upgrade proxy on the underlying Node http.Server.
 */
export function registerSupabaseWsProxy(server: http.Server): void {
  server.on("upgrade", (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    if (!req.url || !req.url.startsWith("/api/supabase")) {
      return;
    }

    const remoteUrlStr = getRemoteSupabaseUrl();
    if (!remoteUrlStr) {
      clientSocket.destroy();
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(remoteUrlStr);
    } catch {
      clientSocket.destroy();
      return;
    }

    const subpath = req.url.replace(/^\/api\/supabase/, "") || "/";
    if (!isAllowedSupabaseSubpath(subpath)) {
      clientSocket.destroy();
      return;
    }

    const isHttps = targetUrl.protocol === "https:";
    const defaultPort = isHttps ? 443 : 80;
    const targetPort = targetUrl.port ? Number(targetUrl.port) : defaultPort;

    const connectOptions: tls.ConnectionOptions = {
      host: targetUrl.hostname,
      port: targetPort,
      servername: targetUrl.hostname,
      rejectUnauthorized: true,
    };

    const upstreamSocket: net.Socket = isHttps
      ? tls.connect(connectOptions)
      : net.connect(connectOptions as net.NetConnectOpts);

    const onConnected = () => {
      let reqLines = `${req.method} ${subpath} HTTP/${req.httpVersion}\r\n`;
      if (req.rawHeaders) {
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const key = req.rawHeaders[i];
          const val = req.rawHeaders[i + 1];
          if (key.toLowerCase() === "host") {
            reqLines += `Host: ${targetUrl.hostname}\r\n`;
          } else {
            reqLines += `${key}: ${val}\r\n`;
          }
        }
      }
      reqLines += "\r\n";

      try {
        upstreamSocket.write(reqLines);
        if (head && head.length > 0) {
          upstreamSocket.write(head);
        }

        clientSocket.pipe(upstreamSocket);
        upstreamSocket.pipe(clientSocket);
      } catch {
        clientSocket.destroy();
        upstreamSocket.destroy();
      }
    };

    if (isHttps) {
      (upstreamSocket as tls.TLSSocket).on("secureConnect", onConnected);
    } else {
      upstreamSocket.on("connect", onConnected);
    }

    upstreamSocket.on("error", () => {
      clientSocket.destroy();
    });

    clientSocket.on("error", () => {
      upstreamSocket.destroy();
    });
  });
}
