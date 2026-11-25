import { describe, it, expect } from "vitest";
import { vaultImportOutcome } from "../importOutcome";

describe("vaultImportOutcome", () => {
  it("reports success only when every item saved", () => {
    expect(vaultImportOutcome(3, 3)).toEqual({ message: "Imported 3 verified references into Knowledge Vault.", variant: "success" });
    expect(vaultImportOutcome(1, 1).message).toContain("1 verified reference into");
  });
  it("reports a partial import as a warning with the real count", () => {
    expect(vaultImportOutcome(2, 5)).toMatchObject({ variant: "warning", message: expect.stringContaining("2 of 5") });
  });
  it("reports total failure as an error, never as imported", () => {
    const r = vaultImportOutcome(0, 4);
    expect(r.variant).toBe("error");
    expect(r.message).not.toMatch(/^Imported/);
  });
});
