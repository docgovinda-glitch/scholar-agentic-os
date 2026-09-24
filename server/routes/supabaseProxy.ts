import type { Express, Request, Response } from "express";
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

/**
 * Returns the remote upstream Supabase URL.
 * Prefers SUPABASE_TARGET_URL or an explicit full https URL from VITE_SUPABASE_URL.
 * Falls back to the production project URL.
 */
export function getRemoteSupabaseUrl(): string {
  const customTarget = process.env.SUPABASE_TARGET_URL;
  if (customTarget && customTarget.startsWith("http")) {
    return customTarget.replace(/\/+$/, "");
  }

  const viteUrl = process.env.VITE_SUPABASE_URL;
  if (viteUrl && viteUrl.startsWith("http") && !viteUrl.includes("/api/supabase")) {
    return viteUrl.replace(/\/+$/, "");
  }

  return "https://gfjhsijrwodjvkisouzw.supabase.co";
}

/**
 * Registers a transparent, zero-memory-buffering streaming reverse proxy
 * for Supabase endpoints at `/api/supabase/*`.
 *
 * This allows client browsers on institutional networks (which block *.supabase.co)
 * to interact with Supabase purely through the application's own origin
 * (scholar.gkshah.com.np/api/supabase/*), entirely preventing SSL interception
 * and firewall access-denied blocks.
 */
export function registerSupabaseProxy(app: Express): void {
  const remoteUrlStr = getRemoteSupabaseUrl();
  let targetUrl: URL;
  try {
    targetUrl = new URL(remoteUrlStr);
  } catch {
    targetUrl = new URL("https://gfjhsijrwodjvkisouzw.supabase.co");
  }

  const isHttps = targetUrl.protocol === "https:";
  const transport = isHttps ? https : http;
  const defaultPort = isHttps ? 443 : 80;

  app.use("/api/supabase", (req: Request, res: Response) => {
    // req.url inside app.use('/api/supabase') has /api/supabase stripped by Express
    const subpath = req.url || "/";

    // If an incoming request requests a WebSocket upgrade, standard Express HTTP middleware
    // cannot switch protocols. Return a 426 Upgrade Required with clean guidance instead of forwarding
    // a truncated HTTP GET request to Supabase that triggers upstream 500 errors.
    if (req.headers.upgrade && String(req.headers.upgrade).toLowerCase() === "websocket") {
      res.status(426).json({
        error: "Upgrade Required",
        message: "WebSocket connections must connect directly to Supabase Realtime endpoint",
      });
      return;
    }

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
