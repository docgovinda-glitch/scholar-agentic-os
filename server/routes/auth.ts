import crypto from "node:crypto";
import express from "express";
import { verifyCaptchaToken } from "../src/middleware/captchaVerify.ts";
import { getBaseIp, rateLimit } from "../src/middleware/rateLimit.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";

export const UNIFORM_LOGIN_ERROR =
  "Invalid credentials. Please check your User ID, email, or mobile number and try again.";

export const UPSTREAM_LOGIN_RATE_LIMIT_ERROR =
  "Too many sign-in attempts right now. Please wait a minute and try again.";

export type IdentifierType = "email" | "username" | "phone" | "unknown";

export function detectIdentifierType(rawIdentifier: string): IdentifierType {
  const identifier = rawIdentifier.trim();
  if (!identifier) return "unknown";
  if (/^\+\d{1,3}\d{6,14}$/.test(identifier)) return "phone";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return "email";
  if (/^[a-zA-Z0-9_-]{1,}$/.test(identifier)) return "username";
  return "unknown";
}

// 5 attempts per 5 minutes per verified client IP: keeps any single attacker IP
// at <= 5/30 (16.7%) of Supabase GoTrue's default 30 requests / 5 minutes
// sign-in rate limit while recovering in 5 minutes for legitimate typos.
export const AUTH_LOGIN_WINDOW_MS = 5 * 60 * 1000;
export const AUTH_LOGIN_MAX_PER_WINDOW = 5;

const authLoginLimiter = rateLimit({
  windowMs: AUTH_LOGIN_WINDOW_MS,
  max: AUTH_LOGIN_MAX_PER_WINDOW,
  limitBy: "ip",
});

const authAvailabilityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  limitBy: "ip",
});

const authVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  limitBy: "ip",
});

