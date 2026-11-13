// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSubscriptionLimits } from "../useSubscriptionLimits";
import * as supabaseAuthService from "../../services/supabaseAuthService";
import * as aiAccessApi from "../../desk/aiAccess/aiAccessApi";

vi.mock("../../services/supabaseAuthService", () => ({
  getProfile: vi.fn(),
}));

vi.mock("../../desk/aiAccess/aiAccessApi", () => ({
  getAiAccessStatus: vi.fn(),
}));

describe("useSubscriptionLimits Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifies Admin accounts and grants unlimited uploads", async () => {
    vi.mocked(supabaseAuthService.getProfile).mockResolvedValue({
      success: true,
      profile: {
        username: "admin_user",
        fullName: "Admin",
        email: "admin@scholar.edu",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "Scholar Admin",
        userType: "administrator",
        educationLevel: "faculty_academic",
      },
    });
    vi.mocked(aiAccessApi.getAiAccessStatus).mockResolvedValue({
      connections: [],
      entitlement: { status: "none", active: false },
      quota: null,
      creditBalance: null,
    });

    const { result } = renderHook(() => useSubscriptionLimits());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.maxFileSizeMB).toBe(Infinity);
    expect(result.current.maxBriefsPerAssignment).toBe(Infinity);

    // Admin should bypass even 100MB file and multiple uploads
    const check1 = result.current.canUploadBrief({ size: 100 * 1024 * 1024 }, 5);
    expect(check1.allowed).toBe(true);
  });


  it("enforces Free tier limits: max 5MB and max 1 brief per assignment", async () => {
    vi.mocked(supabaseAuthService.getProfile).mockResolvedValue({
      success: true,
      profile: {
        username: "free_student",
        fullName: "Free Student",
        email: "free@scholar.edu",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "College",
        userType: "student",
        educationLevel: "undergraduate",
      },
    });
    vi.mocked(aiAccessApi.getAiAccessStatus).mockResolvedValue({
      connections: [],
      entitlement: { status: "none", active: false },
      quota: null,
      creditBalance: null,
    });

    const { result } = renderHook(() => useSubscriptionLimits());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isPremium).toBe(false);
    expect(result.current.maxFileSizeMB).toBe(5);
    expect(result.current.maxBriefsPerAssignment).toBe(1);

    // Allows standard 2MB file on first upload
    const checkFirst = result.current.canUploadBrief({ size: 2 * 1024 * 1024 }, 0);
    expect(checkFirst.allowed).toBe(true);

    // Blocks file exceeding 5MB
    const checkOversize = result.current.canUploadBrief({ size: 6 * 1024 * 1024 }, 0);
    expect(checkOversize.allowed).toBe(false);
    expect(checkOversize.reason).toBe("size_limit_exceeded");

    // Blocks second upload
    const checkSecond = result.current.canUploadBrief({ size: 1 * 1024 * 1024 }, 1);
    expect(checkSecond.allowed).toBe(false);
    expect(checkSecond.reason).toBe("count_limit_exceeded");
  });
});
