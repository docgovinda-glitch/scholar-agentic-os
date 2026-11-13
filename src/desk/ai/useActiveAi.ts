import { useEffect, useState } from "react";
import { activeConnection } from "./modelChoices";

/** The connection that answers AI requests first, from the one central AI Access setting. */
export function useActiveAi(): { isConfigured: boolean; providerName: string; modelId: string } {
  const [active, setActive] = useState<{ provider: string; model: string } | null>(null);
  useEffect(() => {
    let alive = true;
    activeConnection().then((c) => alive && setActive(c ? { provider: c.provider, model: c.model } : null)).catch(() => alive && setActive(null));
    return () => { alive = false; };
  }, []);
  return { isConfigured: active !== null, providerName: active?.provider ?? "", modelId: active?.model ?? "" };
}
