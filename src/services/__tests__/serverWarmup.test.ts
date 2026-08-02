/**
 * Tests for the free-tier cold-start wake tracker (src/services/serverWarmup.ts).
 *
 * The behaviours worth pinning down here are the ones that only show up on a
 * sleeping instance and are therefore easy to get wrong without noticing: that
 * concurrent callers collapse to a single wake request, and that an error-path
 * check never blocks on a probe that is budgeted to run for a minute and a
 * half.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  warmServer,
  isServerAsleep,
  getServerState,
  subscribeServerState,
  resetServerWarmup,
  HEALTH_PATH,
} from "../serverWarmup";

/** A `fetch` stand-in whose resolution this test controls. */
function deferredFetch() {
  let release!: (value: { ok: boolean }) => void;
  const pending = new Promise<{ ok: boolean }>((resolve) => {
    release = resolve;
  });
  const spy = vi.fn(() => pending as unknown as Promise<Response>);
  return { spy, release };
}

beforeEach(() => {
  resetServerWarmup();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetServerWarmup();
});

describe("serverWarmup — state transitions", () => {
  it("starts in 'unknown' before anything has been probed", () => {
    expect(getServerState()).toBe("unknown");
  });

  it("reports 'awake' when the health endpoint answers OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));

    await expect(warmServer()).resolves.toBe("awake");
    expect(getServerState()).toBe("awake");
  });

  it("reports 'unreachable' when the probe rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      })
    );

    await expect(warmServer()).resolves.toBe("unreachable");
    expect(getServerState()).toBe("unreachable");
  });

  it("treats a non-OK status as unreachable rather than awake", async () => {
    // Render's edge answers 502 while an idled instance boots — a response
    // arrived, but the server behind it is not serving yet.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502 }) as Response));

    await expect(warmServer()).resolves.toBe("unreachable");
  });

  it("probes the health path with caching disabled", async () => {
    // A cached 200 would report a sleeping instance as awake — the one answer
    // this probe must never give.
    const spy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", spy);

    await warmServer();

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(HEALTH_PATH);
    expect(init.cache).toBe("no-store");
  });
});

describe("serverWarmup — concurrent callers", () => {
  it("collapses simultaneous calls into a single wake request", async () => {
    const { spy, release } = deferredFetch();
    vi.stubGlobal("fetch", spy);

    const a = warmServer();
    const b = warmServer();
    const c = warmServer();

    expect(spy).toHaveBeenCalledTimes(1);

    release({ ok: true });
    await Promise.all([a, b, c]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(getServerState()).toBe("awake");
  });

  it("allows a fresh probe once the previous one has settled", async () => {
    const spy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", spy);

    await warmServer();
    await warmServer();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("serverWarmup — subscribers", () => {
  it("notifies subscribers of transitions and stops after unsubscribe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    const seen: string[] = [];
    const unsubscribe = subscribeServerState((s) => seen.push(s));

    await warmServer();
    expect(seen).toEqual(["waking", "awake"]);

    unsubscribe();
    resetServerWarmup();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    await warmServer();

    expect(seen).toEqual(["waking", "awake"]);
  });

  it("does not let one throwing subscriber suppress the others", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    const seen: string[] = [];
    subscribeServerState(() => {
      throw new Error("subscriber blew up");
    });
    subscribeServerState((s) => seen.push(s));

    await expect(warmServer()).resolves.toBe("awake");
    expect(seen).toEqual(["waking", "awake"]);
  });
});

describe("isServerAsleep", () => {
  it("is false once the server has answered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    await warmServer();

    await expect(isServerAsleep()).resolves.toBe(false);
  });

  it("is true when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      })
    );

    await expect(isServerAsleep()).resolves.toBe(true);
  });

  it("answers immediately from a probe already in flight instead of waiting it out", async () => {
    // The boot probe is budgeted at 90s. If an error path awaited it, a failed
    // request would sit on an unexplained error for that whole time — the
    // exact stall this module exists to prevent.
    const { spy, release } = deferredFetch();
    vi.stubGlobal("fetch", spy);

    void warmServer();
    expect(getServerState()).toBe("waking");

    await expect(isServerAsleep()).resolves.toBe(true);
    // Still the one wake request: the error path must not add traffic.
    expect(spy).toHaveBeenCalledTimes(1);

    release({ ok: true });
  });
});

describe("resetServerWarmup", () => {
  it("returns the module to its pre-probe state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true }) as Response));
    await warmServer();
    expect(getServerState()).toBe("awake");

    resetServerWarmup();

    expect(getServerState()).toBe("unknown");
  });
});
