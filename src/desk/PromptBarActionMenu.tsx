import React, { useState, useRef, useEffect } from 'react';
import { Plus, Compass, Paperclip, X, MessageSquare } from 'lucide-react';

export type PromptMode = 'auto' | 'chat' | 'deep_research';

export function PromptBarActionMenu({
  currentMode,
  onSelectMode,
  onAttachFiles,
}: {
  currentMode: PromptMode;
  onSelectMode: (mode: PromptMode) => void;
  onAttachFiles: (files: FileList | File[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files) onAttachFiles(e.target.files);
          setIsOpen(false);
          e.target.value = '';
        }}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,image/*"
        aria-label="File upload"
      />

      {/* Floating Menu Popover */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Prompt options menu"
          className="absolute bottom-full mb-2 left-0 z-50 w-64 p-1.5 rounded-2xl bg-white dark:bg-ink-650 border border-neutral-200 dark:border-white/10 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 space-y-0.5"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              fileInputRef.current?.click();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
          >
            <Paperclip className="w-4 h-4 text-neutral-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Add files & photos</div>
              <p className="text-[10px] text-neutral-400 leading-tight">PDFs, documents & images</p>
            </div>
          </button>

          <div className="my-1 border-t border-neutral-100 dark:border-white/5" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMode('auto');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer text-left ${
              currentMode === 'auto' || currentMode === 'chat'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium'
                : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Chat (Default)</div>
              <p className="text-[10px] text-neutral-400 leading-tight">Automatic scholarly & web retrieval when evidence is needed</p>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMode(currentMode === 'deep_research' ? 'auto' : 'deep_research');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer text-left ${
              currentMode === 'deep_research'
                ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium'
                : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <Compass className="w-4 h-4 text-purple-500 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Deep research</div>
              <p className="text-[10px] text-neutral-400 leading-tight">Multi-stage plan, 100–300 sources & long-form report</p>
            </div>
          </button>
        </div>
      )}

      {/* The '+' Trigger Button */}
      <div className="relative group">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-full text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Add files and more"
          title="Add files and more"
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
          Add files and more
        </span>
      </div>

      {/* Active Mode Chip (Only shown when Deep Research is explicitly selected) */}
      {currentMode === 'deep_research' && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 animate-in fade-in duration-150">
          <Compass className="w-3.5 h-3.5 text-purple-500" />
          <span>Deep Research</span>
          <button
            type="button"
            onClick={() => onSelectMode('auto')}
            className="hover:text-neutral-500 dark:hover:text-neutral-400 cursor-pointer p-0.5 rounded-full ml-0.5"
            aria-label="Reset mode"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      )}
    </div>
  );
}
