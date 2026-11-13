import { useState, useEffect, useCallback, useRef } from "react";
import { getProfile } from "../services/supabaseAuthService";

export type AccountTier = "admin" | "premium" | "pro" | "free";

export interface BriefUploadValidation {
  allowed: boolean;
  reason?: "size_limit_exceeded" | "count_limit_exceeded";
  message?: string;
  requiredTier?: "pro" | "premium";
}

export interface SubscriptionLimits {
  isAdmin: boolean;
  isPremium: boolean;
  tier: AccountTier;
  role: string;
  maxFileSizeMB: number;
  maxFileSizeBytes: number;
  maxBriefsPerAssignment: number;
  isLoading: boolean;
  canUploadBrief: (
    file?: { size: number; name?: string } | null,
    currentBriefCount?: number
  ) => BriefUploadValidation;
  refreshLimits: () => Promise<void>;
}

export interface SubscriptionLimitOptions {
  userTypeOverride?: string;
  roleOverride?: string;
  planIdOverride?: string;
  isEntitlementActiveOverride?: boolean;
}

export function useSubscriptionLimits(options?: SubscriptionLimitOptions): SubscriptionLimits {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (options?.roleOverride === "admin" || options?.userTypeOverride === "administrator") {
      return true;
    }
    return false;
  });

  const [isPremium, setIsPremium] = useState<boolean>(() => {
    if (
      options?.isEntitlementActiveOverride &&
      (options?.planIdOverride === "premium" || options?.planIdOverride === "pro")
    ) {
      return true;
    }
    return false;
  });

  const [role, setRole] = useState<string>(options?.roleOverride || options?.userTypeOverride || "student");
  const [tier, setTier] = useState<AccountTier>(() => {
    if (options?.roleOverride === "admin" || options?.userTypeOverride === "administrator") return "admin";
    if (options?.isEntitlementActiveOverride && (options?.planIdOverride === "premium" || options?.planIdOverride === "pro")) {
      return (options.planIdOverride as AccountTier) || "premium";
    }
    return "free";
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  // The lookups are async; a component that unmounts before they finish must
  // not receive state updates (React warns, and test environments error).
  const mountedRef = useRef(true);

  const fetchEntitlements = useCallback(async () => {
    try {
      // Check profile role first
      let determinedAdmin = false;
      let userRole = "student";

      if (options?.roleOverride === "admin" || options?.userTypeOverride === "administrator") {
        determinedAdmin = true;
        userRole = "admin";
      } else {
        const profileRes = await getProfile().catch(() => null);
        if (profileRes && profileRes.success && profileRes.profile) {
          const uType = (profileRes.profile.userType || "").toLowerCase();
          const r = ((profileRes.profile as any).role || "").toLowerCase();
          if (uType === "administrator" || uType === "admin" || r === "admin") {
            determinedAdmin = true;
            userRole = "admin";
          } else if (uType) {
            userRole = uType;
          }
        }
      }

      // Check subscription tier
      let determinedPremium = false;
      let detectedTier: AccountTier = determinedAdmin ? "admin" : "free";

      if (options?.isEntitlementActiveOverride !== undefined) {
        if (
          options.isEntitlementActiveOverride &&
          (options.planIdOverride === "premium" || options.planIdOverride === "pro")
        ) {
          determinedPremium = true;
          detectedTier = options.planIdOverride as AccountTier;
        }
      } else {
        // Premium is not offered yet: every account is on the free tier.
      }

      if (!mountedRef.current) return;
      setIsAdmin(determinedAdmin);
      setIsPremium(determinedPremium);
      setRole(userRole);
      setTier(determinedAdmin ? "admin" : determinedPremium ? detectedTier : "free");
    } catch {
      // Fail closed gracefully to free tier, or maintain existing state
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [
    options?.roleOverride,
    options?.userTypeOverride,
    options?.planIdOverride,
    options?.isEntitlementActiveOverride,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    fetchEntitlements();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchEntitlements]);

  // Derived limits
  const maxFileSizeMB = isAdmin ? Infinity : isPremium ? 50 : 5;
  const maxFileSizeBytes = isAdmin ? Infinity : maxFileSizeMB * 1024 * 1024;
  const maxBriefsPerAssignment = isAdmin || isPremium ? Infinity : 1;

  const canUploadBrief = useCallback(
    (
      file?: { size: number; name?: string } | null,
      currentBriefCount: number = 0
    ): BriefUploadValidation => {
      // 1. Admin bypass: completely bypass all file size limits and document count caps
      if (isAdmin) {
        return { allowed: true };
      }

      // 2. Check file size limit
      if (file && file.size > maxFileSizeBytes) {
        return {
          allowed: false,
          reason: "size_limit_exceeded",
          message: `Free accounts are limited to files up to ${maxFileSizeMB}MB. Upgrade to Scholar Pro for up to 50MB high-capacity document processing.`,
          requiredTier: "pro",
        };
      }

      // 3. Check document count limit (max 1 brief per assignment for free tier)
      if (currentBriefCount >= maxBriefsPerAssignment) {
        return {
          allowed: false,
          reason: "count_limit_exceeded",
          message: "Free accounts are limited to 1 brief document per assignment. Upgrade to Scholar Pro for unlimited brief document uploads.",
          requiredTier: "pro",
        };
      }

      return { allowed: true };
    },
    [isAdmin, maxFileSizeBytes, maxFileSizeMB, maxBriefsPerAssignment]
  );

  return {
    isAdmin,
    isPremium,
    tier,
    role,
    maxFileSizeMB,
    maxFileSizeBytes,
    maxBriefsPerAssignment,
    isLoading,
    canUploadBrief,
    refreshLimits: fetchEntitlements,
  };
}
