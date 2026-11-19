/**
 * Cleans and validates an endpoint address a person typed for an AI provider.
 * Pure, shared by the browser (before saving), the keyring and the server.
 *
 * - people paste whatever the provider's docs show, so a full endpoint
 *   (".../chat/completions", ".../models") is cut back to its base;
 * - https only (a local runner on this machine may use http on a loopback address);
 * - no username/password in the address (the key goes in the key field), no
 *   query string or fragment (they would leak into every request and log);
 * - the host is lower-cased and trailing slashes removed, so the same address
 *   always produces the same cache and circuit-breaker keys.
 *
 * The server still screens the result (`aiEndpointGuard`): this is for clear
 * messages and tidy values, not the security boundary.
 */
export type BaseUrlResult = { ok: true; url: string; host: string } | { ok: false; reason: string };

const ENDPOINT_TAILS = /\/(?:chat\/completions|completions|models|messages|embeddings|responses)\/?$/i;
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

const PRIVATE_HOST = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)|^\[[^\]]*\]$|\.(local|internal|lan|home|localdomain)$|^[^.]+$/i;

/**
 * True for an https address that is plausibly reachable from the public
 * internet (a Cloudflare/ngrok tunnel, Modal, LiteLLM): not loopback, not a
 * private-range literal, not a single-label or .local/.internal name. A cheap
 * routing hint only; the server guard (`checkAiEndpoint`) does the real DNS check.
 */
export function isRemoteHttpsEndpoint(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !LOOPBACK.test(u.hostname) && !PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(raw: string, opts: { allowLoopbackHttp?: boolean; /** Tidy only: accept http too and leave the https/public-address decision to the server guard (self-hosted installs may allow private http endpoints). */ lenient?: boolean } = {}): BaseUrlResult {
  const text = raw.replace(/[^\x20-\x7E]/g, "").trim();
  if (!text) return { ok: false, reason: "Enter the address." };
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return { ok: false, reason: "That is not a valid web address." }; }
  const loopback = LOOPBACK.test(url.hostname);
  if (opts.lenient && url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "The address must be an http(s) web address." };
  if (!opts.lenient && url.protocol !== "https:" && !(opts.allowLoopbackHttp && url.protocol === "http:" && loopback)) {
    return { ok: false, reason: url.protocol === "http:" ? "The address must start with https:// (your key would travel unencrypted otherwise)." : "The address must be an https:// web address." };
  }
  if (url.username || url.password) return { ok: false, reason: "Put the key in the key field, not in the address." };
  if (!opts.lenient && (url.search || url.hash)) return { ok: false, reason: "Remove everything after ? or # from the address." };
  let path = url.pathname.replace(/\/+$/, "");
  for (let i = 0; i < 2 && ENDPOINT_TAILS.test(path); i++) path = path.replace(ENDPOINT_TAILS, "");
  return { ok: true, url: `${url.protocol}//${url.host.toLowerCase()}${path}`, host: url.hostname.toLowerCase() };
}
