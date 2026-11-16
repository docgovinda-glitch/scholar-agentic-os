import type { SetStateAction } from "react";
import { LectureUploadDropzone } from "../LectureUploadDropzone";
import { VaultSourcePicker } from "../VaultSourcePicker";
import type {
DiscoveredSource,
UploadedSourceDocument,
EvidenceItem
} from "../../types";
import {
FileUp
} from "lucide-react";

export interface SourcesCourseMaterialsProps {
  citationStyle: string;
  handleAddVaultSources: (vaultSources: DiscoveredSource[]) => Promise<void>;
  handleLectureRemove: (docId: string) => Promise<void>;
  handleLectureUpload: (docs: UploadedSourceDocument[], newEvidences?: EvidenceItem[]) => Promise<void>;
  isUploadOpen: boolean;
  projectId: string;
  question: string;
  setIsUploadOpen: (value: SetStateAction<boolean>) => void;
  sources: DiscoveredSource[];
  userUploadedSources: UploadedSourceDocument[];
}

export function SourcesCourseMaterials({ citationStyle, handleAddVaultSources, handleLectureRemove, handleLectureUpload, isUploadOpen, projectId, question, setIsUploadOpen, sources, userUploadedSources }: SourcesCourseMaterialsProps) {
  return (
    <>
          {/* Section 1: Course Materials & Syllabus Upload (Sleek Collapsible Card) */}
          <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 transition-all shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] shrink-0">
                  <FileUp className="w-4 h-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold text-[color:var(--text-primary)]">
                      Course Materials & Syllabus Upload
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--surface-inset)] text-[color:var(--text-muted)] font-medium">
                      Optional
                    </span>
                  </div>
                  <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                    {userUploadedSources.length > 0
                      ? `${userUploadedSources.length} course material(s) uploaded; used as evidence when you draft.`
                      : "Upload lecture slides, reading packs, or syllabus notes to anchor specific citations."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsUploadOpen(!isUploadOpen)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer text-[color:var(--text-secondary)] self-start sm:self-auto shrink-0"
              >
                {isUploadOpen ? "Hide Dropzone" : userUploadedSources.length > 0 ? "Manage Files" : "+ Upload Files"}
              </button>
            </div>

            <div className={isUploadOpen || userUploadedSources.length > 0 ? "mt-4 pt-4 border-t border-[color:var(--border-subtle)]" : "hidden"}>
              <LectureUploadDropzone
                uploadedFiles={userUploadedSources}
                onUpload={handleLectureUpload}
                onRemove={handleLectureRemove}
                assignmentQuestion={question}
                citationStyle={citationStyle}
                projectId={projectId}
              />
            </div>

            <div className="mt-4">
              <VaultSourcePicker
                projectId={projectId}
                existingSourceIds={sources.map((s) => s.id)}
                onAdd={handleAddVaultSources}
              />
            </div>
          </div>
    </>
  );
}
