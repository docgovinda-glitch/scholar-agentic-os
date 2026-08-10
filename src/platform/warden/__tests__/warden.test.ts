import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluate,
  defaultPolicy,
  recordConsent,
  markRestricted,
  unmarkRestricted,
  getAuditLog,
  __resetAuditLogForTests,
} from "../warden";
import type { EgressRequest } from "../types";

describe("Warden: classification", () => {
  it("classifies drafting/refinement/chat/summarisation/embedding as user_content by default", () => {
    for (const taskClass of ["drafting", "refinement", "chat", "summarisation", "embedding"] as const) {
      const req: EgressRequest = {
        provider: "openai",
        taskClass,
        segments: [{ label: "Your text", text: "the sample comprised 240 participants" }],
      };
      const result = evaluate(req, defaultPolicy());
      expect(result.egressClass).toBe("user_content");
    }
  });

  it("classifies rule_extraction against a guidelines document as public", () => {
    const req: EgressRequest = {
      provider: "openai",
      taskClass: "rule_extraction",
      segments: [{ label: "Published journal guidelines", text: "Manuscripts must not exceed 6000 words." }],
    };
    const result = evaluate(req, defaultPolicy());
    expect(result.egressClass).toBe("public");
  });

  it("classifies citation/reference metadata as bibliographic", () => {
    const req: EgressRequest = {
      provider: "openai",
      taskClass: "verification",
      segments: [{ label: "Citation metadata", text: "Chen et al. 2021, Water Research" }],
    };
    const result = evaluate(req, defaultPolicy());
    expect(result.egressClass).toBe("bibliographic");
  });

  it("resolves ambiguity to the HIGHER class, never the lower (fail closed)", () => {
    const req: EgressRequest = {
      provider: "openai",
      taskClass: "verification", // otherwise defaults to "derived"
      segments: [
        { label: "Citation metadata", text: "..." }, // bibliographic
        { label: "Your text", text: "..." }, // ambiguous label -> defaults per task; verification default = derived
        { label: "restricted notes", text: "..." }, // explicit restricted marker
      ],
    };
    const result = evaluate(req, defaultPolicy());
    // restricted must dominate every other segment's class
    expect(result.egressClass).toBe("restricted");
  });

  it("an unmatched label under a non-content task still fails toward user_content, not public", () => {
    const req: EgressRequest = {
      provider: "openai",
      taskClass: "classification",
      segments: [{ label: "mystery payload", text: "..." }],
    };
    const result = evaluate(req, defaultPolicy());
    expect(result.egressClass).toBe("user_content");
  });
});

describe("Warden: policy decisions", () => {
  it("allows public, bibliographic, and derived content by default", () => {
    for (const [taskClass, label] of [
      ["rule_extraction", "published guideline"],
      ["verification", "citation metadata"],
      ["discovery", "search query"],
    ] as const) {
      const result = evaluate(
        { provider: "openai", taskClass, segments: [{ label, text: "x" }] },
        defaultPolicy()
      );
      expect(result.decision).toBe("allow");
    }
  });

  it("asks for consent the first time user_content would go to a provider", () => {
    const result = evaluate(
      { provider: "openai", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }] },
      defaultPolicy()
    );
    expect(result.decision).toBe("ask");
    expect(result.requiresConsent).toBe(true);
  });

  it("allows user_content on subsequent calls once consent is recorded", () => {
    let policy = defaultPolicy();
    policy = recordConsent(policy, "openai");
    const result = evaluate(
      { provider: "openai", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }] },
      policy
    );
    expect(result.decision).toBe("allow");
    expect(result.requiresConsent).toBe(false);
  });

  it("consent for one provider does not leak to another", () => {
    let policy = defaultPolicy();
    policy = recordConsent(policy, "openai");
    const result = evaluate(
      { provider: "anthropic", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }] },
      policy
    );
    expect(result.decision).toBe("ask");
  });

  it("NEVER allows restricted content to any provider under default policy", () => {
    for (const provider of ["openai", "anthropic", "google", "openrouter", "ollama"]) {
      const result = evaluate(
        { provider, taskClass: "drafting", segments: [{ label: "restricted participant data", text: "x" }] },
        defaultPolicy()
      );
      expect(result.decision).toBe("deny");
      expect(result.egressClass).toBe("restricted");
    }
  });

  it("denies everything for a scope the user has explicitly marked restricted, regardless of segment content", () => {
    let policy = defaultPolicy();
    policy = markRestricted(policy, "project-123");
    const result = evaluate(
      {
        provider: "openai",
        taskClass: "rule_extraction", // would otherwise be "public"/"allow"
        scopeId: "project-123",
        segments: [{ label: "published guideline", text: "totally public text" }],
      },
      policy
    );
    expect(result.decision).toBe("deny");
  });

  it("unmarking restricted restores normal policy evaluation", () => {
    let policy = defaultPolicy();
    policy = markRestricted(policy, "project-123");
    policy = unmarkRestricted(policy, "project-123");
    const result = evaluate(
      {
        provider: "openai",
        taskClass: "rule_extraction",
        scopeId: "project-123",
        segments: [{ label: "published guideline", text: "x" }],
      },
      policy
    );
    expect(result.decision).toBe("allow");
  });
});

