import { describe, expect, it, vi } from "vitest";
import { createDedupingFetch } from "../supabaseDedupeFetch";

const ok = () => vi.fn(async () => new Response(JSON.stringify({ id: "u" }), { status: 200 }));
const auth = { headers: { Authorization: "Bearer a" } };

describe("createDedupingFetch", () => {
  it("shares one request between overlapping and repeated identical reads", async () => {
    const base = ok();
    const f = createDedupingFetch(base as unknown as typeof fetch);
    const [a, b] = await Promise.all([f("https://x/auth/v1/user", auth), f("https://x/auth/v1/user", auth)]);
    await (await f("https://x/auth/v1/user", auth)).json();
    await a.json();
    await b.json();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("reads again after a write, for another token, and once the window has passed", async () => {
    const base = ok();
    let time = 0;
    const f = createDedupingFetch(base as unknown as typeof fetch, () => time);
    await f("https://x/rest/v1/profiles?id=eq.1", auth);
    await f("https://x/rest/v1/profiles?id=eq.1", { method: "PATCH" });
    await f("https://x/rest/v1/profiles?id=eq.1", auth);
    await f("https://x/rest/v1/profiles?id=eq.1", { headers: { Authorization: "Bearer b" } });
    time = 6_000;
    await f("https://x/rest/v1/profiles?id=eq.1", auth);
    expect(base).toHaveBeenCalledTimes(5);
  });

  it("does not keep a failed read and never touches other requests", async () => {
    const base = vi.fn(async () => new Response("no", { status: 500 }));
    const f = createDedupingFetch(base as unknown as typeof fetch);
    await f("https://x/auth/v1/user", auth);
    await f("https://x/auth/v1/user", auth);
    await f("https://x/rest/v1/projects", auth);
    await f("https://x/rest/v1/projects", auth);
    expect(base).toHaveBeenCalledTimes(4);
  });
});
