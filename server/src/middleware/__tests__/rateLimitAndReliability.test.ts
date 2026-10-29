import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  getBaseIp,
  isCloudflareIp,
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

  it("does NOT allow a spoofed X-Forwarded-For or spoofed CF-Connecting-IP to create a new bucket", () => {
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

    // Request 1: Attacker at 198.51.100.7 sends spoofed prefix 203.0.113.1
    // Render appends 198.51.100.7 as the right-most hop.
    limiter(
      {
        headers: {
          "x-forwarded-for": "203.0.113.1, 198.51.100.7",
          "cf-connecting-ip": "192.0.2.99",
        },
      },
      makeRes(),
      () => {}
    );
    expect(statusSent).toBe(200);

    // Request 2: Same attacker rotates spoofed X-Forwarded-For prefix AND CF-Connecting-IP.
    // Because 198.51.100.7 is not a Cloudflare edge IP, both spoofed values are ignored.
    limiter(
      {
        headers: {
          "x-forwarded-for": "203.0.113.2, 203.0.113.3, 198.51.100.7",
          "cf-connecting-ip": "192.0.2.100",
        },
      },
      makeRes(),
      () => {}
    );
    expect(statusSent).toBe(429);
  });

  it("extracts real client IP when the connecting hop to Render is a verified Cloudflare edge IP", () => {
    expect(isCloudflareIp("172.64.0.15")).toBe(true);
    expect(isCloudflareIp("198.51.100.7")).toBe(false);

    // Hop chain: [spoofed client header, real client IP added by Cloudflare, Cloudflare edge IP added by Render]
    const reqWithCf = {
      headers: {
        "x-forwarded-for": "1.2.3.4, 198.51.100.7, 172.64.0.15",
        "cf-connecting-ip": "198.51.100.7",
      },
    };
    expect(getBaseIp(reqWithCf)).toBe("198.51.100.7");

    // Even without cf-connecting-ip, when right-most hop is Cloudflare, it takes hops[length - 2] (not spoofed hops[0])
    const reqWithCfNoHeader = {
      headers: {
        "x-forwarded-for": "1.2.3.4, 198.51.100.7, 172.64.0.15",
      },
    };
    expect(getBaseIp(reqWithCfNoHeader)).toBe("198.51.100.7");
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

