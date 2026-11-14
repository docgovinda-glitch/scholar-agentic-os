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
          assignment_sources: [{ id: "s1", status: "kept" }],
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
      "PATCH project_sources",
    ]);
    const prune = calls.find((c) => c.method === "DELETE" && c.url.includes("assignment_outline_sections"))!;
    expect(decodeURIComponent(prune.url)).toContain('project_id=eq.p1&section_id=not.in.("h1")');
    expect(calls.find((c) => c.url.includes("project_sources"))!.body).toEqual({ origin: "live", is_approved: true });
  });
});
