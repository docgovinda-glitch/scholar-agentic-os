import { useState } from "react";
import { updateVaultItemDetails, type VaultItem } from "../../services/vaultContents";

export default function VaultItemEditModal({
  userId,
  item,
  existingCollections,
  allExistingTags,
  onSave,
  onClose,
}: {
  userId: string;
  item: VaultItem;
  existingCollections: string[];
  allExistingTags: string[];
  onSave: (updated: VaultItem) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [collection, setCollection] = useState(item.collection || "");
  const [newCollectionInput, setNewCollectionInput] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [authors, setAuthors] = useState((item.authors || []).join(", "));
  const [year, setYear] = useState(item.year || "");
  const [journal, setJournal] = useState(item.journal || "");
  const [citation, setCitation] = useState(item.citation || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddTag(tagToAdd?: string) {
    const raw = (tagToAdd || tagInput).trim();
    if (!raw) return;
    const cleanTag = raw.replace(/^#/, "").trim();
    if (cleanTag && !tags.includes(cleanTag)) {
      setTags([...tags, cleanTag]);
    }
    setTagInput("");
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);

    const finalCollection = isCreatingCollection
      ? newCollectionInput.trim() || undefined
      : collection.trim() || undefined;

    const authorList = authors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    try {
      const updated = await updateVaultItemDetails(userId, item.id, {
        title: title.trim(),
        collection: finalCollection,
        tags,
        citation: citation.trim() || undefined,
        authors: authorList.length > 0 ? authorList : undefined,
        year: year.trim() || undefined,
        journal: journal.trim() || undefined,
      });

      if (updated) {
        onSave(updated);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "Failed to update item.");
    } finally {
      setBusy(false);
    }
  }

  const suggestedTags = allExistingTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-[color:var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏷️</span>
            <h3 className="text-base font-bold text-[color:var(--text-primary)]">
              Edit Document Details
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-[color:var(--state-danger-subtle)] border border-[color:var(--accent-border)] p-3 text-xs text-[color:var(--state-danger)]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4 text-xs">
          {/* Title */}
          <div>
            <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
            />
          </div>

          {/* Collection Selection / Creation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-[color:var(--text-primary)]">
                📁 Project
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingCollection(!isCreatingCollection);
                  setNewCollectionInput("");
                }}
                className="text-[11px] text-[color:var(--accent)] hover:underline"
              >
                {isCreatingCollection ? "Choose existing" : "+ New Project"}
              </button>
            </div>

            {isCreatingCollection ? (
              <input
                type="text"
                value={newCollectionInput}
                onChange={(e) => setNewCollectionInput(e.target.value)}
                placeholder="e.g., Master's Thesis"
                autoFocus
                className="w-full px-3 py-2 border border-[color:var(--accent)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
              />
            ) : (
              <select
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className="w-full px-3 py-2 border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
              >
                <option value="">(No project - Unassigned)</option>
                {existingCollections.map((col) => (
                  <option key={col} value={col}>
                    📁 {col}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
              🏷️ Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] font-medium text-[11px]"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-[color:var(--state-danger)] text-xs ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Type tag and press Enter..."
                className="flex-1 px-3 py-1.5 border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
              />
              <button
                type="button"
                onClick={() => handleAddTag()}
                className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-lg text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              >
                Add
              </button>
            </div>

            {suggestedTags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <span className="text-[10px] text-[color:var(--text-muted)]">Suggestions:</span>
                {suggestedTags.slice(0, 5).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleAddTag(st)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--accent)]"
                  >
                    +{st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bibliographic details */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
            <div>
              <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                Authors (comma separated)
              </label>
              <input
                type="text"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="e.g. John Doe, Jane Smith"
                className="w-full px-2.5 py-1.5 border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                Year
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2024"
                className="w-full px-2.5 py-1.5 border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
              Journal / Venue
            </label>
            <input
              type="text"
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
              placeholder="e.g. Nature Machine Intelligence"
              className="w-full px-2.5 py-1.5 border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[color:var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="px-4 py-2 rounded-lg bg-[color:var(--accent-solid)] text-xs font-bold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
