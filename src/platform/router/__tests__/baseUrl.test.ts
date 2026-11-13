import { describe, it, expect } from "vitest";
import { normalizeBaseUrl } from "../baseUrl";

describe("normalizeBaseUrl", () => {
  it("cuts a pasted full endpoint back to its base and tidies host and slashes", () => {
    expect(normalizeBaseUrl("https://API.Example.com/v1/chat/completions")).toEqual({ ok: true, url: "https://api.example.com/v1", host: "api.example.com" });
    expect(normalizeBaseUrl("api.example.com/v1/models/")).toMatchObject({ ok: true, url: "https://api.example.com/v1" });
    expect(normalizeBaseUrl("https://x.org/openai/v1///")).toMatchObject({ url: "https://x.org/openai/v1" });
  });
  it("keeps a non-default port", () => {
    expect(normalizeBaseUrl("https://gw.example.com:8443/v1")).toMatchObject({ ok: true, url: "https://gw.example.com:8443/v1" });
  });
  it("refuses http (key would travel unencrypted) except loopback when allowed", () => {
    const r = normalizeBaseUrl("http://api.example.com/v1");
    expect(r.ok).toBe(false);
    expect(normalizeBaseUrl("http://localhost:11434", { allowLoopbackHttp: true }).ok).toBe(true);
    expect(normalizeBaseUrl("http://localhost:11434").ok).toBe(false);
    expect(normalizeBaseUrl("http://10.0.0.5/v1", { allowLoopbackHttp: true }).ok).toBe(false);
  });
  it("refuses credentials, query strings, fragments, other schemes and nonsense", () => {
    expect(normalizeBaseUrl("https://user:pw@api.example.com")).toMatchObject({ ok: false });
    expect(normalizeBaseUrl("https://api.example.com/v1?key=abc")).toMatchObject({ ok: false });
    expect(normalizeBaseUrl("https://api.example.com/v1#x")).toMatchObject({ ok: false });
    expect(normalizeBaseUrl("ftp://api.example.com")).toMatchObject({ ok: false });
    expect(normalizeBaseUrl("   ")).toMatchObject({ ok: false });
    expect(normalizeBaseUrl("https://")).toMatchObject({ ok: false });
  });
});

describe("lenient mode (tidy only; the server guard decides what may be reached)", () => {
  it("keeps an http endpoint for a self-hosted install, tidied, and still refuses other schemes", () => {
    expect(normalizeBaseUrl("http://localhost:11434/v1/chat/completions", { lenient: true })).toMatchObject({ ok: true, url: "http://localhost:11434/v1" });
    expect(normalizeBaseUrl("ftp://x.org", { lenient: true }).ok).toBe(false);
  });
});
