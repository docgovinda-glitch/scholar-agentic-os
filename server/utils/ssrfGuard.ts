/**
 * SSRF Guard & Secure URL Fetching Service for Source Library
 *
 * Implements multi-layered defenses against Server-Side Request Forgery (SSRF)
 * and DNS Rebinding attacks:
 * 1. Protocol validation (HTTP/HTTPS only).
 * 2. Hostname blacklist (localhost, *.local, *.internal, cloud metadata).
 * 3. Pre-flight DNS resolution with comprehensive IPv4 & IPv6 private/reserved range checks.
 * 4. Socket-level connection pinning / DNS rebinding guard.
 * 5. Strict manual redirect validation (each hop validated independently).
 * 6. Streaming byte-size capping (max 2 MB) and timeout enforcement (8s).
 * 7. Content-type filtering (HTML/text only; reject binaries).
 * 8. Zero body logging or persistent storage.
 */

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedProtocols?: string[];
}

export interface SafeFetchResult {
  url: string;
  statusCode: number;
  contentType: string;
  body: string;
}

export interface UrlValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIps?: string[];
}

// Blocked hostnames
const FORBIDDEN_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "local",
  "internal",
  "metadata.google.internal",
  "instance-data",
  "metadata.tencentyun.com",
]);

/**
 * Checks whether an IPv4 address belongs to a private, loopback, or reserved subnet.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
    return true; // Invalid format treated as unsafe
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network / default route)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private-Use RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link Local RFC 3927 / Cloud Metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private-Use RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.168.0.0/16 (Private-Use RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking RFC 2544)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to a private, loopback, or reserved subnet.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // IPv6 Loopback (::1) or Unspecified (::)
  if (normalized === "::1" || normalized === "::") return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith("::ffff:")) {
    const v4Part = normalized.slice(7);
    if (v4Part.includes(".")) {
      return isPrivateOrReservedIPv4(v4Part);
    }
    // If hex-represented IPv4 in IPv6
    const hexParts = v4Part.split(":");
    if (hexParts.length === 2) {
      const num1 = parseInt(hexParts[0], 16);
      const num2 = parseInt(hexParts[1], 16);
      const a = (num1 >> 8) & 0xff;
      const b = num1 & 0xff;
      const c = (num2 >> 8) & 0xff;
      const d = num2 & 0xff;
      return isPrivateOrReservedIPv4(`${a}.${b}.${c}.${d}`);
    }
    return true;
  }

  // Unique Local Address (ULA) fc00::/7 (fc00... or fd00...)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // Link-Local fe80::/10 (fe8..., fe9..., fea..., feb...)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Site-Local fec0::/10 (deprecated but reserved)
  if (
    normalized.startsWith("fec") ||
    normalized.startsWith("fed") ||
    normalized.startsWith("fee") ||
    normalized.startsWith("fef")
  ) {
    return true;
  }

  // Discard prefix 100::/64
  if (normalized.startsWith("100:")) return true;

  // Documentation 2001:db8::/32
  if (normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")) return true;

  return false;
}

/**
 * Validates whether an IP address is private or reserved.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes(":")) {
    return isPrivateOrReservedIPv6(ip);
  }
  return isPrivateOrReservedIPv4(ip);
}

/**
 * Validates a target URL against SSRF rules:
 * - Scheme must be http: or https:
 * - Hostname cannot be a forbidden internal domain
 * - Resolved IPs must not belong to private/loopback/cloud-metadata subnets
 */
