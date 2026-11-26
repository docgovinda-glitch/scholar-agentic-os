import { describe, expect, it } from "vitest";
import { titleFor } from "../documentTitle";

describe("titleFor", () => {
  it("names each page, and shows a project name only on that project's pages", () => {
    expect(titleFor("/projects/p1/sources", "Communist Movement")).toBe("Communist Movement | Scholar Core");
    expect(titleFor("/projects", "Communist Movement")).toBe("Projects | Scholar Core");
    expect(titleFor("/vault", "Communist Movement")).toBe("Knowledge Vault | Scholar Core");
    expect(titleFor("/ai-access/providers", "x")).toBe("AI Access | Scholar Core");
    expect(titleFor("/nonexistent", "x")).toBe("Page not found | Scholar Core");
  });
});
