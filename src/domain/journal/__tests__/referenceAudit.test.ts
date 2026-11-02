import { describe, it, expect } from "vitest";
import { auditCitations, recordsForSources, type AuditSource } from "../referenceAudit";
import type { ReferenceRecord } from "../references";

const NOW = "2026-11-02T00:00:00.000Z";
const src = (id: string, extra: Partial<AuditSource> = {}): AuditSource => ({ id, title: `Title ${id}`, authors: ["Jane Smith"], year: 2020, isUserData: false, ...extra });
const rec = (id: string, extra: Partial<ReferenceRecord> = {}): ReferenceRecord => ({
  id,
  kind: "article",
  title: `Registered ${id}`,
  authors: [{ family: "Smith", given: "Jane" }],
  year: 2020,
  doi: `10.1000/${id}`,
  registry: "crossref",
  integrity: { status: "clean", checkedAt: NOW },
  ...extra,
});

describe("auditCitations", () => {
  const sources = [
    src("ok", { doi: "10.1000/ok" }),
    src("gone", { doi: "10.1000/gone" }),
    src("worry", { doi: "10.1000/worry" }),
    src("todo", { doi: "10.1000/todo" }),
    src("plain"),
    src("mydata", { isUserData: true }),
    src("unused"),
  ];
  const saved = {
    ok: rec("ok"),
    gone: rec("gone", { integrity: { status: "retracted", notice: "https://doi.org/10.1000/n", checkedAt: NOW } }),
    worry: rec("worry", { integrity: { status: "concern", checkedAt: NOW } }),
  };
  const text = "[CITE:ok] [CITE:gone] [CITE:worry] [CITE:todo] [CITE:plain] [CITE:mydata] [CITE:nowhere]";

  it("gives every citation a state; a missing source and a retraction block export", () => {
    const a = auditCitations(text, sources, saved);
    expect(Object.fromEntries(a.rows.map((r) => [r.id, r.state]))).toEqual({
      ok: "verified",
      gone: "retracted",
      worry: "concern",
      todo: "unchecked",
      plain: "unregistered",
      mydata: "data",
      nowhere: "missing",
    });
    expect(a.rows.filter((r) => r.blocking).map((r) => r.id)).toEqual(["gone", "nowhere"]);
    expect(a.blocking).toBe(2);
    expect(a.warnings).toBe(3);
    expect(a.uncited.map((s) => s.id)).toEqual(["unused"]);
    expect(a.rows.find((r) => r.id === "gone")?.notice).toBe("https://doi.org/10.1000/n");
  });

  it("a retraction the author cites on purpose no longer blocks", () => {
    const a = auditCitations(text, sources, saved, ["gone"]);
    expect(a.rows.find((r) => r.id === "gone")).toMatchObject({ state: "retracted", blocking: false });
    expect(a.blocking).toBe(1);
  });

  it("a source with only typed details is never shown as verified", () => {
    const typed = rec("ok", { registry: "author" });
    expect(auditCitations("[CITE:ok]", sources, { ok: typed }).rows[0].state).toBe("unchecked");
  });
});

describe("recordsForSources", () => {
  it("uses saved records, and builds the rest from what was entered", () => {
    const out = recordsForSources([src("ok"), src("plain", { authors: ["Smith, J.", "Lee, B."] })], { ok: rec("ok") });
    expect(out.ok.registry).toBe("crossref");
    expect(out.plain).toMatchObject({ registry: "author", title: "Title plain", authors: [{ family: "Smith", given: "J." }, { family: "Lee", given: "B." }] });
  });
});