describe("Warden: tier-aware policy (local execution)", () => {
  it("allows user_content to a local runtime without asking for consent, on the very first call", () => {
    const result = evaluate(
      { provider: "ollama", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }], local: true },
      defaultPolicy()
    );
    expect(result.decision).toBe("allow");
    expect(result.requiresConsent).toBe(false);
  });

  it("explains WHY local doesn't ask — the reason accurately says the request stays on-device, not a cloud-transfer claim", () => {
    const result = evaluate(
      { provider: "ollama", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }], local: true },
      defaultPolicy()
    );
    expect(result.reason).toMatch(/runs on your computer/i);
    expect(result.reason).toMatch(/not sent to Scholar's AI servers/i);
  });

  it("does NOT affect the non-local ask-for-consent flow for the very same provider id", () => {
    // Regression: marking a request `local` must never leak into how a
    // non-local request from the same provider id is evaluated.
    const result = evaluate(
      { provider: "ollama", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }], local: false },
      defaultPolicy()
    );
    expect(result.decision).toBe("ask");
    expect(result.requiresConsent).toBe(true);
  });

  it("still denies restricted content to a local runtime — local is not a general exemption from hard denies", () => {
    const result = evaluate(
      { provider: "ollama", taskClass: "drafting", segments: [{ label: "restricted participant data", text: "x" }], local: true },
      defaultPolicy()
    );
    expect(result.decision).toBe("deny");
    expect(result.requiresConsent).toBe(false);
  });

  it("still denies a scope the user has explicitly marked restricted, even for a local runtime", () => {
    let policy = defaultPolicy();
    policy = markRestricted(policy, "project-123");
    const result = evaluate(
      {
        provider: "ollama",
        taskClass: "drafting",
        scopeId: "project-123",
        segments: [{ label: "Your text", text: "x" }],
        local: true,
      },
      policy
    );
    expect(result.decision).toBe("deny");
  });

  it("allows public/bibliographic/derived content locally exactly as it would for a cloud provider (unaffected by the local bypass)", () => {
    const result = evaluate(
      { provider: "ollama", taskClass: "rule_extraction", segments: [{ label: "published guideline", text: "x" }], local: true },
      defaultPolicy()
    );
    expect(result.decision).toBe("allow");
  });
});

describe("Warden: preview and minimisation", () => {
  it("the preview shows exactly what would be sent, per segment, before it is sent", () => {
    const result = evaluate(
      {
        provider: "openai",
        taskClass: "drafting",
        segments: [
          { label: "Your text: current section", text: "Analysis proceeded in two stages." },
        ],
      },
      recordConsent(defaultPolicy(), "openai")
    );
    expect(result.preview).toHaveLength(1);
    expect(result.preview[0].text).toBe("Analysis proceeded in two stages.");
    expect(result.preview[0].label).toBe("Your text: current section");
  });

  it("redacts segment text when policy decision is redact, but preserves the label", () => {
    const policy = defaultPolicy();
    policy.rules.user_content = "redact";
    const result = evaluate(
      { provider: "openai", taskClass: "drafting", segments: [{ label: "Your text", text: "sensitive content" }] },
      policy
    );
    expect(result.decision).toBe("redact");
    expect(result.preview[0].text).not.toContain("sensitive content");
    expect(result.preview[0].label).toBe("Your text");
  });
});

describe("Warden: egress audit", () => {
  beforeEach(() => __resetAuditLogForTests());

  it("records every evaluation, allowed or not", () => {
    evaluate(
      { provider: "openai", taskClass: "drafting", segments: [{ label: "Your text", text: "x" }] },
      defaultPolicy()
    );
    evaluate(
      { provider: "openai", taskClass: "drafting", segments: [{ label: "restricted data", text: "y" }] },
      defaultPolicy()
    );
    const log = getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].decision).toBe("ask");
    expect(log[1].decision).toBe("deny");
  });

  it("never records the raw content, only its length", () => {
    evaluate(
      { provider: "openai", taskClass: "drafting", segments: [{ label: "Your text", text: "a very secret sentence" }] },
      defaultPolicy()
    );
    const entry = getAuditLog()[0];
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(entry.payloadChars).toBe("a very secret sentence".length);
  });
});
