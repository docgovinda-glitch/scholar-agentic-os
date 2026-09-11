import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { registerVaultRoutes } from "../vault";

describe("Vault Server API Routes (/api/vault)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerVaultRoutes(app);
  });

  describe("POST /api/vault/lookup-doi", () => {
    it("returns 400 when doi is missing", async () => {
      const res = await request(app).post("/api/vault/lookup-doi").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid DOI");
    });

    it("returns 400 when doi is not a string", async () => {
      const res = await request(app).post("/api/vault/lookup-doi").send({ doi: 12345 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid DOI");
    });
  });

  describe("POST /api/vault/parse-url", () => {
    it("returns 400 when url is missing", async () => {
      const res = await request(app).post("/api/vault/parse-url").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing or invalid URL");
    });

    it("returns 400 when url protocol is invalid", async () => {
      const res = await request(app).post("/api/vault/parse-url").send({ url: "ftp://invalid-domain.com" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid protocol");
    });
  });

  describe("POST /api/vault/search-semantic", () => {
    it("returns 400 when query is missing", async () => {
      const res = await request(app).post("/api/vault/search-semantic").send({});
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
        .send({ query: "deep neural network transformers", items, topK: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].itemId).toBe("item-2");
    });

    it("returns empty results when items are empty", async () => {
      const res = await request(app)
        .post("/api/vault/search-semantic")
        .send({ query: "anything", items: [] });

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });
  });

  describe("POST /api/vault/mendeley/sync", () => {
    it("returns 400 if neither bibtex nor accessToken is provided", async () => {
      const res = await request(app).post("/api/vault/mendeley/sync").send({});
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
      const res = await request(app).post("/api/vault/mendeley/sync").send({ bibtex });
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
      const res = await request(app).post("/api/vault/zotero/sync").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing required Zotero apiKey or userId");
    });
  });

  describe("POST /api/vault/parse-file", () => {
    it("returns 400 when no file is uploaded", async () => {
      const res = await request(app).post("/api/vault/parse-file");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No file uploaded");
    });

    it("parses an uploaded text file", async () => {
      const res = await request(app)
        .post("/api/vault/parse-file")
        .attach("file", Buffer.from("Title: My Research\nAbstract: Testing document parser."), "research.txt");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.filename).toBe("research.txt");
      expect(res.body.text).toContain("Testing document parser.");
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
