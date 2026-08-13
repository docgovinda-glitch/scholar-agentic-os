import { describe, it, expect } from "vitest";
import {
  USER_TYPES,
  EDUCATION_LEVELS,
  isValidUserType,
  isValidEducationLevel,
  verificationStatusLabel,
  idDocumentProblem,
  fullNameProblem,
  usernameProblem,
  emailProblem,
  affiliationProblem,
  institutionalIdProblem,
  userTypeProblem,
  educationLevelProblem,
  ID_DOCUMENT_MAX_BYTES,
} from "../accountSchema";

describe("USER_TYPES / EDUCATION_LEVELS", () => {
  it("matches the exact required User Type values", () => {
    expect(USER_TYPES.map((o) => o.value)).toEqual([
      "student",
      "teacher_faculty",
      "administrator",
      "freelance_researcher",
      "independent_researcher",
      "research_professional",
      "other",
    ]);
  });

  it("validates membership via isValidUserType/isValidEducationLevel", () => {
    expect(isValidUserType("student")).toBe(true);
    expect(isValidUserType("wizard")).toBe(false);
    expect(isValidEducationLevel("phd")).toBe(true);
    expect(isValidEducationLevel("wizard")).toBe(false);
  });
});

describe("verificationStatusLabel", () => {
  it("labels every known status", () => {
    expect(verificationStatusLabel("verification_required")).toBe("Verification Required");
    expect(verificationStatusLabel("pending_verification")).toBe("Pending Verification");
    expect(verificationStatusLabel("verified")).toBe("Verified");
    expect(verificationStatusLabel("rejected")).toBe("Rejected");
  });

  it("defaults to Verification Required for null/unknown", () => {
    expect(verificationStatusLabel(null)).toBe("Verification Required");
    expect(verificationStatusLabel(undefined)).toBe("Verification Required");
    expect(verificationStatusLabel("bogus")).toBe("Verification Required");
  });
});

describe("idDocumentProblem", () => {
  it("requires a file", () => {
    expect(idDocumentProblem(null)).toMatch(/required/i);
  });

  it("rejects an unaccepted type", () => {
    const file = new File(["x"], "id.txt", { type: "text/plain" });
    expect(idDocumentProblem(file)).toMatch(/file type/i);
  });

  it("rejects an oversized file", () => {
    const file = new File(["x"], "id.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: ID_DOCUMENT_MAX_BYTES + 1 });
    expect(idDocumentProblem(file)).toMatch(/too large/i);
  });

  it("rejects an empty file", () => {
    const file = new File([], "id.pdf", { type: "application/pdf" });
    expect(idDocumentProblem(file)).toMatch(/empty/i);
  });

  it("accepts a valid file", () => {
    const file = new File(["scan-bytes"], "id.pdf", { type: "application/pdf" });
    expect(idDocumentProblem(file)).toBeNull();
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

  it("emailProblem", () => {
    expect(emailProblem("")).toMatch(/required/i);
    expect(emailProblem("not-an-email")).toMatch(/valid email/i);
    expect(emailProblem("a@b.com")).toBeNull();
  });

  it("affiliationProblem / institutionalIdProblem", () => {
    expect(affiliationProblem("")).toMatch(/required/i);
    expect(affiliationProblem("MIT")).toBeNull();
    expect(institutionalIdProblem("")).toMatch(/required/i);
    expect(institutionalIdProblem("S123")).toBeNull();
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
