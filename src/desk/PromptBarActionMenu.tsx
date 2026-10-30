import React, { useState, useRef, useEffect } from 'react';
import { Plus, Globe, Compass, Paperclip, X } from 'lucide-react';

export type PromptMode = 'auto' | 'search' | 'deep_research';

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
          className="absolute bottom-full mb-2 left-0 z-50 w-56 p-1.5 rounded-2xl bg-white dark:bg-ink-650 border border-neutral-200 dark:border-white/10 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
          >
            <Paperclip className="w-4 h-4 text-neutral-500" />
            <span>Add files & photos</span>
          </button>

          <div className="my-1 border-t border-neutral-100 dark:border-white/5" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMode(currentMode === 'search' ? 'auto' : 'search');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer text-left ${
              currentMode === 'search'
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium'
                : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <Globe className="w-4 h-4 text-neutral-500" />
            <span>Web search</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMode(currentMode === 'deep_research' ? 'auto' : 'deep_research');
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer text-left ${
              currentMode === 'deep_research'
                ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-medium'
                : 'text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <Compass className="w-4 h-4 text-neutral-500" />
            <span>Deep research</span>
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

      {/* Active Mode Chip (Only shown when not 'auto') */}
      {currentMode !== 'auto' && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 animate-in fade-in duration-150">
          {currentMode === 'search' ? (
            <>
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span>Search</span>
            </>
          ) : (
            <>
              <Compass className="w-3.5 h-3.5 text-purple-500" />
              <span>Deep Research</span>
            </>
          )}
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
