import React, { useState, useRef, useCallback } from "react";
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export interface BriefUploadCardProps {
  onFileSelect: (file: File) => Promise<void> | void;
  isUploading?: boolean;
  uploadedFileName?: string;
  className?: string;
}

/**
 * BriefUploadCard Component
 * ------------------------
 * Provides an optimistic drag-and-drop dropzone with locked container height (min-h-[260px])
 * to prevent layout shifts, and displays a prominent processing status pill during brief sanitization.
 */
export const BriefUploadCard: React.FC<BriefUploadCardProps> = ({
  onFileSelect,
  isUploading = false,
  uploadedFileName,
  className = "",
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processing = isUploading || localProcessing;

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      setLocalProcessing(true);
      try {
        await onFileSelect(file);
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to process brief document");
      } finally {
        setLocalProcessing(false);
      }
    },
    [onFileSelect]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  return (
    <div
      data-testid="brief-upload-card"
      className={`min-h-[260px] w-full rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden ${
        isDragOver
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
          : "border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] hover:border-neutral-300 dark:hover:border-white/20"
      } ${className}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md,.pptx"
        className="hidden"
        aria-label="Upload assignment brief file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {processing ? (
        <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>

          {/* Status pill with locked layout height */}
          <div className="space-y-2">
            <span
              data-testid="sanitizing-status-pill"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
              <span>Sanitizing brief and extracting core questions...</span>
            </span>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Reassembling sentence fragments, purging slide noise, and deduping prompts.
            </p>
          </div>
        </div>
      ) : uploadedFileName ? (
        <div className="flex flex-col items-center justify-center space-y-3 animate-in fade-in duration-200">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {uploadedFileName}
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Brief Analyzed & Sanitized
            </span>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer mt-1"
          >
            Upload different file
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 flex items-center justify-center">
            <Upload className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Upload Assignment Brief or Tutorial Slides
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm">
              Drag and drop your PDF, DOCX, or PPTX export here, or{" "}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
              >
                browse files
              </button>
            </p>
          </div>
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            PDF, DOCX, PPTX, or TXT up to 25MB
          </span>

          {errorMsg && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BriefUploadCard;
