import { describe, it, expect, vi } from "vitest";
import { fetchLocalRunner, getTargetAddressSpace, isLoopbackEndpoint } from "../localNetworkFetch";

describe("localNetworkFetch", () => {
  it("classifies loopback and LAN targets", () => {
    expect(isLoopbackEndpoint("http://localhost:11434")).toBe(true);
    expect(isLoopbackEndpoint("http://127.0.0.1:11434")).toBe(true);
    expect(isLoopbackEndpoint("http://[::1]:11434")).toBe(true);
    expect(isLoopbackEndpoint("http://192.168.1.5:11434")).toBe(false);
    expect(getTargetAddressSpace("http://192.168.1.5:11434")).toBe("private");
    expect(getTargetAddressSpace("http://localhost:1234")).toBe("local");
  });

  it("sends the hint first and does not retry when it works", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await fetchLocalRunner("http://localhost:11434/api/tags", { method: "GET" }, 1000, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].targetAddressSpace).toBe("local");
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("does not retry on an HTTP error response (only on a rejected fetch)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const res = await fetchLocalRunner("http://localhost:11434/api/tags", {}, 1000, fetchImpl);
    expect(res.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries once without the hint when the hinted fetch rejects, and rethrows the second error", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("LNA")).mockRejectedValueOnce(new TypeError("second"));
    await expect(fetchLocalRunner("http://127.0.0.1:11434/api/tags", {}, 1000, fetchImpl)).rejects.toThrow("second");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].targetAddressSpace).toBeUndefined();
  });

  it("aborts after the timeout", async () => {
    const fetchImpl = vi.fn((_u: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
    ) as unknown as typeof fetch;
    await expect(fetchLocalRunner("http://localhost:1/x", {}, 10, fetchImpl)).rejects.toThrow("aborted");
  });
});
