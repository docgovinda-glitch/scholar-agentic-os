import { useEffect, useState } from "react";
import { getProfile } from "../services/supabaseAuthService";
import { resolveDisplayName } from "../shared/userIdentity";

/** Profile full names already fetched this page load, by email. */
const profileNameCache = new Map<string, string>();

/** Display name for sidebars: profile full name once known, else the session's. */
export function useDisplayName(sessionName: string | null | undefined, email: string | null | undefined): string | undefined {
  const [profileName, setProfileName] = useState<string | null>(email ? profileNameCache.get(email) ?? null : null);

  useEffect(() => {
    if (!email || profileNameCache.has(email)) return;
    let active = true;
    getProfile()
      .then((res) => {
        if (!active || !res.success || !res.profile.fullName) return;
        profileNameCache.set(email, res.profile.fullName);
        setProfileName(res.profile.fullName);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [email]);

  return resolveDisplayName({ fullName: profileName, name: sessionName, email }) ?? undefined;
}
