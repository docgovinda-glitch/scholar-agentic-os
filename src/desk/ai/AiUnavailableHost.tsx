import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AiExhaustedModal from "./AiExhaustedModal";
import { subscribeAiUnavailable, type AiUnavailableNotice } from "./aiUnavailableNotice";

const COPY: Record<AiUnavailableNotice["code"], { title: string; explanation: string }> = {
  ai_unavailable: {
    title: "No AI could answer this request",
    explanation:
      "Every AI connection was tried and none answered: a provider may be out of credit or quota, rate-limited, or down. Your work is saved. Add or switch a connection in AI Access, or try again in a moment.",
  },
  ai_provider_required: {
    title: "Connect an AI to continue",
    explanation: "This step needs an AI, and none is connected yet. Add a free key or a local model in AI Access; your work is saved.",
  },
  ai_local_model_unreachable: {
    title: "Your local AI is not reachable",
    explanation: "The local model you chose did not answer. Make sure it is running on this computer, or pick another connection in AI Access.",
  },
};

/** The one place the app offers the way out when no AI could answer (mounted once in DeskApp). */
export function AiUnavailableHost() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<AiUnavailableNotice | null>(null);
  useEffect(() => subscribeAiUnavailable(setNotice), []);
  if (!notice) return null;
  const copy = COPY[notice.code];
  return (
    <AiExhaustedModal
      isOpen
      title={copy.title}
      explanation={copy.explanation}
      errorMessage={notice.message || null}
      onClose={() => setNotice(null)}
      onOpenAiAccess={() => navigate("/ai-access")}
    />
  );
}
