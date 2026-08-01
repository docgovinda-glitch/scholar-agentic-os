import React, { useState, useMemo } from "react";
import { PaperProject } from "../types";
import { SUBMISSION_CHECKLISTS, SubmissionChecklist } from "../types/submissionTypes";
import { GlassmorphicCard, ProgressBar, StatusIndicator } from "./SciFiComponents";
import { CheckCircle2, Circle, AlertCircle, Download } from "lucide-react";

interface SubmissionChecklistBuilderProps {
  project: PaperProject;
  onUpdate?: (checklist: Record<string, SubmissionChecklist[]>) => void;
}

function SubmissionChecklistBuilder({
  project,
  onUpdate
}: SubmissionChecklistBuilderProps) {
  // Initialize checklist state from project or use default
  const initialChecklist = useMemo(() => {
    const stored = (project.submissionPack as any)?.checklists;
    if (stored) return stored;

    // Deep copy default checklists
    const defaultChecklists: Record<string, SubmissionChecklist[]> = {};
    Object.entries(SUBMISSION_CHECKLISTS).forEach(([section, items]) => {
      defaultChecklists[section] = items.map(item => ({ ...item }));
    });
    return defaultChecklists;
  }, [project.submissionPack]);

  const [checklists, setChecklists] = useState<Record<string, SubmissionChecklist[]>>(initialChecklist);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["formatting"]));

  // Calculate section progress
  const getSectionProgress = (section: string): number => {
    const items = checklists[section] || [];
    if (items.length === 0) return 0;
    const completed = items.filter(item => item.completed).length;
    return Math.round((completed / items.length) * 100);
  };

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    const allItems = Object.values(checklists).flat();
    if (allItems.length === 0) return 0;
    const completed = allItems.filter(item => item.completed).length;
    return Math.round((completed / allItems.length) * 100);
  }, [checklists]);

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Toggle item completion
  const toggleItem = (section: string, itemId: string) => {
    setChecklists(prev => {
      const updated = { ...prev };
      const item = updated[section]?.find(i => i.id === itemId);
      if (item) {
        item.completed = !item.completed;
      }
      onUpdate?.(updated);
      return updated;
    });
  };

  // Update item notes
  const updateItemNotes = (section: string, itemId: string, notes: string) => {
    setChecklists(prev => {
      const updated = { ...prev };
      const item = updated[section]?.find(i => i.id === itemId);
      if (item) {
        item.notes = notes;
      }
      onUpdate?.(updated);
      return updated;
    });
  };

  // Download checklist as text
  const downloadChecklist = () => {
    let content = "SUBMISSION READINESS CHECKLIST\n";
    content += "=" .repeat(50) + "\n\n";
    content += `Journal: ${project.targetJournal?.name || "Not specified"}\n`;
    content += `Manuscript: ${project.title || "Untitled"}\n`;
    content += `Generated: ${new Date().toLocaleDateString()}\n\n`;
    content += `OVERALL COMPLETION: ${overallProgress}%\n`;
    content += "=" .repeat(50) + "\n\n";

    Object.entries(checklists).forEach(([section, items]) => {
      const sectionProgress = getSectionProgress(section);
      content += `\n${section.toUpperCase()} (${sectionProgress}%)\n`;
      content += "-".repeat(40) + "\n";
      items.forEach(item => {
        const checkbox = item.completed ? "[✓]" : "[ ]";
        content += `${checkbox} ${item.item}`;
        if (item.notes) {
          content += ` (Notes: ${item.notes})`;
        }
        if (!item.required) {
          content += " (Optional)";
        }
        content += "\n";
      });
    });

    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `submission-checklist-${project.targetJournal?.name || "submission"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Mark all required items as complete
  const markAllRequiredComplete = () => {
    setChecklists(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(section => {
        updated[section] = updated[section].map(item => ({
          ...item,
          completed: item.required ? true : item.completed
        }));
      });
      onUpdate?.(updated);
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-mono font-bold text-slate-100">
          Submission Readiness Checklist
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Track manuscript completeness before journal submission
        </p>
      </div>

      {/* Overall Progress */}
      <GlassmorphicCard className="p-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-mono text-slate-300">Overall Completion</span>
            <span className="text-sm font-mono font-bold text-luminous-blue">{overallProgress}%</span>
          </div>
          <ProgressBar progress={overallProgress} />
          <div className="flex gap-4 text-xs text-slate-400 font-mono">
            <span>✓ {Object.values(checklists).flat().filter(i => i.completed).length} completed</span>
            <span>→ {Object.values(checklists).flat().filter(i => !i.completed && i.required).length} required</span>
            <span>◇ {Object.values(checklists).flat().filter(i => !i.required).length} optional</span>
          </div>
        </div>
      </GlassmorphicCard>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={markAllRequiredComplete}
          className="px-4 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 font-mono text-xs font-bold uppercase transition-all"
        >
          Mark Required Complete
        </button>
        <button
          onClick={downloadChecklist}
          className="px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue font-mono text-xs font-bold uppercase transition-all flex items-center gap-2"
        >
          <Download className="w-3 h-3" />
          Export
        </button>
      </div>

      {/* Checklists by Section */}
      <div className="space-y-3">
        {Object.entries(checklists).map(([section, items]) => {
          const sectionProgress = getSectionProgress(section);
          const isExpanded = expandedSections.has(section);
          const requiredCount = items.filter(i => i.required).length;
          const completedCount = items.filter(i => i.completed).length;

          return (
            <GlassmorphicCard key={section} className="p-0 overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-luminous-blue font-mono font-bold uppercase text-sm">
                    {section}
                  </span>
                  <div className="flex gap-2 text-xs text-slate-400">
                    <span>{completedCount}/{requiredCount} required</span>
                    <span className="text-slate-600">•</span>
                    <span>{sectionProgress}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-luminous-blue/70 transition-all duration-300"
                      style={{ width: `${sectionProgress}%` }}
                    />
                  </div>
                  <span className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                </div>
              </button>

              {/* Section Items */}
              {isExpanded && (
                <div className="border-t border-slate-700 px-4 py-3 space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <button
                        onClick={() => toggleItem(section, item.id)}
                        className="flex-shrink-0 pt-0.5"
                        title={item.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className={`text-xs leading-relaxed ${
                            item.completed ? "text-slate-400 line-through" : "text-slate-200"
                          }`}>
                            {item.item}
                          </p>
                          {!item.required && (
                            <span className="text-xs text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                              Optional
                            </span>
                          )}
                        </div>
                        <textarea
                          value={item.notes || ""}
                          onChange={(e) => updateItemNotes(section, item.id, e.target.value)}
                          placeholder="Add notes..."
                          className="mt-2 w-full px-2 py-1 bg-navy-3 border border-slate-600 rounded text-xs text-slate-200 placeholder-slate-600 focus:border-luminous-blue focus:outline-none resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassmorphicCard>
          );
        })}
      </div>

      {/* Info */}
      <GlassmorphicCard className="p-4 border-slate-600 bg-blue-900/10">
        <div className="flex gap-2">
          <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-200 leading-relaxed">
            <strong>Required items must be completed</strong> before manuscript submission.
            Optional items may improve acceptance chances depending on journal guidelines.
            Your progress is automatically saved to the project.
          </p>
        </div>
      </GlassmorphicCard>
    </div>
  );
}

export default SubmissionChecklistBuilder;
