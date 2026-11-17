import { describe, it, expect } from "vitest";
import { citationLockTokens } from "../citationLock";

describe("citationLockTokens", () => {
  it("finds every kind of citation, figure reference, DOI and statistic", () => {
    const text = "Latency fell [CITE:src_1] (Figure [FIG:f1]; [TAB:t2]) as in (Smith & Lee, 2024) and [3], doi 10.1038/s41586-024-0001. p < 0.001";
    const tokens = citationLockTokens(text);
    expect(tokens).toEqual(expect.arrayContaining(["[CITE:src_1]", "[FIG:f1]", "[TAB:t2]", "(Smith & Lee, 2024)", "[3]", "10.1038/s41586-024-0001", "p < 0.001"]));
  });

  it("lists each token once", () => {
    expect(citationLockTokens("[CITE:a] and [CITE:a]")).toEqual(["[CITE:a]"]);
  });
});

describe("withCitationTokensMasked", () => {
  it("lets a rewrite change the prose but never a token", async () => {
    const { withCitationTokensMasked } = await import("../citationLock");
    const out = withCitationTokensMasked("We analyze [CITE:organization_2020] data.", (t) => t.replace(/analyze|organization/g, (w) => w.replace("z", "s")));
    expect(out).toBe("We analyse [CITE:organization_2020] data.");
  });
});
