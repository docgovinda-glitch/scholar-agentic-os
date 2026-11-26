import type { ProjectView } from "../../../types";
import React from "react";
import BriefScopePanel from "../BriefScopePanel";
import {
type AcademicLevel,
type AssignmentType
} from "../../types";
import {
Upload,FileText
} from "lucide-react";

export interface UnderstandBriefInputProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleLevelChange: (lvl: AcademicLevel) => void;
  handleQuestionBlur: () => void;
  handleTypeChange: (t: AssignmentType) => void;
  intakeTab: "paste" | "upload";
  isDraggingOver: boolean;
  localDiscipline: string;
  localQuestion: string;
  localType: "essay" | "coursework" | "analytical_essay" | "critical_essay" | "argumentative_essay" | "research_paper" | "report" | "case_study" | "literature_review" | "annotated_bibliography" | "reflection" | "article_critique" | "book_review" | "policy_analysis" | "business_assignment" | "lab_report" | "short_answer" | "other";
  parseNotice: string | null;
  processUploadedFile: (file: File) => Promise<void>;
  project: ProjectView | null;
  promptWordCount: number;
  saveAnswers: (updates: Record<string, unknown>) => Promise<void>;
  setIntakeTab: (value: React.SetStateAction<"paste" | "upload">) => void;
  setIsDraggingOver: (value: React.SetStateAction<boolean>) => void;
  setLocalDiscipline: (value: React.SetStateAction<string>) => void;
  setLocalQuestion: (value: React.SetStateAction<string>) => void;
  setParseNotice: (value: React.SetStateAction<string | null>) => void;
  uploadedFileName: string;
  uploadingBrief: boolean;
}

export function UnderstandBriefInput({ fileInputRef, handleLevelChange, handleQuestionBlur, handleTypeChange, intakeTab, isDraggingOver, localDiscipline, localQuestion, localType, parseNotice, processUploadedFile, project, promptWordCount, saveAnswers, setIntakeTab, setIsDraggingOver, setLocalDiscipline, setLocalQuestion, setParseNotice, uploadedFileName, uploadingBrief }: UnderstandBriefInputProps) {
  return (
    <>
          {/* Assignment Question Section */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="inline-flex p-1 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] w-fit">
                <button
                  type="button"
                  onClick={() => setIntakeTab("paste")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    intakeTab === "paste"
                      ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-2xs font-semibold"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  Paste Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setIntakeTab("upload")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    intakeTab === "upload"
                      ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-2xs font-semibold"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload Brief Document (.pdf, .docx)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {promptWordCount > 0 && intakeTab === "paste" && (
                  <span className="text-xs font-mono text-[color:var(--text-muted)]">
                    {promptWordCount} words entered
                  </span>
                )}
                {uploadedFileName && (
                  <span className="text-xs text-emerald-800 dark:text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{uploadedFileName}</span>
                  </span>
                )}
              </div>
            </div>

            {intakeTab === "paste" ? (
              <textarea
                value={localQuestion}
                onChange={(e) => setLocalQuestion(e.target.value)}
                onBlur={handleQuestionBlur}
                rows={4}
                placeholder="Paste your assignment prompt, essay title, or question here..."
                className="w-full bg-[color:var(--surface-inset)]/70 border border-[color:var(--border-subtle)] rounded-xl p-3.5 text-xs sm:text-sm text-[color:var(--text-primary)] placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-[color:var(--accent-solid)] transition-all leading-relaxed resize-y"
              />
            ) : (
              <DropzoneErrorBoundary onError={() => setParseNotice("Could not parse this document. Please verify the file format or paste the brief text manually.")}>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) processUploadedFile(dropped);
                  }}
                  className={`border border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center text-center space-y-3 cursor-pointer ${
                    isDraggingOver
                      ? "border-neutral-900 bg-[color:var(--surface-inset)]/70 dark:border-white"
                      : "border-[color:var(--border-default)] bg-[color:var(--surface-inset)]/50"
                  }`}
                  onClick={() => {
                    if (!uploadingBrief) fileInputRef.current?.click();
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-[color:var(--surface-inset)] flex items-center justify-center text-[color:var(--text-secondary)]">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                      Upload your assignment brief or module handbook
                    </p>
                    <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                      Supports PDF, DOCX, DOC, or TXT
                    </p>
                  </div>
                </div>
              </DropzoneErrorBoundary>
            )}
            {parseNotice && (
              <p role="alert" data-testid="understand-parse-notice" className="text-xs text-[color:var(--state-danger)]">
                {parseNotice}
              </p>
            )}

            <BriefScopePanel
              brief={localQuestion}
              discipline={localDiscipline}
              assignmentType={project?.answers?.["assignment_type_confirmed"] === "true" ? localType : undefined}
              onAnswer={(q, value) => {
                if (q === "discipline") {
                  setLocalDiscipline(value);
                  saveAnswers({ assignment_discipline: value });
                } else if (q === "assignmentType") {
                  handleTypeChange(value as AssignmentType);
                  saveAnswers({ assignment_type_confirmed: "true" });
                } else {
                  handleLevelChange(value as AcademicLevel);
                }
              }}
            />

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processUploadedFile(file);
              }}
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
            />
          </div>
    </>
  );
}
class DropzoneErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void; }, { hasError: boolean; }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Caught dropzone error inline:", error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-[color:var(--border-subtle)] rounded-xl p-6 bg-[color:var(--surface-inset)]/50 text-center space-y-3 font-sans">
          <p className="text-xs text-[color:var(--text-secondary)]">
            Could not parse this document. Please verify the file format or paste the brief text manually.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-1.5 rounded-full text-xs font-medium bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] cursor-pointer"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
