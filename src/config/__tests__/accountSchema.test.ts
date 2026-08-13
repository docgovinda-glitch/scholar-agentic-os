import { describe, it, expect } from "vitest";
import {
  USER_TYPES,
  EDUCATION_LEVELS,
  isValidUserType,
  isValidEducationLevel,
  fullNameProblem,
  usernameProblem,
  emailProblem,
  userTypeProblem,
  educationLevelProblem,
} from "../accountSchema";

describe("USER_TYPES / EDUCATION_LEVELS", () => {
  it("matches the exact required User Type values — no institutional/other roles", () => {
    expect(USER_TYPES.map((o) => o.value)).toEqual([
      "student",
      "teacher_faculty",
      "administrator",
      "freelance_researcher",
    ]);
  });

  it("validates membership via isValidUserType/isValidEducationLevel", () => {
    expect(isValidUserType("student")).toBe(true);
    expect(isValidUserType("wizard")).toBe(false);
    expect(isValidEducationLevel("phd")).toBe(true);
    expect(isValidEducationLevel("wizard")).toBe(false);
  });
});

describe("field validators", () => {
  it("fullNameProblem", () => {
    expect(fullNameProblem("")).toMatch(/required/i);
    expect(fullNameProblem("  ")).toMatch(/required/i);
    expect(fullNameProblem("Ada Lovelace")).toBeNull();
  });

  it("usernameProblem", () => {
    expect(usernameProblem("")).toMatch(/required/i);
    expect(usernameProblem("ab")).toMatch(/at least 3/i);
    expect(usernameProblem("bad name")).toMatch(/letters, numbers/i);
    expect(usernameProblem("valid_user.1")).toBeNull();
  });

  it("emailProblem accepts any valid address — no provider restriction", () => {
    expect(emailProblem("")).toMatch(/required/i);
    expect(emailProblem("not-an-email")).toMatch(/valid email/i);
    expect(emailProblem("a@b.com")).toBeNull();
    expect(emailProblem("scholar@gmail.com")).toBeNull();
    expect(emailProblem("scholar@university.ac.np")).toBeNull();
    expect(emailProblem("scholar@yahoo.com")).toBeNull();
    expect(emailProblem("scholar@outlook.com")).toBeNull();
    expect(emailProblem("scholar@protonmail.com")).toBeNull();
    expect(emailProblem("scholar@some-custom-domain.org")).toBeNull();
  });

  it("userTypeProblem / educationLevelProblem", () => {
    expect(userTypeProblem("")).toMatch(/required/i);
    expect(userTypeProblem("bogus")).toMatch(/valid user type/i);
    expect(userTypeProblem("student")).toBeNull();
    expect(educationLevelProblem("")).toMatch(/required/i);
    expect(educationLevelProblem("bogus")).toMatch(/valid education level/i);
    expect(educationLevelProblem("phd")).toBeNull();
  });
});

describe("EDUCATION_LEVELS", () => {
  it("has 8 options as specified", () => {
    expect(EDUCATION_LEVELS).toHaveLength(8);
  });
});

describe("institutional ID removal", () => {
  it("no longer exports institutional-ID or document-verification helpers", async () => {
    const mod = await import("../accountSchema");
    expect((mod as Record<string, unknown>).institutionalIdProblem).toBeUndefined();
    expect((mod as Record<string, unknown>).idDocumentProblem).toBeUndefined();
    expect((mod as Record<string, unknown>).verificationStatusLabel).toBeUndefined();
    expect((mod as Record<string, unknown>).VERIFICATION_STATUSES).toBeUndefined();
  });
});
