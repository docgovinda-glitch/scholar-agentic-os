import { describe, it, expect, beforeEach } from "vitest";
import {
  getSavedAccounts,
  saveAccountProfile,
  removeSavedAccount,
  clearAllAccounts,
} from "../multiAccountService";

describe("multiAccountService", () => {
  beforeEach(() => {
    clearAllAccounts();
  });

  it("stores and retrieves saved accounts", () => {
    expect(getSavedAccounts()).toEqual([]);

    saveAccountProfile({
      userId: "user-1",
      email: "doc.govinda@gmail.com",
      name: "Dr. Govinda",
    });

    saveAccountProfile({
      userId: "user-2",
      email: "govinda@stanford.edu",
      name: "Researcher Govinda",
    });

    const accounts = getSavedAccounts();
    expect(accounts.length).toBe(2);
    expect(accounts[0].email).toBe("govinda@stanford.edu"); // Most recent active is first
    expect(accounts[1].email).toBe("doc.govinda@gmail.com");
  });

  it("updates existing account without duplicates", () => {
    saveAccountProfile({
      userId: "user-1",
      email: "doc.govinda@gmail.com",
      name: "Dr. Govinda",
    });

    saveAccountProfile({
      userId: "user-1",
      email: "doc.govinda@gmail.com",
      name: "Dr. Govinda Updated",
    });

    const accounts = getSavedAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].name).toBe("Dr. Govinda Updated");
  });

  it("removes an account from registry", () => {
    saveAccountProfile({
      userId: "user-1",
      email: "doc.govinda@gmail.com",
    });
    saveAccountProfile({
      userId: "user-2",
      email: "govinda@stanford.edu",
    });

    removeSavedAccount("user-1");
    const accounts = getSavedAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].userId).toBe("user-2");
  });
});