export async function validateSafeUrl(targetUrl: string): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { safe: false, reason: "Malformed or unparseable URL" };
  }

  // Protocol check
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `Forbidden URL scheme: ${parsed.protocol}. Only HTTP/HTTPS allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Hostname blacklist
  if (
    FORBIDDEN_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { safe: false, reason: `Forbidden internal host: ${hostname}` };
  }

  // Direct IP address in hostname
  // IPv6 bracketed: [::1] -> ::1
  const cleanHost = hostname.replace(/^\[|\]$/g, "");
  if (netIsIP(cleanHost)) {
    if (isPrivateOrReservedIp(cleanHost)) {
      return { safe: false, reason: `Direct access to private/reserved IP is blocked: ${cleanHost}` };
    }
    return { safe: true, resolvedIps: [cleanHost] };
  }

  // DNS lookup
  try {
    const lookups = await dns.promises.lookup(hostname, { all: true });
    if (!lookups || lookups.length === 0) {
      return { safe: false, reason: `DNS resolution returned no addresses for ${hostname}` };
    }

    const resolvedIps = lookups.map((l) => l.address);

    // If ANY resolved IP is private or reserved, block to prevent DNS rebinding
    for (const ip of resolvedIps) {
      if (isPrivateOrReservedIp(ip)) {
        return {
          safe: false,
          reason: `Host ${hostname} resolved to forbidden private/reserved IP: ${ip}`,
          resolvedIps,
        };
      }
    }

    return { safe: true, resolvedIps };
  } catch (err: any) {
    return { safe: false, reason: `DNS lookup failed for ${hostname}: ${err.message}` };
  }
}

function netIsIP(host: string): number {
  // Simple check if string is IPv4 or IPv6
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return 4;
  if (host.includes(":") && !host.includes(".")) return 6;
  if (host.includes(":") && host.includes(".")) return 6; // v4 mapped
  return 0;
}

/**
 * Creates a socket lookup function that intercepts DNS resolution during the actual connection
 * to completely eliminate DNS rebinding vulnerabilities (TOCTOU).
 */
export function createRebindingSafeLookup(
  allowedIps: Set<string>,
  customDnsResolver?: (
    hostname: string,
    options: any,
    callback: (err: Error | null, address: string | any, family: number) => void
  ) => void
) {
  return (
    hostname: string,
    options: any,
    callback: (err: Error | null, address: string | any, family: number) => void
  ) => {
    const resolver = customDnsResolver || dns.lookup;
    resolver(hostname, { ...options, all: false }, (err, address, family) => {
      if (err) return callback(err, address, family);

      const addrStr = typeof address === "string" ? address : address?.address;
      if (!addrStr || isPrivateOrReservedIp(addrStr)) {
        return callback(
          new Error(`DNS Rebinding violation: destination resolved to private IP ${addrStr}`),
          "",
          family
        );
      }

      if (allowedIps && allowedIps.size > 0 && !allowedIps.has(addrStr)) {
        return callback(
          new Error(`DNS Rebinding violation: destination rebounded to unverified IP ${addrStr}`),
          "",
          family
        );
      }

      callback(null, address, family);
    });
  };
}

/**
 * Safely fetches a URL with SSRF protection, connection-time DNS pinning, strict redirect checks,
 * byte-size caps, timeout enforcement, and transient in-memory processing.
 *
 * GUARANTEE: Fetched webpage content is processed transiently and is NOT:
 * - persisted
 * - cached
 * - logged
 * - stored in Source records
 * - stored in source-library.json
 * - stored in database records
 * - sent to analytics
 * It may subsequently become eligible for runtime garbage collection.
 */
export async function safeFetchHtml(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024; // 2 MB max
  const maxRedirects = options.maxRedirects ?? 5;

  let currentUrl = rawUrl;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    // 1. Validate destination before every request/redirect
    const validation = await validateSafeUrl(currentUrl);
    if (!validation.safe) {
      throw new Error(`SSRF Blocked: ${validation.reason}`);
    }

    const parsed = new URL(currentUrl);
    const isHttps = parsed.protocol === "https:";
    const client = isHttps ? https : http;

    const allowedIps = new Set(validation.resolvedIps || []);
    const customLookup = createRebindingSafeLookup(allowedIps);

    const agentOptions = {
      lookup: customLookup,
      keepAlive: false,
    };
    const agent = isHttps ? new https.Agent(agentOptions) : new http.Agent(agentOptions);

    const result = await new Promise<{
      statusCode: number;
      headers: http.IncomingHttpHeaders;
      body: string;
      redirectUrl?: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const req = client.request(
        currentUrl,
        {
          method: "GET",
          agent,
          headers: {
            "User-Agent": "ScholarCore-SourceBot/3.0 (+https://scholar-core.org; privacy-first)",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
            Connection: "close",
          },
        },
        (res) => {
          clearTimeout(timer);

          const statusCode = res.statusCode || 0;

          // Check for redirects (301, 302, 303, 307, 308)
          if ([301, 302, 303, 307, 308].includes(statusCode)) {
            const loc = res.headers.location;
            res.resume(); // Discard body
            if (!loc) {
              return reject(new Error(`Redirect status ${statusCode} with missing Location header`));
            }
            try {
              const nextUrl = new URL(loc, currentUrl).href;
              return resolve({ statusCode, headers: res.headers, body: "", redirectUrl: nextUrl });
            } catch (err: any) {
              return reject(new Error(`Invalid redirect Location: ${loc}`));
            }
          }

          // Content-Length check if provided
          const cl = res.headers["content-length"];
          if (cl && parseInt(cl, 10) > maxBytes) {
            res.destroy();
            return reject(new Error(`Response size exceeds limit of ${maxBytes} bytes (Content-Length: ${cl})`));
          }

          // Content-Type check (HTML / Text only)
          const contentType = (res.headers["content-type"] || "").toLowerCase();
          const isAllowedType =
            contentType.includes("text/html") ||
            contentType.includes("application/xhtml+xml") ||
            contentType.includes("text/plain") ||
            contentType === "";

          if (!isAllowedType) {
            res.destroy();
            return reject(new Error(`Unsupported content-type for metadata extraction: ${contentType}`));
          }

          let receivedBytes = 0;
          const chunks: Buffer[] = [];

          res.on("data", (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > maxBytes) {
              res.destroy();
              return reject(new Error(`Response body exceeded maximum limit of ${maxBytes} bytes`));
            }
            chunks.push(chunk);
          });

          res.on("end", () => {
            const fullBody = Buffer.concat(chunks).toString("utf-8");
            resolve({
              statusCode,
              headers: res.headers,
              body: fullBody,
            });
          });

          res.on("error", (err) => reject(err));
        }
      );

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      req.end();
    });

    if (result.redirectUrl) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (max ${maxRedirects})`);
      }
      currentUrl = result.redirectUrl;
      continue;
    }

    const finalContentType = (result.headers["content-type"] || "text/html").toLowerCase();

    return {
      url: currentUrl,
      statusCode: result.statusCode,
      contentType: finalContentType,
      body: result.body,
    };
  }

  throw new Error("Redirect resolution failed");
}

