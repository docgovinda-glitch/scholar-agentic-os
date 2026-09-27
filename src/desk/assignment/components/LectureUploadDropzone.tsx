import React, { useState, useRef } from "react";
import type { UploadedSourceDocument } from "../types";
import { Upload, FileText, CheckCircle2, Trash2, File, Paperclip } from "lucide-react";

export interface LectureUploadDropzoneProps {
  uploadedFiles: UploadedSourceDocument[];
  onUpload: (documents: UploadedSourceDocument[]) => void;
  onRemove: (documentId: string) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const LectureUploadDropzone: React.FC<LectureUploadDropzoneProps> = ({
  uploadedFiles,
  onUpload,
  onRemove,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowedExtensions = [".pdf", ".pptx", ".txt"];
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      const hasValidExt = allowedExtensions.some((ext) => lowerName.endsWith(ext));
      if (hasValidExt) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    const newDocuments: UploadedSourceDocument[] = validFiles.map((file, idx) => ({
      id: `doc-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
    }));

    onUpload(newDocuments);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (e.target) {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Surface */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="lecture-upload-dropzone"
        className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
          isDragOver
            ? "border-neutral-900 bg-neutral-100/80 dark:border-white dark:bg-white/10 scale-[1.005]"
            : "border-neutral-200 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.02] hover:border-neutral-300 dark:hover:border-white/30 hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.pptx,.txt"
          onChange={handleFileInputChange}
          className="hidden"
          data-testid="lecture-file-input"
        />

        <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
          <Upload className="w-5 h-5" />
        </div>

        <div className="space-y-1 max-w-md">
          <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
            Drop your lecture slides, class notes, or required syllabus PDFs here
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Accepts <span className="font-medium text-neutral-700 dark:text-neutral-300">.pdf, .pptx, .txt</span> · Auto-indexed and approved for assignment citation grounding
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          className="mt-1 px-4 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
        >
          Browse Files
        </button>
      </div>

      {/* Uploaded Materials List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2 pt-1" data-testid="uploaded-materials-list">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-1">
            <span>Uploaded Course Materials ({uploadedFiles.length})</span>
            <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Auto-Approved</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {uploadedFiles.map((doc) => (
              <div
                key={doc.id}
                data-testid={`uploaded-file-${doc.id}`}
                className="p-3 rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-[#1C1C1E] flex items-center justify-between gap-3 text-xs shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 dark:text-white truncate">
                      {doc.name}
                    </p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                      {formatBytes(doc.fileSize)} · Uploaded
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    Included
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(doc.id)}
                    aria-label={`Remove ${doc.name}`}
                    className="p-1 rounded-md text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
