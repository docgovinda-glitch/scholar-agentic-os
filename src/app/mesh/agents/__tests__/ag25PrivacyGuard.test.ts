import { describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "../../executor";
import { ag25PrivacyGuard } from "../ag25PrivacyGuard";
import { defaultPolicy, recordConsent, __resetAuditLogForTests, getAuditLog } from "../../../../platform/warden/warden";
import { issue, __resetCapabilitiesForTests } from "../../../../services/capabilities/capabilities";

async function grantAndRun(input: Parameters<typeof ag25PrivacyGuard.run>[0]) {
  const tokens = ag25PrivacyGuard.permissions.map((p) => issue("AG-25", p, "test"));
  return runAgent(ag25PrivacyGuard, input, { subject: "AG-25", capabilityTokenIds: tokens.map((t) => t.id) });
}

describe("app/mesh: AG-25 Privacy Guard", () => {
  beforeEach(() => {
    __resetCapabilitiesForTests();
    __resetAuditLogForTests();
  });

  it("allows public/bibliographic content by default", async () => {
    const record = await grantAndRun({
      request: { provider: "openai", taskClass: "rule_extraction", segments: [{ label: "Published guidelines", text: "Formatting rules." }] },
    });
    expect(record.status).toBe("completed");
    expect(record.output?.decision).toBe("allow");
  });

  it("asks for user content the first time, and allows it after consent is recorded", async () => {
    const request = { provider: "openai", taskClass: "drafting" as const, segments: [{ label: "Your draft", text: "My thesis argument." }] };
    const first = await grantAndRun({ request });
    expect(first.output?.decision).toBe("ask");

    const consented = recordConsent(defaultPolicy(), "openai");
    const second = await grantAndRun({ request, policy: consented });
    expect(second.output?.decision).toBe("allow");
  });

  it("denies restricted content unconditionally", async () => {
    const record = await grantAndRun({
      request: { provider: "openai", taskClass: "drafting", segments: [{ label: "Restricted section", text: "Sensitive." }] },
    });
    expect(record.output?.decision).toBe("deny");
  });

  it("every preview segment is classified, and the decision is always one of the closed set — both QA checkpoints pass", async () => {
    const record = await grantAndRun({
      request: { provider: "openai", taskClass: "chat", segments: [{ label: "Chat message", text: "Hello" }] },
    });
    expect(record.qaResults.every((r) => r.passed)).toBe(true);
  });

  it("records to the Warden's own audit log — this agent doesn't maintain a separate one", async () => {
    expect(getAuditLog()).toHaveLength(0);
    await grantAndRun({ request: { provider: "openai", taskClass: "rule_extraction", segments: [{ label: "Published guidelines", text: "x" }] } });
    expect(getAuditLog()).toHaveLength(1);
  });

  it("defaults to defaultPolicy() when no policy is supplied", async () => {
    const record = await grantAndRun({
      request: { provider: "openai", taskClass: "drafting", segments: [{ label: "Your draft", text: "text" }] },
    });
    expect(record.output?.decision).toBe("ask"); // defaultPolicy's user_content rule, no consent recorded
  });

  it("requires both declared permissions to run", async () => {
    const token = issue("AG-25", "read:egress_request", "test");
    await expect(
      runAgent(
        ag25PrivacyGuard,
        { request: { provider: "openai", taskClass: "chat", segments: [] } },
        { subject: "AG-25", capabilityTokenIds: [token.id] }
      )
    ).rejects.toThrow();
  });
});
