import React, { useState, useEffect, useRef } from "react";
import { authedJsonFetch, authedFetch } from "../api";

interface ProjectFile {
  id: string;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}

export default function ProjectFilesPanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = () => {
    setLoading(true);
    authedJsonFetch(`/api/projects/${projectId}/files`, "GET", null)
      .then((res) => res.json())
      .then((json) => {
        setFiles(json.data || []);
      })
      .catch((err) => console.error("Failed to load files", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFiles();
  }, [projectId]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await authedFetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        fetchFiles();
      } else {
        const err = await res.json();
        console.error("Upload failed", err);
        alert(`Upload failed: ${err.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Upload error", error);
      alert("Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas)]">
      <div className="p-4 border-b border-[color:var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Project Files</h2>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
        />
        <button 
          onClick={handleUploadClick}
          disabled={uploading}
          className="p-1 rounded bg-[color:var(--accent)] text-[color:var(--accent-contrast)] hover:bg-[color:var(--accent-hover)] transition-colors disabled:opacity-50"
          title="Upload file"
        >
          {uploading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-[color:var(--text-muted)]">Loading files...</p>
        ) : files.length === 0 ? (
          <div className="text-center mt-10">
            <svg className="w-12 h-12 mx-auto text-[color:var(--border-strong)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">No files attached to this project.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li key={file.id} className="flex items-center gap-3 p-2 rounded hover:bg-[color:var(--surface-hover)] border border-transparent hover:border-[color:var(--border-subtle)]">
                <svg className="w-5 h-5 text-[color:var(--text-muted)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-[color:var(--text-primary)] truncate">{file.filename}</span>
                  <span className="text-xs text-[color:var(--text-muted)]">
                    {(file.size_bytes / 1024).toFixed(1)} KB • {new Date(file.uploaded_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
