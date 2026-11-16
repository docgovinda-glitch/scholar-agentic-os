/** Display helpers for uploaded course materials (size, time, format icon and label). */
import { FileText,FileSpreadsheet,Presentation,Image as ImageIcon,FileCode,Globe } from "lucide-react";

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatTimestamp(isoStr?: string): string {
  if (!isoStr) return "Recently";
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

/** Icon based on source format */
export function SourceTypeIcon({ type }: { type?: string }) {
  switch (type) {
    case "pptx":
      return <Presentation className="w-5 h-5 text-amber-500" />;
    case "spreadsheet":
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    case "image":
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    case "weblink":
      return <Globe className="w-5 h-5 text-sky-500" />;
    case "docx":
      return <FileText className="w-5 h-5 text-blue-500" />;
    case "text":
      return <FileCode className="w-5 h-5 text-[color:var(--text-muted)]" />;
    default:
      return <FileText className="w-5 h-5 text-rose-500" />;
  }
}

/** Format label pill */
export function SourceFormatBadge({ type }: { type?: string }) {
  let label = "PDF Document";
  let color = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";

  if (type === "pptx") {
    label = "Slides / Keynote";
    color = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  } else if (type === "spreadsheet") {
    label = "Spreadsheet / Dataset";
    color = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  } else if (type === "image") {
    label = "Image / Scanned Figure";
    color = "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
  } else if (type === "weblink") {
    label = "Web Page / URL";
    color = "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
  } else if (type === "docx") {
    label = "Word Document";
    color = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  } else if (type === "text") {
    label = "Text Notes";
    color = "bg-slate-500/10 text-[color:var(--text-secondary)] border-slate-500/20";
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {label}
    </span>
  );
}
