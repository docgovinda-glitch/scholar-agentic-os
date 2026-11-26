// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AuthorsEditor from "../AuthorsEditor";
import { newAuthor, type ManuscriptAuthor } from "../../../domain/journal/authorship";

const ada: ManuscriptAuthor = { id: "a1", firstName: "Ada", surname: "Lovelace", affiliation: "UCL", email: "ada@ucl.ac.uk", orcid: "0000-0002-1825-0097", isCorresponding: true, creditRoles: ["Conceptualization"] };
const charles: ManuscriptAuthor = { id: "a2", firstName: "Charles", surname: "Babbage", affiliation: "Cambridge", email: "", orcid: "", isCorresponding: false, creditRoles: ["Software"] };

function setup(authors: ManuscriptAuthor[], saveState: "idle" | "saving" | "saved" | "error" = "idle") {
  const onChange = vi.fn();
  const onSave = vi.fn();
  const view = render(<AuthorsEditor authors={authors} onChange={onChange} onSave={onSave} saveState={saveState} />);
  return { onChange, onSave, ...view };
}

describe("AuthorsEditor", () => {
  it("shows every author in byline order with labelled fields", () => {
    setup([ada, charles]);
    expect(screen.getByLabelText("Author 1 first name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Author 2 surname")).toHaveValue("Babbage");
    expect(screen.getByLabelText("Author 1 ORCID iD")).toHaveValue("0000-0002-1825-0097");
    expect(screen.getAllByRole("radio")[0]).toBeChecked();
  });

  it("changes a typed field in place and saves it only when the author leaves it", () => {
    const { onChange, onSave } = setup([ada, charles]);
    const surname = screen.getByLabelText("Author 1 surname");
    fireEvent.change(surname, { target: { value: "King" } });
    expect(onChange).toHaveBeenCalledWith([{ ...ada, surname: "King" }, charles]);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.blur(surname);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("saves on Enter by leaving the field", () => {
    const { onSave } = setup([ada]);
    const input = screen.getByLabelText("Author 1 affiliation");
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalled();
  });

  it("normalises an ORCID iD typed as a URL when the field is left, and saves it", () => {
    const { onChange, onSave } = setup([ada]);
    const orcid = screen.getByLabelText("Author 1 ORCID iD");
    fireEvent.blur(orcid, { target: { value: "https://orcid.org/0000000218250097" } });
    const expected = [{ ...ada, orcid: "0000-0002-1825-0097" }];
    expect(onChange).toHaveBeenCalledWith(expected);
    expect(onSave).toHaveBeenCalledWith(expected);
  });

  it("flags an ORCID iD whose check digit is wrong", () => {
    setup([{ ...ada, orcid: "0000-0002-1825-0098" }]);
    expect(screen.getByLabelText("Author 1 ORCID iD")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("list", { name: "Author details still needed" })).toHaveTextContent("check digit");
  });

  it("reorders authors and saves at once; the first can't move up and the last can't move down", () => {
    const { onChange, onSave } = setup([ada, charles]);
    expect(screen.getByRole("button", { name: "Move author 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move author 2 down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move author 2 up" }));
    expect(onChange).toHaveBeenCalledWith([charles, ada]);
    expect(onSave).toHaveBeenCalledWith([charles, ada]);
  });

  it("makes the next author corresponding when the corresponding author is removed", () => {
    const { onSave } = setup([ada, charles]);
    fireEvent.click(screen.getByRole("button", { name: "Remove author 1" }));
    expect(onSave).toHaveBeenCalledWith([{ ...charles, isCorresponding: true }]);
  });

  it("keeps the corresponding author when someone else is removed", () => {
    const { onSave } = setup([ada, charles]);
    fireEvent.click(screen.getByRole("button", { name: "Remove author 2" }));
    expect(onSave).toHaveBeenCalledWith([ada]);
  });

  it("allows only one corresponding author", () => {
    const { onSave } = setup([ada, charles]);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(onSave).toHaveBeenCalledWith([{ ...ada, isCorresponding: false }, { ...charles, isCorresponding: true }]);
  });

  it("toggles a CRediT role on and off and saves each change", () => {
    const { onSave } = setup([ada]);
    const group = screen.getByRole("group", { name: "Author 1 CRediT roles" });
    expect(within(group).getByRole("button", { name: "Conceptualization" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: "Methodology" }));
    expect(onSave).toHaveBeenLastCalledWith([{ ...ada, creditRoles: ["Conceptualization", "Methodology"] }]);
    fireEvent.click(within(group).getByRole("button", { name: "Conceptualization" }));
    expect(onSave).toHaveBeenLastCalledWith([{ ...ada, creditRoles: [] }]);
  });

  it("adds a blank author, corresponding only when it is the first, and fills in nothing", () => {
    const first = setup([]);
    fireEvent.click(screen.getByRole("button", { name: "Add author" }));
    const added = first.onChange.mock.calls[0][0] as ManuscriptAuthor[];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ firstName: "", surname: "", email: "", isCorresponding: true, creditRoles: [] });
    first.unmount();

    const second = setup([ada]);
    fireEvent.click(screen.getByRole("button", { name: "Add author" }));
    const next = second.onChange.mock.calls[0][0] as ManuscriptAuthor[];
    expect(next).toHaveLength(2);
    expect(next[1].isCorresponding).toBe(false);
    expect(second.onSave).not.toHaveBeenCalled();
  });

  it("lists what the title page still needs, and nothing when it's complete", () => {
    const { rerender } = setup([newAuthor("n1", true)]);
    const list = screen.getByRole("list", { name: "Author details still needed" });
    expect(list).toHaveTextContent("first name and surname are both needed");
    expect(list).toHaveTextContent("add an affiliation");
    expect(list).toHaveTextContent("needs an email address");
    expect(list).toHaveTextContent("choose at least one CRediT role");
    rerender(<AuthorsEditor authors={[ada]} onChange={vi.fn()} onSave={vi.fn()} saveState="idle" />);
    expect(screen.queryByRole("list", { name: "Author details still needed" })).not.toBeInTheDocument();
  });

  it("reports the save state, and lets the author try again after an error", () => {
    const saving = setup([ada], "saving");
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    saving.unmount();
    const saved = setup([ada], "saved");
    expect(screen.getByRole("status")).toHaveTextContent("Authors saved");
    saved.unmount();
    const failed = setup([ada], "error");
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.onSave).toHaveBeenCalledWith([ada]);
  });
});
