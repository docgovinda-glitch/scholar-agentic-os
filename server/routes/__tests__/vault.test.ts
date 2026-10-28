import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import express from "express";
import { registerVaultRoutes } from "../vault";
import { __clearTokenCacheForTests } from "../../src/middleware/auth.ts";
import { __resetHeavyParseGuardForTests } from "../../src/middleware/uploadGuard.ts";

const TEST_JWT_SECRET = "test-vault-jwt-secret-key-for-unit-tests";

function createTestJwt(userId = "11111111-1111-4111-8111-111111111111"): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: "scholar@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const AUTH_HEADER = { Authorization: `Bearer ${createTestJwt()}` };

describe("Vault Server API Routes (/api/vault)", () => {
  let app: express.Express;

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    __clearTokenCacheForTests();
    __resetHeavyParseGuardForTests();
    app = express();
    app.use(express.json());
    registerVaultRoutes(app);
  });

  describe("Authentication enforcement across all /api/vault/* utility routes", () => {
    it.each([
      ["post", "/api/vault/parse-file"],
      ["post", "/api/vault/parse-url"],
      ["post", "/api/vault/lookup-doi"],
      ["post", "/api/lookup-doi"],
      ["post", "/api/vault/search-semantic"],
      ["post", "/api/vault/zotero/sync"],
      ["post", "/api/vault/mendeley/sync"],
      ["get", "/api/vault/drive/files"],
      ["get", "/api/vault/onedrive/files"],
      ["post", "/api/vault/reset"],
    ])("returns 401 on %s %s when unauthenticated", async (method, path) => {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/vault/lookup-doi", () => {
    it("returns 400 when doi is missing", async () => {
      const res = await request(app).post("/api/vault/lookup-doi").set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid DOI");
    });

    it("returns 400 when doi is not a string", async () => {
      const res = await request(app).post("/api/vault/lookup-doi").set(AUTH_HEADER).send({ doi: 12345 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid DOI");
    });
  });

  describe("POST /api/vault/parse-url", () => {
    it("returns 400 when url is missing", async () => {
      const res = await request(app).post("/api/vault/parse-url").set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid URL");
    });

    it("returns 400 when url protocol is invalid", async () => {
      const res = await request(app).post("/api/vault/parse-url").set(AUTH_HEADER).send({ url: "ftp://invalid-domain.com" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid protocol");
    });
  });

  describe("POST /api/vault/search-semantic", () => {
    it("returns 400 when query is missing", async () => {
      const res = await request(app).post("/api/vault/search-semantic").set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid search query");
    });

    it("ranks items semantically using hybrid BM25 and keyword frequency", async () => {
      const items = [
        {
          id: "item-1",
          title: "Quantum Physics",
          content: "Quantum entanglement and qubits are key to quantum computing.",
        },
        {
          id: "item-2",
          title: "Machine Learning",
          content: "Deep neural networks and transformers model complex patterns in big datasets.",
        },
      ];

      const res = await request(app)
        .post("/api/vault/search-semantic")
        .set(AUTH_HEADER)
        .send({ query: "deep neural network transformers", items, topK: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].itemId).toBe("item-2");
    });

    it("returns empty results when items are empty", async () => {
      const res = await request(app)
        .post("/api/vault/search-semantic")
        .set(AUTH_HEADER)
        .send({ query: "anything", items: [] });

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });
  });

  describe("POST /api/vault/mendeley/sync", () => {
    it("returns 400 if neither bibtex nor accessToken is provided", async () => {
      const res = await request(app).post("/api/vault/mendeley/sync").set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Provide bibtex string or Mendeley accessToken");
    });

    it("parses valid BibTeX entries into Vault items", async () => {
      const bibtex = `
@article{test2024,
  title={Advanced Agentic Workflows},
  author={Smith, John and Doe, Jane},
  journal={Journal of AI Research},
  year={2024},
  doi={10.1234/test.5678}
}
      `;
      const res = await request(app).post("/api/vault/mendeley/sync").set(AUTH_HEADER).send({ bibtex });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].title).toBe("Advanced Agentic Workflows");
      expect(res.body.items[0].authors).toEqual(["Smith, John", "Doe, Jane"]);
      expect(res.body.items[0].year).toBe("2024");
      expect(res.body.items[0].doi).toBe("10.1234/test.5678");
    });
  });

  describe("POST /api/vault/zotero/sync", () => {
    it("returns 400 when apiKey or userId is missing", async () => {
      const res = await request(app).post("/api/vault/zotero/sync").set(AUTH_HEADER).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing required Zotero apiKey or userId");
    });
  });

  describe("POST /api/vault/parse-file", () => {
    it("returns 400 when no file is uploaded", async () => {
      const res = await request(app).post("/api/vault/parse-file").set(AUTH_HEADER);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No file uploaded");
    });

    it("parses an uploaded text file", async () => {
      const res = await request(app)
        .post("/api/vault/parse-file")
        .set(AUTH_HEADER)
        .attach("file", Buffer.from("Title: My Research\nAbstract: Testing document parser."), "research.txt");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filename).toBe("research.txt");
      expect(res.body.text).toContain("Testing document parser.");
    });

    it("parses an uploaded PDF file gracefully", async () => {
      // Minimal valid PDF structure
      const minimalPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (Academic Findings) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n310\n%%EOF"
      );

      const res = await request(app)
        .post("/api/vault/parse-file")
        .set(AUTH_HEADER)
        .attach("file", minimalPdf, { filename: "findings.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filename).toBe("findings.pdf");
      expect(typeof res.body.text).toBe("string");
      expect(res.body.text.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/vault/reset", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/vault/reset").send({});
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/vault/drive/files & /api/vault/onedrive/files", () => {
    it("returns 401 for drive files when unauthenticated", async () => {
      const res = await request(app).get("/api/vault/drive/files");
      expect(res.status).toBe(401);
    });

    it("returns 401 for onedrive files when unauthenticated", async () => {
      const res = await request(app).get("/api/vault/onedrive/files");
      expect(res.status).toBe(401);
    });
  });
});
