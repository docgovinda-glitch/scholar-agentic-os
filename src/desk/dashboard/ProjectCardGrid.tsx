import React from "react";
import { MessageSquare } from "lucide-react";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import type { ProjectView } from "../types";
import {
  FORMAT_TILES,
  FormatIcon,
  getFormatTileTheme,
} from "./ProjectCreateIntakeModal";

export interface ProjectCardGridProps {
  welcomeVisible: boolean;
  setWelcomeVisible: (visible: boolean) => void;
  error: string | null;
  isAiSidebarOpen: boolean;
  hasStartedChatting: boolean;
  creating: boolean;
  creatingFormatId: string | null;
  userEmail: string | null;
  openAuth: (mode?: "signin" | "signup", msg?: string, formatId?: string) => void;
  handleCreate: (formatId: string) => void;
  setIsAiSidebarOpen: (open: boolean) => void;
  onResetChatDeliverables: () => void;
  projectToDelete: ProjectView | null;
  setProjectToDelete: (project: ProjectView | null) => void;
  deletingId: string | null;
  handleConfirmDelete: () => void;
  getProjectTitle: (p: ProjectView | null) => string;
}

export default function ProjectCardGrid({
  welcomeVisible,
  setWelcomeVisible,
  error,
  isAiSidebarOpen,
  hasStartedChatting,
  creating,
  creatingFormatId,
  userEmail,
  openAuth,
  handleCreate,
  setIsAiSidebarOpen,
  onResetChatDeliverables,
  projectToDelete,
  setProjectToDelete,
  deletingId,
  handleConfirmDelete,
  getProjectTitle,
}: ProjectCardGridProps) {
  return (
    <>
      <div className="w-full max-w-5xl flex flex-col items-center gap-6 my-auto pb-4">
        {/* Onboarding welcome banner */}
        {welcomeVisible && (
          <div
            role="status"
            className="w-full rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-5 flex items-start justify-between gap-4 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-gray-100 text-neutral-900 dark:text-gray-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="sm" className="text-neutral-900 dark:text-gray-900" />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-900 dark:text-gray-100 font-sans">
                  Welcome to your Scholar Workspace
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-normal leading-relaxed font-sans">
                  Select an academic workspace to begin, or upload reference PDFs to your Vault.
                </p>
              </div>
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => setWelcomeVisible(false)}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-gray-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-red-400 text-xs font-medium flex items-center gap-3">
            <svg
              className="w-4 h-4 flex-shrink-0 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="font-semibold font-sans">{error}</span>
          </div>
        )}

        {/* Workspace Heading & 4-Card Template Grid */}
        {!isAiSidebarOpen && !hasStartedChatting ? (
          <>
            <div className="text-center mb-2">
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
                Where will your research begin?
              </h1>
              <p className="text-[13px] text-neutral-500 mt-1">
                Select an academic deliverable or paste your assignment guidelines below.
              </p>
            </div>

            <div className="w-full">
              <div className="grid w-full gap-4 transition-all duration-300 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {FORMAT_TILES.map((tile) => {
                  const isBootingThis = creatingFormatId === tile.id;
                  const isOtherBooting = creating && !isBootingThis;
                  const tileTheme = getFormatTileTheme(tile.id);
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => {
                        if (creating) return;
                        if (!userEmail) {
                          openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                          return;
                        }
                        handleCreate(tile.id);
                      }}
                      disabled={isOtherBooting}
                      className={`group bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${
                        tileTheme.hoverBorder
                      } rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[16.5rem] h-auto text-left relative ${
                        isOtherBooting
                          ? "opacity-50 cursor-not-allowed"
                          : isBootingThis
                          ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                          : ""
                      }`}
                    >
                      {/* Category Icon */}
                      <div className="flex items-center justify-between w-full">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}
                        >
                          {isBootingThis ? (
                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <FormatIcon id={tile.id} className="w-4 h-4" />
                          )}
                        </div>
                      </div>

                      {/* Title & Guidance */}
                      <div className="mt-3.5 mb-2 flex-1 flex flex-col justify-start">
                        <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                          {tile.label}
                        </h3>
                        <p className="text-[12px] leading-relaxed font-normal text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-3">
                          {tile.guidance}
                        </p>
                      </div>

                      {/* Deliverables Spec */}
                      <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-500 font-sans leading-tight">
                        {(tile.specs || tile.footer).split(" · ").map((part, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && (
                              <span className="text-neutral-400 dark:text-neutral-500 opacity-60 font-bold">·</span>
                            )}
                            <span className="font-medium whitespace-nowrap">{part}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 flex flex-col items-center gap-3 animate-in fade-in duration-200">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Ask Scholar Copilot Active</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Your research inquiry is active in full screen.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIsAiSidebarOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer"
              >
                Open Full-Screen Chat
              </button>
              <button
                type="button"
                onClick={onResetChatDeliverables}
                className="px-3.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer"
              >
                Show Deliverables
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal Pop-up */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !deletingId && setProjectToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 p-7 shadow-2xl relative text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-modal-title"
              className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100 tracking-tight mb-2.5 font-sans"
            >
              Delete Project
            </h3>

            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-7 font-normal font-sans">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                "{getProjectTitle(projectToDelete)}"
              </span>
              ? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-1 font-sans">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 transition-all cursor-pointer disabled:opacity-50 font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-[#E60023] hover:text-[#AD081B] bg-[#E60023]/15 hover:bg-[#E60023]/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
              >
                {deletingId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#E60023] border-t-transparent rounded-full animate-spin mr-2" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
