import { describe, it, expect } from "vitest";
import { postgrestInList, writeAssignmentSnapshot } from "../assignmentRelational";

describe("Coursework relational mirror", () => {
  it("quotes ids in PostgREST in-lists", () => {
    expect(postgrestInList(["a", 'b"c', "d,e"])).toBe('("a","b\\"c","d,e")');
  });

  it("upserts every stage table and prunes removed outline rows", async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method || "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response("", { status: 201 });
    };
    await writeAssignmentSnapshot(
      { supabaseUrl: "https://db.example", serviceRoleKey: "k", fetchImpl },
      {
        projectId: "p1",
        answers: {
          assignment_brief_text: "Brief",
          assignment_brief_file: "brief.pdf",
          assignment_structure: { headings: [{ id: "h1", title: "One", subheadings: [] }] },
          assignment_sources: [{ id: "s1", status: "kept", title: "Rates", authors: ["Kuncoro, H."], year: "2020", retrievalSource: "openalex" }],
          approved_source_ids: ["s1"],
          assignment_internal_sections: [{ id: "h1", draftContent: "Some text" }],
          assignment_submission_report: { passed: false },
        } as never,
      }
    );
    const tables = calls.map((c) => `${c.method} ${new URL(c.url).pathname.split("/").pop()}`);
    expect(tables).toEqual([
      "POST assignment_projects",
      "POST assignment_files",
      "DELETE assignment_files",
      "POST assignment_outline_sections",
      "DELETE assignment_outline_sections",
      "POST assignment_draft_revisions",
      "POST assignment_submission_checks",
      "POST project_sources",
    ]);
    const prune = calls.find((c) => c.method === "DELETE" && c.url.includes("assignment_outline_sections"))!;
    expect(decodeURIComponent(prune.url)).toContain('project_id=eq.p1&section_id=not.in.("h1")');
    // Stage 3 sources from every channel become full project_sources rows (not a patch of rows that may not exist).
    const src = calls.find((c) => c.url.includes("project_sources"))!;
    expect(decodeURIComponent(src.url)).toContain("on_conflict=project_id,source_id");
    expect((src.body as Array<Record<string, unknown>>)[0]).toMatchObject({
      project_id: "p1", source_id: "s1", title: "Rates", authors: ["Kuncoro, H."], year: 2020,
      origin: "live", is_approved: true, discovered_via: "openalex",
    });
    // Current text is stamped on every save, so undo back to earlier text makes that row current again.
    const revisions = calls.find((c) => c.url.includes("assignment_draft_revisions"))!.body as Array<Record<string, unknown>>;
    expect(revisions.length).toBeGreaterThan(0);
    for (const r of revisions) expect(Number.isNaN(Date.parse(String(r.last_current_at)))).toBe(false);
  });
});
