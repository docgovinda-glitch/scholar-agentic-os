// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReportingChecklistPanel from "../ReportingChecklistPanel";
import { checklistById, type ChecklistState } from "../../../domain/journal/reportingChecklist";

let confirmAnswer = true;
const confirmSpy = vi.fn(async () => confirmAnswer);
vi.mock("../../../components/ui/FeedbackSystem", async (orig) => ({
  ...(await orig<typeof import("../../../components/ui/FeedbackSystem")>()),
  requestAppConfirm: (...a: unknown[]) => (confirmSpy as unknown as (...x: unknown[]) => Promise<boolean>)(...a),
}));

const prisma = checklistById("prisma")!;
const first = prisma.items[0].id;
const second = prisma.items[1].id;
const state = (entries: ChecklistState["entries"] = {}): ChecklistState => ({ checklistId: "prisma", entries });

function setup(props: Partial<React.ComponentProps<typeof ReportingChecklistPanel>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ReportingChecklistPanel stored={null} suggested={null} sections={["Introduction", "Methods"]} title="Sleep and memory" onSave={onSave} {...props} />);
  return { onSave };
}
const choose = (id: string) => fireEvent.change(screen.getByLabelText("Reporting guideline"), { target: { value: id } });
const readBlob = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });

let downloads: Array<{ blob: Blob; name: string }> = [];
beforeEach(() => {
  confirmAnswer = true;
  confirmSpy.mockClear();
  downloads = [];
  let blob: Blob | null = null;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => ((blob = b), "blob:test");
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ blob: blob!, name: this.download });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("ReportingChecklistPanel", () => {
  it("starts with no guideline chosen, and shows the suggestion without choosing it", () => {
    setup({ suggested: "prisma" });
    expect(screen.getByLabelText("Reporting guideline")).toHaveValue("");
    expect(screen.getByText(/Suggested from your article type and description: PRISMA 2020/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /PRISMA 2020.*\(suggested for this study\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /items/ })).not.toBeInTheDocument();
  });

  it("saves the chosen guideline with no entries made for the author", async () => {
    const { onSave } = setup();
    choose("prisma");
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ checklistId: "prisma", entries: {} }));
    expect(await screen.findByRole("list", { name: "PRISMA 2020 items" })).toBeInTheDocument();
    expect(screen.getByText(`0 of ${prisma.items.length} items done`)).toBeInTheDocument();
  });

  it("shows the published wording of every item with its official source", () => {
    setup({ stored: state() });
    expect(screen.getByText(prisma.items[0].text)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official checklist" })).toHaveAttribute("href", prisma.url);
  });

  it("marks an item reported and counts it, asking where it is reported", async () => {
    const { onSave } = setup({ stored: state() });
    fireEvent.change(screen.getByLabelText(`Item ${first} status`), { target: { value: "reported" } });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls.at(-1)![0].entries[first]).toMatchObject({ status: "reported" });
    expect(screen.getByText(`1 of ${prisma.items.length} items done`)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Checklist items to finish" })).toHaveTextContent(`Item ${first}: marked reported but no location given.`);
  });

  it("disables the location for a not-applicable item and asks for the reason", async () => {
    setup({ stored: state() });
    fireEvent.change(screen.getByLabelText(`Item ${first} status`), { target: { value: "not_applicable" } });
    expect(screen.getByLabelText(`Item ${first} location`)).toBeDisabled();
    expect(screen.getByLabelText(`Item ${first} note`)).toHaveAttribute("placeholder", "Why it doesn't apply");
    expect(await screen.findByRole("list", { name: "Checklist items to finish" })).toHaveTextContent("marked not applicable without a reason");
  });

  it("saves a typed location when the field is left, not on each keystroke", async () => {
    const { onSave } = setup({ stored: state({ [first]: { status: "reported", location: "", note: "" } }) });
    const loc = screen.getByLabelText(`Item ${first} location`);
    fireEvent.change(loc, { target: { value: "Methods, para 2" } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.blur(loc);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls.at(-1)![0].entries[first].location).toBe("Methods, para 2");
  });

  it("offers the manuscript's sections as locations", () => {
    setup({ stored: state() });
    const list = document.getElementById("checklist-sections")!;
    expect(Array.from(list.querySelectorAll("option")).map((o) => o.getAttribute("value"))).toEqual(["Introduction", "Methods"]);
  });

  it("saves one at a time, always the latest entries", async () => {
    let release!: () => void;
    const onSave = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (release = r))).mockResolvedValue(undefined);
    setup({ stored: state(), onSave });
    fireEvent.change(screen.getByLabelText(`Item ${first} status`), { target: { value: "reported" } });
    fireEvent.change(screen.getByLabelText(`Item ${second} status`), { target: { value: "reported" } });
    expect(onSave).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const last = onSave.mock.calls[1][0] as ChecklistState;
    expect(last.entries[first].status).toBe("reported");
    expect(last.entries[second].status).toBe("reported");
  });

  it("says when a save failed, keeping the entries on screen", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("down"));
    setup({ stored: state(), onSave });
    fireEvent.change(screen.getByLabelText(`Item ${first} status`), { target: { value: "reported" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved");
    expect(screen.getByLabelText(`Item ${first} status`)).toHaveValue("reported");
  });

  it("asks before a guideline switch throws away entries, and keeps them when declined", async () => {
    confirmAnswer = false;
    const { onSave } = setup({ stored: state({ [first]: { status: "reported", location: "Intro", note: "" } }) });
    choose("consort");
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reporting guideline")).toHaveValue("prisma");
    expect(screen.getByLabelText(`Item ${first} status`)).toHaveValue("reported");
  });

  it("clears the entries and switches when confirmed", async () => {
    const { onSave } = setup({ stored: state({ [first]: { status: "reported", location: "Intro", note: "" } }) });
    choose("consort");
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ checklistId: "consort", entries: {} }));
  });

  it("switches without asking when nothing has been entered, and can clear the choice", async () => {
    const { onSave } = setup({ stored: state() });
    choose("strobe");
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ checklistId: "strobe", entries: {} }));
    expect(confirmSpy).not.toHaveBeenCalled();
    choose("");
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(null));
  });

  it("summarises only the first six problems", () => {
    const entries = Object.fromEntries(prisma.items.slice(0, 8).map((i) => [i.id, { status: "reported" as const, location: "", note: "" }]));
    setup({ stored: state(entries) });
    const list = screen.getByRole("list", { name: "Checklist items to finish" });
    expect(list.querySelectorAll("li")).toHaveLength(7);
    expect(list).toHaveTextContent("and 2 more.");
  });

  it("downloads the completed checklist as CSV, safe to open in a spreadsheet", async () => {
    setup({ stored: state({ [first]: { status: "reported", location: "=HYPERLINK(\"http://evil\",\"x\")", note: "@SUM(A1)" } }), title: "Sleep & memory: 50%" });
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe("Sleep_memory_50_prisma_checklist.csv");
    const csv = await readBlob(downloads[0].blob);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    expect(csv).not.toMatch(/(^|,)"[=+@]/m);
  });
});
