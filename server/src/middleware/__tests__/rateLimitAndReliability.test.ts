import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  __resetRateLimitStore,
  __getRateLimitStoreSize,
  MAX_RATE_LIMIT_ENTRIES,
} from "../rateLimit.ts";
import { memoryDecks, setMemoryDeck, MAX_MEMORY_DECKS } from "../../../routes/presentations.ts";
import { app } from "../../../../server.ts";

describe("Rate limiting & reliability guards (F-09, F-17)", () => {
  beforeEach(() => {
    __resetRateLimitStore();
    memoryDecks.clear();
  });

  it("configures Express with trust proxy = 1", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("does NOT allow rotating User-Agent to bypass IP rate limits", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3, limitBy: "ip" });
    let statusSent = 200;
    let nextCount = 0;

    const makeRes = () => ({
      status(code: number) {
        statusSent = code;
        return this;
      },
      json() {
        return this;
      },
    });

    for (let i = 1; i <= 4; i++) {
      statusSent = 200;
      limiter(
        {
          ip: "203.0.113.42",
          headers: { "user-agent": `BotRotate/${i}.0` },
          get: (h: string) => (h.toLowerCase() === "user-agent" ? `BotRotate/${i}.0` : undefined),
        },
        makeRes(),
        () => {
          nextCount++;
        }
      );
    }

    expect(nextCount).toBe(3);
    expect(statusSent).toBe(429);
  });

  it("extracts the first client IP from X-Forwarded-For when req.ip is absent", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, limitBy: "ip" });
    let statusSent = 200;
    const makeRes = () => ({
      status(code: number) {
        statusSent = code;
        return this;
      },
      json() {
        return this;
      },
    });

    limiter(
      { headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" } },
      makeRes(),
      () => {}
    );
    expect(statusSent).toBe(200);

    // Second request with same first client IP but different proxy hop
    limiter(
      { headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.2" } },
      makeRes(),
      () => {}
    );
    expect(statusSent).toBe(429);
  });

  it("caps in-memory rate-limit store at MAX_RATE_LIMIT_ENTRIES", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 5, limitBy: "ip" });
    const dummyRes = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };

    for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES + 50; i++) {
      limiter({ ip: `192.0.2.${i}` }, dummyRes, () => {});
    }

    expect(__getRateLimitStoreSize()).toBe(MAX_RATE_LIMIT_ENTRIES);
  });

  it("caps memoryDecks at MAX_MEMORY_DECKS with FIFO eviction", () => {
    for (let i = 0; i < MAX_MEMORY_DECKS + 15; i++) {
      setMemoryDeck(`deck-${i}`, {
        id: `deck-${i}`,
        title: `Deck ${i}`,
        slides: [],
      });
    }

    expect(memoryDecks.size).toBe(MAX_MEMORY_DECKS);
    expect(memoryDecks.has("deck-0")).toBe(false);
    expect(memoryDecks.has(`deck-${MAX_MEMORY_DECKS + 14}`)).toBe(true);
  });
});

