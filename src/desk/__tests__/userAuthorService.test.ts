// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getUserAuthorStorageKey,
  getLocalSavedAuthors,
  saveAuthorForUser,
  saveAuthorsListForUser,
  removeSavedAuthorForUser,
} from "../userAuthorService.ts";
import type { Author } from "../types.ts";

describe("User Author Service — Journal Article Author Persistence", () => {
  const user1 = "doc.govinda@gmail.com";
  const user2 = "collaborator@oxford.ac.uk";

  const authorGovinda: Author = {
    id: "auth-1",
    title: "Dr.",
    firstName: "Govinda",
    middleName: "Kumar",
    surname: "Shah",
    email: "doc.govinda@gmail.com",
    orcid: "0000-0002-1825-0097",
    affiliation: "Department of Medicine, Oxford",
    isCorresponding: true,
    creditRoles: ["Conceptualization", "Methodology", "Writing – original draft"],
  };

  const authorJane: Author = {
    id: "auth-2",
    title: "Prof.",
    firstName: "Jane",
    surname: "Doe",
    email: "jane.doe@university.edu",
    affiliation: "Institute of Computational Biology",
    isCorresponding: false,
    creditRoles: ["Formal analysis", "Supervision"],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("generates user-scoped storage keys", () => {
    expect(getUserAuthorStorageKey(user1)).toBe("scholar_user_authors_doc.govinda@gmail.com");
    expect(getUserAuthorStorageKey("  UPPER@domain.COM  ")).toBe("scholar_user_authors_upper@domain.com");
    expect(getUserAuthorStorageKey(null)).toBe("scholar_user_authors_default");
  });

  it("stores and retrieves saved authors for a specific user", () => {
    expect(getLocalSavedAuthors(user1)).toEqual([]);

    const saved = saveAuthorForUser(authorGovinda, user1);
    expect(saved.length).toBe(1);
    expect(saved[0].firstName).toBe("Govinda");
    expect(saved[0].surname).toBe("Shah");
    expect(saved[0].affiliation).toBe("Department of Medicine, Oxford");

    const retrieved = getLocalSavedAuthors(user1);
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].email).toBe("doc.govinda@gmail.com");
  });

  it("ensures authors are stored strictly for that specific user (user isolation)", () => {
    saveAuthorForUser(authorGovinda, user1);

    // User 2 should NOT see user 1's saved authors
    expect(getLocalSavedAuthors(user2)).toEqual([]);

    saveAuthorForUser(authorJane, user2);
    expect(getLocalSavedAuthors(user2).length).toBe(1);
    expect(getLocalSavedAuthors(user2)[0].surname).toBe("Doe");

    // User 1 still has only their author
    expect(getLocalSavedAuthors(user1).length).toBe(1);
    expect(getLocalSavedAuthors(user1)[0].surname).toBe("Shah");
  });

  it("updates existing author fields when saved again without duplicating", () => {
    saveAuthorForUser(authorGovinda, user1);

    const updatedGovinda: Author = {
      ...authorGovinda,
      affiliation: "Harvard Medical School",
      orcid: "0000-0002-1825-9999",
    };

    const result = saveAuthorForUser(updatedGovinda, user1);
    expect(result.length).toBe(1);
    expect(result[0].affiliation).toBe("Harvard Medical School");
    expect(result[0].orcid).toBe("0000-0002-1825-9999");
  });

  it("automatically saves multiple valid manuscript authors at once", () => {
    const list: Author[] = [
      authorGovinda,
      authorJane,
      // Empty dummy author should be skipped
      { id: "empty", firstName: "", surname: "", email: "", isCorresponding: false, creditRoles: [] },
    ];

    const result = saveAuthorsListForUser(list, user1);
    expect(result.length).toBe(2);
    expect(result.some((a) => a.surname === "Shah")).toBe(true);
    expect(result.some((a) => a.surname === "Doe")).toBe(true);
  });

  it("allows removing an author from the user's saved roster", () => {
    saveAuthorForUser(authorGovinda, user1);
    saveAuthorForUser(authorJane, user1);
    expect(getLocalSavedAuthors(user1).length).toBe(2);

    const remaining = removeSavedAuthorForUser(authorGovinda.id, user1);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(authorJane.id);
    expect(getLocalSavedAuthors(user1).length).toBe(1);
  });
});
