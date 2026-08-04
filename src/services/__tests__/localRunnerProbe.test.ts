// @vitest-environment jsdom
//
// Local runner detection.
//
// The subtle requirement here is what a FAILURE is allowed to mean. A browser
// cannot tell "the runner is not installed" from "the runner is running but
// has not been told to accept requests from this origin" — CORS rejection,
// connection refused, and timeout are the same opaque failure to fetch(). So
// the probe must report "not reachable" and never claim to know which, or the
// UI ends up telling someone to install software they already have running.

import { describe, it, expect, vi } from "vitest";
import { LOCAL_RUNNERS } from "../../config/localRunnerCatalog";
import { detectRunners, probeRunner } from "../localRunnerProbe";

const ollama = LOCAL_RUNNERS.find((r) => r.id === "ollama")!;
const lmstudio = LOCAL_RUNNERS.find((r) => r.id === "lmstudio")!;

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe("probeRunner", () => {
  it("reports reachable and lists models from Ollama's native shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ models: [{ name: "llama3" }, { name: "mistral" }] }));

    const result = await probeRunner(ollama, undefined, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ reachable: true, models: ["llama3", "mistral"] });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  it("lists models from the OpenAI-compatible shape too", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ data: [{ id: "local-model" }] }));

    // Both API styles appear in the catalog; a probe that understood only one
    // would silently report every LM Studio user as having no models.
    const result = await probeRunner(lmstudio, undefined, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ reachable: true, models: ["local-model"] });
  });

  it("is reachable-but-empty when a runner is up with nothing loaded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ models: [] }));
    expect(await probeRunner(ollama, undefined, fetchImpl as unknown as typeof fetch)).toEqual({
      reachable: true,
      models: [],
    });
  });

  it("treats a CORS rejection as unreachable, without claiming it is uninstalled", async () => {
    // This is exactly what a running-but-not-permitted Ollama looks like from
    // a browser: an opaque throw, indistinguishable from nothing listening.
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await probeRunner(ollama, undefined, fetchImpl as unknown as typeof fetch)).toEqual({
      reachable: false,
      reason: "unreachable",
    });
  });

  it("treats a non-2xx answer as unreachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    expect(await probeRunner(ollama, undefined, fetchImpl as unknown as typeof fetch)).toEqual({
      reachable: false,
      reason: "unreachable",
    });
  });

  it("survives a runner that answers 200 with something unparseable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("not JSON");
      },
    } as unknown as Response);

    // Up, but saying something we do not understand. Still reachable.
    expect(await probeRunner(ollama, undefined, fetchImpl as unknown as typeof fetch)).toEqual({
      reachable: true,
      models: [],
    });
  });

  it("honours an endpoint override and strips a trailing slash", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ models: [] }));
    await probeRunner(ollama, "http://127.0.0.1:9999/", fetchImpl as unknown as typeof fetch);

    // Without the strip this requests "...9999//api/tags".
    expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:9999/api/tags");
  });
});

describe("detectRunners", () => {
  it("returns only the runners that answered", async () => {
    const fetchImpl = vi.fn((url: string) =>
      url.startsWith(ollama.defaultEndpoint)
        ? Promise.resolve(ok({ models: [{ name: "llama3" }] }))
        : Promise.reject(new TypeError("Failed to fetch"))
    );

    const found = await detectRunners(fetchImpl as unknown as typeof fetch);

    expect(found.map((f) => f.runner.id)).toEqual(["ollama"]);
    expect(found[0].models).toEqual(["llama3"]);
  });

  it("returns an empty list when nothing is running, rather than throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(detectRunners(fetchImpl as unknown as typeof fetch)).resolves.toEqual([]);
  });

  it("probes every catalog runner, in parallel", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await detectRunners(fetchImpl as unknown as typeof fetch);

    // Serially, each bounded by the timeout, this would take long enough to
    // make the setup screen look broken.
    expect(fetchImpl).toHaveBeenCalledTimes(LOCAL_RUNNERS.length);
  });
});
