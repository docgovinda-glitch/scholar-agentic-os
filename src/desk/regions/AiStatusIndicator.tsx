import React, { useEffect, useState } from "react";
import { routeDecision, type RoutingChoice } from "../aiAccess/aiAccessApi";

export const AiStatusIndicator: React.FC = () => {
  const [choice, setChoice] = useState<RoutingChoice | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const decision = await routeDecision("reasoning");
        if (mounted) {
          if (decision.ok) {
            setChoice(decision.choice);
            setError(false);
          } else {
            setChoice(null);
            setError(true);
          }
        }
      } catch (err) {
        if (mounted) {
          setChoice(null);
          setError(true);
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Check every minute
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 text-red-600 rounded-full text-xs font-medium border border-red-100 shadow-sm" title="AI access is currently unavailable. Check your AI Access settings.">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        AI Disconnected
      </div>
    );
  }

  if (!choice) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-gray-400 rounded-full text-xs font-medium border border-gray-100 shadow-sm animate-pulse">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
        Connecting...
      </div>
    );
  }

  const isLocal = choice.tier === "local";
  const displayProvider = choice.providerId === "premium" ? "Scholar Premium" : choice.providerId;

  return (
    <div 
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-sm transition-colors ${
        isLocal 
          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
          : "bg-indigo-50 text-indigo-700 border-indigo-100"
      }`}
      title={choice.reasoning}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${isLocal ? "bg-emerald-500" : "bg-indigo-500"} animate-pulse`}></div>
      <span className="capitalize">{displayProvider}</span>
      <span className="opacity-50">·</span>
      <span className="truncate max-w-[120px]">{choice.modelId || "Auto"}</span>
    </div>
  );
};
