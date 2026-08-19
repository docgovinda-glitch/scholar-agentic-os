import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers } from "../../api";

interface TitleItem {
  id: string;
  title_text: string;
  subtitle_text: string | null;
  rationale: string;
  status: "proposed" | "locked" | "rejected";
}

export default function TitleSelectionStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: () => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<TitleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [isCustomEditing, setIsCustomEditing] = useState(false);

  const selectedTitle = project.answers?.["working_title"];

  useEffect(() => {
    let active = true;

    const startGeneration = async () => {
      setIsProcessing(true);
      setResults(null);
      setError(null);
      setLogs([
        {
          id: Date.now().toString() + "1",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `> title.generate()`,
        },
      ]);

      const actions = [
        "Synthesizing selected research gap...",
        "Analyzing target journal naming conventions...",
        "A/B testing title impact scores...",
        "Refining semantic keywords for indexing...",
        "Generating subtitle rationales...",
      ];
      let step = 0;

      const logInterval = setInterval(() => {
        if (!active) return;
        if (step < actions.length) {
          const msg = actions[step];
          setLogs((prev) => [
            ...prev,
            {
              id: Date.now().toString() + Math.random(),
              timestamp: new Date().toLocaleTimeString([], { hour12: false }),
              level: "action",
              message: `  ${msg}`,
            },
          ]);
          step++;
        }
      }, 900);

      try {
        const response = await authedJsonFetch(`/api/projects/${projectId}/agent/titles`, "POST", {});
        const resJson = await response.json();
        
        if (!response.ok) {
          throw new Error(resJson.error || "Agent encountered an error during title generation.");
        }
        
        await new Promise(r => setTimeout(r, 5500)); // wait for animations
        
        if (!active) return;
        const { data } = resJson;
        setResults(data);
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "done",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "success",
            message: `✓ ✦ Generated from your selected research gap`,
          },
        ]);
      } catch (err: any) {
        if (!active) return;
        setError(err.message);
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "err",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "error",
            message: err.message,
          },
        ]);
      } finally {
        if (active) {
          clearInterval(logInterval);
          setIsProcessing(false);
        }
      }
    };

    if (results === null && !isProcessing) {
      startGeneration();
    }

    return () => {
      active = false;
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectTitle = async (item: TitleItem) => {
    setIsSaving(true);
    setError(null);
    try {
      const fullTitle = item.subtitle_text 
        ? `${item.title_text}: ${item.subtitle_text}` 
        : item.title_text;
      
      const newAnswers = {
        ...project.answers,
        working_title: fullTitle,
        title_rationale: item.rationale,
      };
      
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
      if (onAdvance) {
        onAdvance();
      }
    } catch (err: any) {
      setError(err.message || "Failed to save title selection.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCustomTitle = async (title: string, rationale: string = "User customized title") => {
    setIsSaving(true);
    setError(null);
    try {
      const newAnswers = {
        ...project.answers,
        working_title: title,
        title_rationale: rationale,
      };
      
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
      if (onAdvance) {
        onAdvance();
      }
    } catch (err: any) {
      setError(err.message || "Failed to save title selection.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (item: TitleItem) => {
    setEditingId(item.id);
    const fullTitle = item.subtitle_text ? `${item.title_text}: ${item.subtitle_text}` : item.title_text;
    setEditValue(fullTitle);
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-[color:var(--text-secondary)] mt-1">
              {def.description}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setResults(null);
            setLogs([]);
          }}
          disabled={isProcessing}
          className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Generate Titles
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 flex flex-col items-center">
        <div className="w-full max-w-4xl animate-fade-in">
          {(isProcessing || logs.length > 0) && (
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Title Generator"
            />
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}
        </div>

        {results && (
          <div className="w-full max-w-4xl animate-fade-in space-y-6">
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 flex items-center gap-2">
              <span className="text-[color:var(--accent)]">✦</span> TITLE CANDIDATES
            </h3>
            
            {results.map((item, index) => {
              const fullTitle = item.subtitle_text 
                ? `${item.title_text}: ${item.subtitle_text}` 
                : item.title_text;
              const isSelected = selectedTitle === fullTitle;
              const isEditing = editingId === item.id;

              return (
                <div key={item.id} className={`bg-[color:var(--surface-raised)] border ${isSelected ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]" : "border-[color:var(--border-subtle)]"} rounded-xl p-6 shadow-sm relative group`}>
                  
                  <div className="text-4xl text-[color:var(--text-muted)] font-black absolute top-4 right-4 opacity-30">
                    0{index + 1}
                  </div>
                  
                  {isEditing ? (
                    <div className="mb-4">
                      <label className="block text-xs font-bold text-[color:var(--text-muted)] mb-2 uppercase tracking-wide">Edit Title</label>
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded p-3 text-lg font-serif mb-3 focus:outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleSelectCustomTitle(editValue, item.rationale)}
                          disabled={isSaving}
                          className="px-4 py-2 bg-[color:var(--accent)] text-white rounded text-sm font-semibold hover:bg-[color:var(--accent-hover)] disabled:opacity-50"
                        >
                          Save & Select Title
                        </button>
                        <button 
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] rounded text-sm font-semibold hover:bg-[color:var(--border-default)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-2xl font-bold text-[color:var(--text-primary)] mb-2 font-serif pr-12">
                        {item.title_text}
                      </h4>
                      {item.subtitle_text && (
                        <h5 className="text-lg text-[color:var(--text-secondary)] font-serif italic mb-6">
                          {item.subtitle_text}
                        </h5>
                      )}
                      <p className="text-sm text-[color:var(--text-secondary)] mb-6">
                        {item.rationale}
                      </p>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handleSelectTitle(item)}
                          disabled={isSaving}
                          className={`px-6 py-2 rounded-lg font-semibold transition-colors shadow-sm disabled:opacity-50 ${
                            isSelected
                              ? "bg-[color:var(--accent)] text-white"
                              : "bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                          }`}
                        >
                          {isSaving && isSelected ? "Locking..." : isSelected ? "Selected" : "Select Title"}
                        </button>
                        {!isSelected && (
                          <button 
                            onClick={() => startEditing(item)}
                            className="px-4 py-2 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--accent)] transition-colors border border-transparent hover:border-[color:var(--accent)] rounded-lg font-medium"
                          >
                            [ Edit Title ]
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Write your own title */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] border-dashed rounded-xl p-6 relative">
              {isCustomEditing ? (
                <div>
                  <label className="block text-xs font-bold text-[color:var(--text-muted)] mb-2 uppercase tracking-wide">Write Your Own Title</label>
                  <textarea
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Enter your custom title here..."
                    className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded p-3 text-lg font-serif mb-3 focus:outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleSelectCustomTitle(customTitle, "User provided custom title")}
                      disabled={isSaving || !customTitle.trim()}
                      className="px-4 py-2 bg-[color:var(--accent)] text-white rounded text-sm font-semibold hover:bg-[color:var(--accent-hover)] disabled:opacity-50"
                    >
                      Save & Select Custom Title
                    </button>
                    <button 
                      onClick={() => setIsCustomEditing(false)}
                      className="px-4 py-2 bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] rounded text-sm font-semibold hover:bg-[color:var(--border-default)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setIsCustomEditing(true)}
                  className="w-full py-4 text-center text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] rounded-lg transition-colors font-medium"
                >
                  + Write your own title
                </button>
              )}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}
