import { LectureUploadDropzone } from "../LectureUploadDropzone";
import { VaultSourcePicker } from "../VaultSourcePicker";
import type {
DiscoveredSource,
UploadedSourceDocument,
EvidenceItem
} from "../../types";
import {
ArrowRight
} from "lucide-react";

export interface SourcesEmptyStateProps {
  citationStyle: string;
  handleAddVaultSources: (vaultSources: DiscoveredSource[]) => Promise<void>;
  handleContinue: () => void;
  handleLectureRemove: (docId: string) => Promise<void>;
  handleLectureUpload: (docs: UploadedSourceDocument[], newEvidences?: EvidenceItem[]) => Promise<void>;
  projectId: string;
  question: string;
  sources: DiscoveredSource[];
  userUploadedSources: UploadedSourceDocument[];
}

export function SourcesEmptyState({ citationStyle, handleAddVaultSources, handleContinue, handleLectureRemove, handleLectureUpload, projectId, question, sources, userUploadedSources }: SourcesEmptyStateProps) {
  return (
    <>
        <div
          data-testid="sources-empty-state"
          className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-8 sm:p-12 shadow-xs dark:shadow-none space-y-6"
        >
          <div className="max-w-xl space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">
              Ground Your Assignment in Sources
            </h2>
            <p className="text-xs sm:text-sm text-[color:var(--text-muted)] leading-relaxed">
              Upload your course slides, syllabus, or readings to ground your citations, or proceed to drafting directly.
            </p>
          </div>

          <LectureUploadDropzone
            uploadedFiles={userUploadedSources}
            onUpload={handleLectureUpload}
            onRemove={handleLectureRemove}
            assignmentQuestion={question}
            citationStyle={citationStyle}
            projectId={projectId}
          />

          <VaultSourcePicker
            projectId={projectId}
            existingSourceIds={sources.map((s) => s.id)}
            onAdd={handleAddVaultSources}
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[color:var(--border-subtle)]">
            <p className="text-xs text-[color:var(--text-muted)]">
              Citing sources is optional. You can draft freely and add citations at any time.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleContinue}
                data-testid="proceed-to-drafting-btn"
                className="px-6 py-2.5 rounded-full text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none"
              >
                <span>Proceed to Drafting</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
    </>
  );
}