async function callServiceRoleRpc<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  args: Record<string, unknown>
): Promise<T | null> {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`RPC ${fnName} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Authentication routes for signup verification, unified login, and availability checks.
 */
export function registerAuthRoutes(app: express.Express): void {
  /**
   * POST /api/auth/verify-signup
   * Verifies CAPTCHA token before allowing signup.
   */
  app.post("/api/auth/verify-signup", authVerifyLimiter, express.json(), async (req, res) => {
    const { captchaToken } = (req.body ?? {}) as { captchaToken?: string };

    if (!captchaToken) {
      return res.status(400).json({
        success: false,
        error: "CAPTCHA token is required",
      });
    }

    const result = await verifyCaptchaToken(captchaToken);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || "CAPTCHA verification failed",
      });
    }

    return res.json({ success: true });
  });

  /**
   * POST /api/auth/login
   *
   * Resolves a flexible login identifier (username, phone E.164, or email) to an
   * email address strictly server-side using service_role, authenticates against
   * GoTrue (/auth/v1/token?grant_type=password), verifies profile account_status,
   * and returns the session tokens. The resolved email address never leaves the server.
   */
  app.post("/api/auth/login", authLoginLimiter, express.json(), async (req, res) => {
    const body = (req.body ?? {}) as {
      identifier?: string;
      username?: string;
      password?: string;
      captchaToken?: string;
    };

    const rawIdentifier = (body.identifier ?? body.username ?? "").trim();
    const password = body.password ?? "";
    const captchaToken = body.captchaToken;

    if (!rawIdentifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Identifier and password are required.",
      });
    }

    const idType = detectIdentifierType(rawIdentifier);
    if (idType === "unknown") {
      return res.status(400).json({
        success: false,
        error: "Invalid User ID, email, or mobile number format.",
      });
    }

    // Cloudflare Turnstile tokens are single-use (see src/services/supabaseAuthService.ts:85-88).
    // Do NOT consume the token via verifyCaptchaToken() in Express before calling GoTrue,
    // because GoTrue validates gotrue_meta_security.captcha_token itself when Supabase Auth
    // Attack Protection is enabled. Only fail fast here if a site key is configured and no
    // token was provided at all.
    const captchaRequired = Boolean(
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
        process.env.CAPTCHA_SECRET_KEY ||
        process.env.VITE_CAPTCHA_SITE_KEY
    );
    if (captchaRequired && !captchaToken) {
      return res.status(400).json({
        success: false,
        error: "CAPTCHA token is required",
      });
    }

    const config = getSupabaseRestConfig();
    if (!config) {
      return res.status(503).json({
        success: false,
        error: "Authentication service is not configured.",
      });
    }

    try {
      let resolvedEmail: string | null = null;
      if (idType === "email") {
        resolvedEmail = rawIdentifier;
      } else if (idType === "username") {
        resolvedEmail = await callServiceRoleRpc<string>(
          config.supabaseUrl,
          config.serviceRoleKey,
          "email_for_username",
          { lookup_username: rawIdentifier }
        );
      } else if (idType === "phone") {
        resolvedEmail = await callServiceRoleRpc<string>(
          config.supabaseUrl,
          config.serviceRoleKey,
          "email_for_phone_e164",
          { lookup_phone_e164: rawIdentifier }
        );
      }

      const hasResolvedEmail =
        typeof resolvedEmail === "string" && resolvedEmail.trim().length > 0;
      const emailForGoTrue =
        typeof resolvedEmail === "string" && resolvedEmail.trim().length > 0
          ? resolvedEmail.trim()
          : `unregistered.${crypto.randomUUID()}@invalid.local`;

      // Always execute the GoTrue password-grant request even when the identifier
      // did not resolve to a registered account, equalizing network + hashing timing
      // and returning the exact same HTTP 401 status and message on every failure path.
      //
      // Forward verified client IP in `Sb-Forwarded-For` for Supabase Auth IP Address
      // Forwarding (note: Supabase GoTrue honors `Sb-Forwarded-For` once the project uses
      // a `sb_secret_...` key and enables Authentication -> Rate Limits -> IP Address Forwarding;
      // while on legacy JWT `service_role`, raise GoTrue's sign-in rate limit on Supabase Pro).
      const clientIp = getBaseIp(req);
      const baseUrl = config.supabaseUrl.replace(/\/+$/, "");
      const tokenRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
          ...(clientIp && clientIp !== "unknown" ? { "Sb-Forwarded-For": clientIp } : {}),
        },
        body: JSON.stringify({
          email: emailForGoTrue,
          password,
          ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        user?: { id?: string; email?: string };
        msg?: string;
        error_description?: string;
        message?: string;
      };

      // Return 429 uniformly (for both known and unknown identifiers) if upstream GoTrue
      // hits its project/IP rate limit, rather than misleading legitimate users with 401.
      if (tokenRes.status === 429) {
        console.warn("[auth/login] Upstream Supabase Auth rate limit (429) reached");
        return res.status(429).json({
          success: false,
          code: "UPSTREAM_AUTH_RATE_LIMIT",
          error: UPSTREAM_LOGIN_RATE_LIMIT_ERROR,
        });
      }

      if (!hasResolvedEmail || !tokenRes.ok || !tokenJson.access_token || !tokenJson.user?.id) {
        return res.status(401).json({
          success: false,
          error: UNIFORM_LOGIN_ERROR,
        });
      }

      const userId = tokenJson.user.id;
      const profilesTable = new SupabaseTable(config, "profiles");
      const rows = (await profilesTable.request(
        `?select=full_name,phone,affiliation,account_status&id=eq.${encodeURIComponent(userId)}`,
        { method: "GET" }
      )) as Array<{
        full_name?: string;
        phone?: string;
        affiliation?: string;
        account_status?: string;
      }>;

      let activeProfile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!activeProfile) {
        const defaultUsername = emailForGoTrue.split("@")[0] || "researcher";
        const createdRows = (await profilesTable.request("", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            id: userId,
            username: defaultUsername,
            full_name: "",
            phone: "",
            phone_country_code: "",
            account_status: "active",
          }),
        })) as Array<{
          full_name?: string;
          phone?: string;
          affiliation?: string;
          account_status?: string;
        }>;
        activeProfile = Array.isArray(createdRows) && createdRows.length > 0 ? createdRows[0] : null;
      }

      if (!activeProfile) {
        return res.status(500).json({
          success: false,
          error: "Scholar profile could not be loaded.",
        });
      }

      if (activeProfile.account_status && activeProfile.account_status !== "active") {
        const statusMessages: Record<string, string> = {
          restricted: "Your account has been restricted. Please contact support.",
          suspended: "Your account has been suspended. Please contact support.",
          deleted: "Your account has been deleted.",
        };
        const statusMessage =
          statusMessages[activeProfile.account_status] || "Your account is not active.";
        return res.status(403).json({
          success: false,
          error: statusMessage,
        });
      }

      return res.json({
        success: true,
        session: {
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expires_in: tokenJson.expires_in,
          token_type: tokenJson.token_type || "bearer",
          user: { id: userId },
        },
        profile: {
          fullName: activeProfile.full_name ?? "",
          phone: activeProfile.phone ?? "",
          affiliation: activeProfile.affiliation ?? "",
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({
        success: false,
        error: "Could not sign you in. Please try again shortly.",
      });
    }
  });

  /**
   * POST /api/auth/check-availability
   *
   * Rate-limited server-side wrapper around check_username_available,
   * check_email_available, and check_phone_available (executed via service_role).
   */
  app.post("/api/auth/check-availability", authAvailabilityLimiter, express.json(), async (req, res) => {
    const { type, value } = (req.body ?? {}) as {
      type?: "username" | "email" | "phone";
      value?: string;
    };

    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!type || !["username", "email", "phone"].includes(type) || !trimmed) {
      return res.status(400).json({ error: "Valid type and value are required." });
    }

    const config = getSupabaseRestConfig();
    if (!config) {
      return res.json({ available: true });
    }

    try {
      let available: boolean | null = true;
      if (type === "username") {
        available = await callServiceRoleRpc<boolean>(
          config.supabaseUrl,
          config.serviceRoleKey,
          "check_username_available",
          { lookup_username: trimmed }
        );
      } else if (type === "email") {
        available = await callServiceRoleRpc<boolean>(
          config.supabaseUrl,
          config.serviceRoleKey,
          "check_email_available",
          { lookup_email: trimmed }
        );
      } else if (type === "phone") {
        available = await callServiceRoleRpc<boolean>(
          config.supabaseUrl,
          config.serviceRoleKey,
          "check_phone_available",
          { lookup_phone_e164: trimmed }
        );
      }

      return res.json({ available: available ?? true });
    } catch {
      // Fail open on RPC failure so missing migration doesn't brick signup;
      // database UNIQUE constraints and GoTrue still enforce uniqueness at signUp().
      return res.json({ available: true });
    }
  });
}
