import { describe, it, expect, beforeEach } from "vitest";
import { issue, verify, revoke, revokeAll, listBySubject, __resetCapabilitiesForTests } from "../capabilities";
import { CapabilityDeniedError, CapabilityNotFoundError } from "../types";

describe("services/capabilities", () => {
  beforeEach(() => {
    __resetCapabilitiesForTests();
  });

  it("issues a token that verifies for the exact subject/capability it was granted for", () => {
    const token = issue("AG-04", "read:vault", "user-1");
    expect(verify(token.id, "AG-04", "read:vault")).toBe(true);
  });

  it("write:draft is refused unconditionally — no agent or plugin ever holds it (docs 46 §8.2)", () => {
    expect(() => issue("AG-anything", "write:draft", "user-1")).toThrow(CapabilityDeniedError);
  });

  it("rejects an unknown capability string", () => {
    expect(() => issue("AG-04", "read:everything", "user-1")).toThrow(CapabilityDeniedError);
  });

  it("is non-transferable — a token verifies only for the subject it was issued to", () => {
    const token = issue("AG-04", "read:vault", "user-1");
    expect(verify(token.id, "AG-07", "read:vault")).toBe(false);
  });

  it("does not verify for a different capability than it was issued for", () => {
    const token = issue("AG-04", "read:vault", "user-1");
    expect(verify(token.id, "AG-04", "read:corpus")).toBe(false);
  });

  it("scope narrows the grant — a project-scoped token does not verify for a different project", () => {
    const token = issue("AG-01", "read:project", "user-1", "proj-a");
    expect(verify(token.id, "AG-01", "read:project", "proj-a")).toBe(true);
    expect(verify(token.id, "AG-01", "read:project", "proj-b")).toBe(false);
  });

  it("an unscoped token verifies regardless of the caller's scope argument", () => {
    const token = issue("AG-01", "read:project", "user-1");
    expect(verify(token.id, "AG-01", "read:project", "proj-a")).toBe(true);
    expect(verify(token.id, "AG-01", "read:project")).toBe(true);
  });

  it("revoke() makes verify() return false immediately, and is idempotent", () => {
    const token = issue("AG-04", "read:vault", "user-1");
    const revoked = revoke(token.id);
    expect(revoked.revoked).toBe(true);
    expect(verify(token.id, "AG-04", "read:vault")).toBe(false);
    expect(() => revoke(token.id)).not.toThrow(); // idempotent
  });

  it("revoke() on an unknown token id throws CapabilityNotFoundError", () => {
    expect(() => revoke("cap-nope")).toThrow(CapabilityNotFoundError);
  });

  it("revokeAll() revokes every active token for a subject and returns the count", () => {
    issue("AG-04", "read:vault", "user-1");
    issue("AG-04", "read:corpus", "user-1");
    issue("AG-07", "read:vault", "user-1");
    expect(revokeAll("AG-04")).toBe(2);
    expect(listBySubject("AG-04").every((t) => t.revoked)).toBe(true);
    expect(listBySubject("AG-07").every((t) => !t.revoked)).toBe(true);
  });

  it("verify() on a nonexistent token id returns false rather than throwing", () => {
    expect(verify("cap-nope", "AG-04", "read:vault")).toBe(false);
  });
});
