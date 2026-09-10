import { describe, it, expect } from "vitest";
import {
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateSafeUrl,
  extractLightweightUrlMetadata,
  createRebindingSafeLookup,
  safeFetchHtml,
} from "../../utils/ssrfGuard";

describe("SSRF Guard — IP Validation", () => {
  it("detects loopback addresses", () => {
    expect(isPrivateOrReservedIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIPv4("127.255.255.254")).toBe(true);
    expect(isPrivateOrReservedIPv4("127.1.2.3")).toBe(true);
  });

  it("detects RFC 1918 private IPv4 subnets", () => {
    // 10.0.0.0/8
    expect(isPrivateOrReservedIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIPv4("10.254.0.1")).toBe(true);

    // 172.16.0.0/12
    expect(isPrivateOrReservedIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIPv4("172.31.255.254")).toBe(true);
    expect(isPrivateOrReservedIPv4("172.32.0.1")).toBe(false); // Public

    // 192.168.0.0/16
    expect(isPrivateOrReservedIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateOrReservedIPv4("192.168.254.254")).toBe(true);
  });

  it("detects link-local and cloud metadata addresses", () => {
    // AWS / GCP / Azure metadata endpoint
    expect(isPrivateOrReservedIPv4("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIPv4("169.254.0.1")).toBe(true);
  });

  it("detects carrier-grade NAT (CGNAT) and reserved ranges", () => {
    expect(isPrivateOrReservedIPv4("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIPv4("100.127.255.254")).toBe(true);
    expect(isPrivateOrReservedIPv4("100.128.0.1")).toBe(false); // Public

    // 0.0.0.0/8 & broadcast
    expect(isPrivateOrReservedIPv4("0.0.0.0")).toBe(true);
    expect(isPrivateOrReservedIPv4("255.255.255.255")).toBe(true);

    // Multicast & reserved
    expect(isPrivateOrReservedIPv4("224.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIPv4("240.0.0.1")).toBe(true);
  });

  it("permits standard public IPv4 addresses", () => {
    expect(isPrivateOrReservedIPv4("8.8.8.8")).toBe(false); // Google DNS
    expect(isPrivateOrReservedIPv4("1.1.1.1")).toBe(false); // Cloudflare
    expect(isPrivateOrReservedIPv4("93.184.216.34")).toBe(false); // example.com
    expect(isPrivateOrReservedIPv4("140.82.121.4")).toBe(false); // GitHub
  });

  it("detects private, loopback, and local IPv6 ranges", () => {
    expect(isPrivateOrReservedIPv6("::1")).toBe(true); // Loopback
    expect(isPrivateOrReservedIPv6("::")).toBe(true); // Unspecified
    expect(isPrivateOrReservedIPv6("fc00::1")).toBe(true); // ULA
    expect(isPrivateOrReservedIPv6("fd12:3456:789a::1")).toBe(true); // ULA
    expect(isPrivateOrReservedIPv6("fe80::1")).toBe(true); // Link-local
    expect(isPrivateOrReservedIPv6("::ffff:127.0.0.1")).toBe(true); // IPv4-mapped loopback
    expect(isPrivateOrReservedIPv6("::ffff:192.168.1.1")).toBe(true); // IPv4-mapped private
  });

  it("permits public IPv6 addresses", () => {
    expect(isPrivateOrReservedIPv6("2606:4700:4700::1111")).toBe(false); // Cloudflare IPv6
    expect(isPrivateOrReservedIPv6("2001:4860:4860::8888")).toBe(false); // Google IPv6
  });
});

describe("SSRF Guard — URL Validation", () => {
  it("blocks non-HTTP/HTTPS schemes", async () => {
    const resFile = await validateSafeUrl("file:///etc/passwd");
    expect(resFile.safe).toBe(false);
    expect(resFile.reason).toMatch(/Forbidden URL scheme/i);

    const resFtp = await validateSafeUrl("ftp://ftp.is.co.za/rfc/rfc1.txt");
    expect(resFtp.safe).toBe(false);

    const resGopher = await validateSafeUrl("gopher://evil.com/1");
    expect(resGopher.safe).toBe(false);

    const resData = await validateSafeUrl("data:text/html,<script>alert(1)</script>");
    expect(resData.safe).toBe(false);
  });

  it("blocks localhost and loopback targets", async () => {
    const res1 = await validateSafeUrl("http://localhost:3000/api");
    expect(res1.safe).toBe(false);

    const res2 = await validateSafeUrl("http://127.0.0.1:8080/admin");
    expect(res2.safe).toBe(false);

    const res3 = await validateSafeUrl("http://[::1]:8080");
    expect(res3.safe).toBe(false);
  });

  it("blocks internal domains and cloud metadata hostnames", async () => {
    const resLocal = await validateSafeUrl("http://service.local/status");
    expect(resLocal.safe).toBe(false);

    const resInternal = await validateSafeUrl("http://db.internal/query");
    expect(resInternal.safe).toBe(false);

    const resGcp = await validateSafeUrl("http://metadata.google.internal/computeMetadata/v1/");
    expect(resGcp.safe).toBe(false);
  });

  it("blocks direct cloud metadata IP (169.254.169.254)", async () => {
    const res = await validateSafeUrl("http://169.254.169.254/latest/meta-data/");
    expect(res.safe).toBe(false);
    expect(res.reason).toMatch(/private\/reserved IP/i);
  });

  it("blocks direct private IPv4 addresses", async () => {
    const res10 = await validateSafeUrl("http://10.0.0.1/admin");
    expect(res10.safe).toBe(false);

    const res192 = await validateSafeUrl("http://192.168.1.1/router");
    expect(res192.safe).toBe(false);

    const res172 = await validateSafeUrl("http://172.16.0.1/");
    expect(res172.safe).toBe(false);
  });

  it("blocks malformed URLs", async () => {
    const res = await validateSafeUrl("not a url at all");
    expect(res.safe).toBe(false);
    expect(res.reason).toMatch(/Malformed/i);
  });
});

describe("SSRF Guard — Lightweight Metadata Extraction", () => {
  it("extracts title, publisher, authors, and year from HTML without persisting", () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Attention Is All You Need — Academic Journal</title>
          <meta property="og:site_name" content="NeurIPS Proceedings">
          <meta name="citation_author" content="Vaswani, Ashish">
          <meta name="citation_author" content="Shazeer, Noam">
          <meta name="citation_publication_date" content="2017/12/06">
          <meta name="description" content="The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.">
        </head>
        <body>
          <h1>Full Paper Body Text</h1>
          <p>Very long document text that must not be permanently persisted...</p>
        </body>
      </html>
    `;

    const meta = extractLightweightUrlMetadata(sampleHtml, "https://arxiv.org/abs/1706.03762");

    expect(meta.title).toBe("Attention Is All You Need — Academic Journal");
    expect(meta.publisher).toBe("NeurIPS Proceedings");
    expect(meta.authors).toEqual(["Vaswani, Ashish", "Shazeer, Noam"]);
    expect(meta.year).toBe("2017");
    expect(meta.description).toContain("The dominant sequence transduction models");
  });

  it("handles fallback to hostname when title tag is missing", () => {
    const html = "<html><head></head><body>Hello world</body></html>";
    const meta = extractLightweightUrlMetadata(html, "https://example.com/article/1");
    expect(meta.title).toBe("example.com");
    expect(meta.publisher).toBe("example.com");
    expect(meta.authors).toEqual([]);
  });

  it("cleans HTML entities from title", () => {
    const html = "<title>Rock &amp; Roll &quot;Science&quot; &lt;Paper&gt;</title>";
    const meta = extractLightweightUrlMetadata(html, "https://nature.com/nature/1");
    expect(meta.title).toBe('Rock & Roll "Science" <Paper>');
  });

  it("handles reversed meta tag attributes (content before property/name)", () => {
    const html = `
      <meta content="Reversed Attribute Article" property="og:title">
      <meta content="Reversed Press" property="og:site_name">
      <meta content="Alice Wonderland" name="author">
      <meta content="2023-08-01" name="article:published_time">
    `;
    const meta = extractLightweightUrlMetadata(html, "https://example.com/reversed");
    expect(meta.title).toBe("Reversed Attribute Article");
    expect(meta.publisher).toBe("Reversed Press");
    expect(meta.authors).toEqual(["Alice Wonderland"]);
    expect(meta.year).toBe("2023");
  });

  it("extracts Highwire Press academic metadata including journal and DOI", () => {
    const html = `
      <meta name="citation_title" content="Quantum Error Correction">
      <meta name="citation_journal_title" content="Physical Review Letters">
      <meta name="citation_doi" content="10.1103/PhysRevLett.77.3260">
      <meta name="citation_author" content="Shor, Peter W.">
      <meta name="citation_publication_date" content="1996/10/14">
    `;
    const meta = extractLightweightUrlMetadata(html, "https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.77.3260");
    expect(meta.title).toBe("Quantum Error Correction");
    expect(meta.journal).toBe("Physical Review Letters");
    expect(meta.doi).toBe("10.1103/PhysRevLett.77.3260");
    expect(meta.authors).toEqual(["Shor, Peter W."]);
    expect(meta.year).toBe("1996");
  });

  it("extracts Substack / E-IR metadata from Schema.org JSON-LD and subtitle byline", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": "Towards a Global International Relations?",
        "datePublished": "2024-05-15T10:00:00Z",
        "publisher": {
          "@type": "Organization",
          "name": "E-International Relations"
        }
      }
      </script>
      <h3 class="subtitle">Amitav Acharya</h3>
    `;
    const meta = extractLightweightUrlMetadata(html, "https://www.e-ir.org/p/towards-a-global-international-relations");
    expect(meta.title).toBe("Towards a Global International Relations?");
    expect(meta.publisher).toBe("E-International Relations");
    expect(meta.authors).toEqual(["Amitav Acharya"]);
    expect(meta.year).toBe("2024");
  });

  it("extracts Dublin Core metadata correctly", () => {
    const html = `
      <meta name="dc.title" content="Computing Machinery and Intelligence">
      <meta name="dc.creator" content="Turing, Alan M.">
      <meta name="dc.date" content="1950">
      <meta name="dc.publisher" content="Oxford University Press">
      <meta name="dc.identifier" content="doi:10.1093/mind/LIX.236.433">
    `;
    const meta = extractLightweightUrlMetadata(html, "https://academic.oup.com/mind/article/LIX/236/433/986238");
    expect(meta.title).toBe("Computing Machinery and Intelligence");
    expect(meta.authors).toEqual(["Turing, Alan M."]);
    expect(meta.year).toBe("1950");
    expect(meta.publisher).toBe("Oxford University Press");
    expect(meta.doi).toBe("10.1093/mind/LIX.236.433");
  });
});

describe("SSRF Guard — Connection-Level DNS Rebinding & Socket Defense", () => {
  it("intercepts socket resolution and throws if DNS resolves to private loopback 127.0.0.1", () => {
    const customLookup = createRebindingSafeLookup(
      new Set(["93.184.216.34"]),
      (_host, _options, cb) => {
        // Simulated malicious DNS rebinding returning loopback at connection time
        cb(null, "127.0.0.1", 4);
      }
    );

    let errorResult: Error | null = null;
    customLookup("attacker-rebinding.com", {}, (err) => {
      errorResult = err;
    });

    expect(errorResult).not.toBeNull();
    expect((errorResult as unknown as Error).message).toMatch(/DNS Rebinding violation: destination resolved to private IP 127.0.0.1/i);
  });

  it("intercepts socket resolution and throws if DNS resolves to cloud metadata 169.254.169.254", () => {
    const customLookup = createRebindingSafeLookup(
      new Set(["93.184.216.34"]),
      (_host, _options, cb) => {
        cb(null, "169.254.169.254", 4);
      }
    );

    let errorResult: Error | null = null;
    customLookup("attacker-metadata.com", {}, (err) => {
      errorResult = err;
    });

    expect(errorResult).not.toBeNull();
    expect((errorResult as unknown as Error).message).toMatch(/DNS Rebinding violation: destination resolved to private IP 169.254.169.254/i);
  });

  it("intercepts socket resolution and blocks when IP rebounds to an unverified address", () => {
    // Initial safe IP was 93.184.216.34, but socket resolution returned another IP 1.2.3.4
    const customLookup = createRebindingSafeLookup(
      new Set(["93.184.216.34"]),
      (_host, _options, cb) => {
        cb(null, "1.2.3.4", 4);
      }
    );

    let errorResult: Error | null = null;
    customLookup("example.com", {}, (err) => {
      errorResult = err;
    });

    expect(errorResult).not.toBeNull();
    expect((errorResult as unknown as Error).message).toMatch(/destination rebounded to unverified IP 1.2.3.4/i);
  });

  it("permits connection when socket resolution matches validated public IP", () => {
    const customLookup = createRebindingSafeLookup(
      new Set(["93.184.216.34"]),
      (_host, _options, cb) => {
        cb(null, "93.184.216.34", 4);
      }
    );

    let errorResult: Error | null = null;
    let resolvedAddress = "";
    customLookup("example.com", {}, (err, addr) => {
      errorResult = err;
      resolvedAddress = addr as string;
    });

    expect(errorResult).toBeNull();
    expect(resolvedAddress).toBe("93.184.216.34");
  });

  it("safeFetchHtml unconditionally rejects local HTTP URLs", async () => {
    await expect(safeFetchHtml("http://127.0.0.1:9999/admin")).rejects.toThrow(/SSRF Blocked/i);
    await expect(safeFetchHtml("http://localhost:9999/status")).rejects.toThrow(/SSRF Blocked/i);
    await expect(safeFetchHtml("http://169.254.169.254/latest")).rejects.toThrow(/SSRF Blocked/i);
  });
});
