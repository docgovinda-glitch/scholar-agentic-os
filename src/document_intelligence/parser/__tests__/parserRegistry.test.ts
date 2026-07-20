import { describe, it, expect, beforeEach, vi } from "vitest";
import { ParserRegistry } from "../parserRegistry";
import type { ParserMetadata, DocumentInput } from "../types";

function createMockParser(id: string, overrides?: any): any {
  const metadata: ParserMetadata = {
    id,
    name: `Test Parser ${id}`,
    description: "A mock parser for testing",
    version: "1.0.0",
    capabilities: {
      mimeTypes: ["application/pdf"],
      extensions: ["pdf"],
      supportsMetadata: true,
      supportsStructure: false,
      maxFileSize: 10485760,
    },
    ...overrides?.metadata,
  };

  return {
    metadata,
    parse: overrides?.parse ?? (async () => ({
      ok: true,
      data: { text: "mock content", warnings: [] },
    })),
  };
}

describe("ParserRegistry", () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = ParserRegistry.getInstance();
    registry.clear();
  });

  describe("Registration", () => {
    it("should register a parser successfully", () => {
      const parser = createMockParser("test.parser");
      const result = registry.register(parser);

      expect(result.success).toBe(true);
      expect(registry.get("test.parser")).toBeDefined();
    });

    it("should reject duplicate registration without force", () => {
      const parser = createMockParser("test.parser");
      registry.register(parser);
      const result = registry.register(parser);

      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.reason).toContain("already registered");
      }
    });

    it("should allow force override of different version", () => {
      registry.register(createMockParser("test.parser", { metadata: { version: "1.0.0" } }));
      const result = registry.register(createMockParser("test.parser", { metadata: { version: "2.0.0" } }), { force: true });

      expect(result.success).toBe(true);
      expect(registry.getMetadata("test.parser")?.version).toBe("2.0.0");
    });
  });

  describe("Unregistration", () => {
    it("should unregister an existing parser", () => {
      registry.register(createMockParser("test.unreg"));

      expect(registry.unregister("test.unreg")).toBe(true);
      expect(registry.get("test.unreg")).toBeUndefined();
    });

    it("should return false when unregistering non-existent parser", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });
  });

  describe("Discovery", () => {
    beforeEach(() => {
      registry.register(createMockParser("pdf.parser", {
        metadata: { id: "pdf.parser", capabilities: { mimeTypes: ["application/pdf"], extensions: ["pdf"] } },
      }));
      registry.register(createMockParser("txt.parser", {
        metadata: { id: "txt.parser", capabilities: { mimeTypes: ["text/plain"], extensions: ["txt"], supportsStructure: true } },
      }));
    });

    it("should get a parser by ID", () => {
      const parser = registry.get("pdf.parser");
      expect(parser).toBeDefined();
    });

    it("should return undefined for non-existent parser", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should query parsers by MIME type", () => {
      const pdfParsers = registry.query({ mimeType: "application/pdf" });
      expect(pdfParsers.length).toBe(1);
    });

    it("should query parsers by capability", () => {
      const structureParsers = registry.query({ capability: "supportsStructure" });
      expect(structureParsers.length).toBe(1);
    });
  });

  describe("Enable/Disable", () => {
    it("should enable a disabled parser", () => {
      registry.register(createMockParser("test.enable"));
      registry.disable("test.enable");
      expect(registry.isEnabled("test.enable")).toBe(false);
      registry.enable("test.enable");
      expect(registry.isEnabled("test.enable")).toBe(true);
    });
  });

  describe("Event Emission", () => {
    it("should emit parser.registered event", () => {
      const handler = vi.fn();
      registry.on("parser.registered", handler);
      registry.register(createMockParser("test.event"));

      expect(handler).toHaveBeenCalledWith({ parserId: "test.event", version: "1.0.0" });
    });

    it("should return unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = registry.on("parser.registered", handler);

      registry.register(createMockParser("test.unsubscribe"));
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      registry.register(createMockParser("test.unsubscribe2"));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Parse Document", () => {
    it("should parse document using specified parser ID", async () => {
      const parser = createMockParser("parse.test", {
        parse: async () => ({ ok: true, data: { text: "parsed content" } }),
      });
      registry.register(parser);

      const input: DocumentInput = { data: Buffer.from("test"), filename: "test.pdf" };
      const result = await registry.parse(input, "parse.test");

      expect(result.ok).toBe(true);
    });

    it("should auto-discover parser by MIME type", async () => {
      const parser = createMockParser("mime.test", {
        metadata: { id: "mime.test", capabilities: { mimeTypes: ["application/test"] } },
        parse: async () => ({ ok: true, data: { text: "mime parsed" } }),
      });
      registry.register(parser);

      const input: DocumentInput = { data: Buffer.from("test"), mimeType: "application/test" };
      const result = await registry.parse(input);

      expect(result.ok).toBe(true);
    });

    it("should return unsupported format error when no parser found", async () => {
      const input: DocumentInput = { data: Buffer.from("test"), filename: "unknown.xyz" };

      const result = await registry.parse(input);

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("UNSUPPORTED_FORMAT");
      }
    });
  });
});