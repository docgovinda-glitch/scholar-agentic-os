import React, { useState, useEffect } from "react";
import { searchVaultItems, type VaultItem, isVaultUnlocked } from "../../services/vaultContents";

export default function ProjectVaultPanel({ projectId, onJumpToBlock }: { projectId: string; onJumpToBlock?: (id: string) => void }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [query, setQuery] = useState("");
  const [unlocked, setUnlocked] = useState(isVaultUnlocked());
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (unlocked) {
      import("../../services/userVault").then(({ currentUserId }) => {
        currentUserId().then(uid => {
          if (uid) {
            setUserId(uid);
            import("../../services/vaultContents").then(({ listVaultItems, searchVaultItems }) => {
              listVaultItems(uid).then(vaultItems => {
                setItems(searchVaultItems(vaultItems, query));
              }).catch(console.error);
            });
          }
        });
      });
    }
  }, [query, unlocked]);

  if (!unlocked) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center text-[color:var(--text-muted)] h-full">
        <svg className="w-8 h-8 mb-2 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm">Vault is locked.</p>
        <p className="text-xs mt-1">Unlock your Vault from the Header menu first.</p>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { authedFetch } = await import("../api");
      const res = await authedFetch(`/api/projects/${projectId}/parse-file`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to parse file");
      }

      const data = await res.json();
      if (data.text) {
        const { addVaultItem, listVaultItems } = await import("../../services/vaultContents");
        const newItem: VaultItem = {
          id: `vault-${Date.now()}`,
          title: file.name,
          content: data.text,
          createdAt: new Date().toISOString(),
        };
        await addVaultItem(userId, newItem);
        
        // Refresh list
        const updated = await listVaultItems(userId);
        setItems(searchVaultItems(updated, query));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to upload and parse file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas)]">
      <div className="p-2 border-b border-[color:var(--border-subtle)] space-y-2">
        <input
          type="search"
          placeholder="Search vault..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded text-[color:var(--text-primary)]"
        />
        <div className="flex justify-end">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-2 py-1 text-xs font-semibold bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] disabled:opacity-50 transition-colors"
          >
            {uploading ? "Importing..." : "Import File"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="text-xs text-[color:var(--text-muted)] text-center mt-4">
            {query ? "No matches found." : "Your vault is empty."}
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="p-2 text-xs rounded hover:bg-[color:var(--surface-hover)] border border-transparent hover:border-[color:var(--border-subtle)]">
                <div className="font-semibold text-[color:var(--text-primary)] truncate">{item.title}</div>
                {item.authors && item.authors.length > 0 && (
                  <div className="text-[color:var(--text-muted)] truncate">{item.authors.join(", ")} {item.year ? `(${item.year})` : ""}</div>
                )}
                {item.journal && (
                  <div className="text-[color:var(--text-secondary)] italic truncate">{item.journal}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