/**
 * Extracts lightweight academic metadata from an HTML string without persisting it.
 */
export function extractLightweightUrlMetadata(
  html: string,
  url: string
): {
  title: string;
  publisher?: string;
  authors: string[];
  year?: string;
  description?: string;
} {
  const parsed = new URL(url);

  // 1. Title extraction
  let title = "";
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const twitterTitle = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
  const tagTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const citationTitle = html.match(/<meta[^>]+name=["']citation_title["'][^>]+content=["']([^"']+)["']/i);

  if (citationTitle?.[1]) title = citationTitle[1].trim();
  else if (ogTitle?.[1]) title = ogTitle[1].trim();
  else if (twitterTitle?.[1]) title = twitterTitle[1].trim();
  else if (tagTitle?.[1]) title = tagTitle[1].trim();

  // Clean HTML entities from title
  title = title
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    title = parsed.hostname;
  }

  // 2. Publisher / Site name
  let publisher: string | undefined;
  const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  const citPublisher = html.match(/<meta[^>]+name=["']citation_publisher["'][^>]+content=["']([^"']+)["']/i);
  if (citPublisher?.[1]) publisher = citPublisher[1].trim();
  else if (ogSite?.[1]) publisher = ogSite[1].trim();
  else publisher = parsed.hostname;

  // 3. Authors
  const authors: string[] = [];
  const authorRegex = /<meta[^>]+(?:name=["'](?:citation_author|author)["'])[^>]+content=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = authorRegex.exec(html)) !== null) {
    const author = match[1].trim();
    if (author && !authors.includes(author)) {
      authors.push(author);
    }
  }

  // 4. Year
  let year: string | undefined;
  const dateMatch =
    html.match(/<meta[^>]+name=["'](?:citation_publication_date|citation_date|article:published_time)["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);

  if (dateMatch?.[1]) {
    const yr = dateMatch[1].match(/\b(19\d\d|20\d\d)\b/);
    if (yr) year = yr[1];
  }

  // 5. Description / snippet (short only)
  let description: string | undefined;
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch?.[1]) {
    description = descMatch[1].slice(0, 300).trim();
  }

  return {
    title,
    publisher,
    authors,
    year,
    description,
  };
}
