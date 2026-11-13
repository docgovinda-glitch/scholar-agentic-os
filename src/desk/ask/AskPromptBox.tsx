import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2, Paperclip, Square, X } from "lucide-react";
import { PromptBarActionMenu, type PromptMode } from "../PromptBarActionMenu";
import type { AgentAttachmentItem } from "../dashboard";

export interface AskPromptBoxProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  attachments: AgentAttachmentItem[];
  onRemoveAttachment: (id: string) => void;
  onAttachFiles: (files: FileList | File[]) => void;
  isUploading: boolean;
  mode: PromptMode;
  onModeChange: (mode: PromptMode) => void;
  /** While an answer is being produced: with `onStop` the send button becomes Stop, otherwise it shows a spinner. */
  isThinking: boolean;
  onStop?: () => void;
  placeholder: string;
  ariaLabel: string;
  sendLabel: string;
  inputId?: string;
  inputName?: string;
  /** Rows shown when empty (the box grows with its content up to `maxHeightPx`). */
  minRows?: number;
  maxHeightPx?: number;
  inputRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  /** Extra controls after the attach/mode menu (citation style, preferences, vault toggle…). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The one prompt box of AskScholar (landing page and conversation panel): a rounded, auto-growing
 * composer with attachments, drag-and-drop, paste, Enter to send / Shift+Enter for a new line,
 * and a send button that turns into Stop while an answer is being written.
 */
export function AskPromptBox({
  value,
  onValueChange,
  onSend,
  attachments,
  onRemoveAttachment,
  onAttachFiles,
  isUploading,
  mode,
  onModeChange,
  isThinking,
  onStop,
  placeholder,
  ariaLabel,
  sendLabel,
  inputId,
  inputName,
  minRows = 1,
  maxHeightPx = 144,
  inputRef,
  children,
  className = "",
}: AskPromptBoxProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isUploading;

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (inputRef) inputRef.current = node;
    },
    [inputRef]
  );

  // Grow with the content and shrink back (e.g. after sending) in one place.
  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
  }, [value, maxHeightPx]);

  const submit = () => {
    if (canSend && !isThinking) onSend();
  };

  const collectFiles = (list: DataTransferItemList | null | undefined): File[] => {
    const files: File[] = [];
    if (!list) return files;
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === "file") {
        const f = list[i].getAsFile();
        if (f) files.push(f);
      }
    }
    return files;
  };

  const stopping = isThinking && Boolean(onStop);

  return (
    <form
      onClick={(e) => {
        // A tap on the box's padding focuses the input, as people expect.
        if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="menu"], [role="listbox"], [role="dialog"]')) return;
        localRef.current?.focus();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) onAttachFiles(Array.from(e.dataTransfer.files));
      }}
      className={`relative flex w-full flex-col rounded-3xl border bg-white p-3 shadow-sm transition-all duration-200 dark:bg-ink-750 focus-within:shadow-md ${
        dragging
          ? "border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/20 dark:bg-blue-950/20"
          : "border-neutral-200/90 focus-within:border-neutral-300 dark:border-white/10 dark:focus-within:border-white/20"
      } ${className}`}
    >
      {(attachments.length > 0 || isUploading) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 py-1 pl-2.5 pr-1.5 text-xs text-neutral-800 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-200"
            >
              {att.isImage ? (
                att.previewUrl ? (
                  <img src={att.previewUrl} alt="" className="h-4 w-4 rounded object-cover" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                )
              ) : (
                <FileText className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              )}
              <span className="max-w-[160px] truncate text-[11px] font-medium">{att.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(att.id)}
                aria-label={`Remove ${att.name}`}
                className="cursor-pointer rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          {isUploading && (
            <span role="status" className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" aria-hidden="true" /> Reading file…
            </span>
          )}
        </div>
      )}

      <textarea
        ref={setRefs}
        id={inputId}
        name={inputName}
        rows={minRows}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === "Backspace" && value === "" && attachments.length > 0) {
            onRemoveAttachment(attachments[attachments.length - 1].id);
          }
        }}
        onPaste={(e) => {
          const files = collectFiles(e.clipboardData?.items);
          if (files.length > 0) {
            e.preventDefault();
            onAttachFiles(files);
          }
        }}
        aria-label={ariaLabel}
        placeholder={placeholder}
        style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent", maxHeight: maxHeightPx } as React.CSSProperties}
        className="prompt-bare-input scholar-scrollbar w-full min-w-0 resize-none overflow-y-auto border-none bg-transparent px-1 text-base font-normal leading-relaxed text-neutral-900 shadow-none outline-none placeholder:text-neutral-500 focus:shadow-none focus:outline-none focus:ring-0 dark:text-neutral-100 dark:placeholder:text-neutral-400 sm:text-sm"
      />

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 pt-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PromptBarActionMenu currentMode={mode} onSelectMode={onModeChange} onAttachFiles={onAttachFiles} />
          {children}
        </div>

        <div className="relative group shrink-0">
          {stopping ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white shadow-xs transition-all duration-200 hover:opacity-90 active:scale-95 dark:bg-white dark:text-neutral-900 sm:h-8 sm:w-8"
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend || isThinking}
              title={`${sendLabel} (Enter)`}
              aria-label={sendLabel}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white shadow-xs transition-all duration-200 hover:bg-neutral-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-200/80 disabled:text-neutral-400 disabled:shadow-none dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-white/10 dark:disabled:text-neutral-500 sm:h-8 sm:w-8"
            >
              {isThinking ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <ArrowUp className="h-4 w-4 stroke-[2.25]" aria-hidden="true" />
              )}
            </button>
          )}
          <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[11px] text-white shadow-md group-hover:block dark:bg-neutral-800">
            {stopping ? "Stop generating" : `${sendLabel} (Enter)`}
          </span>
        </div>
      </div>
    </form>
  );
}
