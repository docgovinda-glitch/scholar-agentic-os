import React, { useState, useEffect } from "react";
import { authedJsonFetch } from "../api";

interface ActivityEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

export default function Tray({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"activity" | "agents">("activity");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "activity") {
      setLoading(true);
      authedJsonFetch(`/api/projects/${projectId}/activity`, "GET", null)
        .then((res) => res.json())
        .then((json) => {
          setEvents(json.data || []);
        })
        .catch((err) => console.error("Failed to load activity", err))
        .finally(() => setLoading(false));
    }
  }, [activeTab, projectId]);

  return (
    <div className="h-64 bg-[color:var(--surface-raised)] border-t border-[color:var(--border-subtle)] flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-base)]">
        <div className="flex gap-4">
          <button
            className={`text-sm font-semibold ${activeTab === "activity" ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-muted)]"}`}
            onClick={() => setActiveTab("activity")}
          >
            Activity Log
          </button>
          <button
            className={`text-sm font-semibold ${activeTab === "agents" ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-muted)]"}`}
            onClick={() => setActiveTab("agents")}
          >
            Agents
          </button>
        </div>
        <button onClick={onClose} className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "activity" && (
          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-[color:var(--text-muted)]">Loading activity...</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">No recent activity.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="flex gap-3 text-sm">
                  <span className="text-[color:var(--text-muted)] shrink-0 w-20">
                    {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-semibold text-[color:var(--text-primary)]">{ev.event_type}</span>
                    <span className="text-[color:var(--text-secondary)]">{ev.description}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "agents" && (
          <div className="text-sm text-[color:var(--text-muted)]">
            <p>No agents currently running.</p>
          </div>
        )}
      </div>
    </div>
  );
}
