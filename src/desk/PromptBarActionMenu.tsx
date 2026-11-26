import { useRef } from 'react';
import { Plus } from 'lucide-react';

/** "auto" is Quick Scholar; the Quick Scholar | Deep Research toggle in `ScholarFilterBar` is the one place to pick it. */
export type PromptMode = 'auto' | 'chat' | 'deep_research';

/**
 * The composer's "+" button: attach files and photos. It only attaches; the answer mode is chosen in
 * the Quick Scholar | Deep Research toggle, so the same choice is never offered in two places.
 */
export function PromptBarActionMenu({
  onAttachFiles,
}: {
  onAttachFiles: (files: FileList | File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex items-center gap-2">
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files) onAttachFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,image/*"
        aria-label="File upload"
      />

      <div className="relative group">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 rounded-full text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          aria-label="Attach files and photos"
          title="Attach a brief (PDF, DOCX, TXT) or photos"
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 text-xs bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
          Attach files and photos
        </span>
      </div>
    </div>
  );
}
