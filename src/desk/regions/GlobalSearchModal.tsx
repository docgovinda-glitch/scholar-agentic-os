import React, { useState, useEffect, useRef } from "react";
import { authedJsonFetch } from "../api";

interface SearchResult {
  id: string;
  title: string;
  type: "project" | "vault" | "claim";
}

export default function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ projects: SearchResult[], vaultSources: SearchResult[], claims: SearchResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await authedJsonFetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-[color:var(--border-subtle)] px-4 py-3">
          <svg className="w-5 h-5 text-[color:var(--text-muted)] mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[color:var(--text-primary)] focus:outline-none text-lg"
            placeholder="Search projects, vault, or claims..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]">
            <kbd className="px-2 py-1 bg-[color:var(--surface-sunken)] rounded text-xs">ESC</kbd>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && <div className="p-4 text-center text-[color:var(--text-muted)]">Searching...</div>}
          
          {!loading && results && (
            <>
              {results.projects.length === 0 && results.vaultSources.length === 0 && results.claims.length === 0 && (
                <div className="p-4 text-center text-[color:var(--text-muted)]">No results found for "{query}"</div>
              )}
              
              {results.projects.length > 0 && (
                <div className="mb-4">
                  <h3 className="px-3 py-1 text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">Projects</h3>
                  <div className="mt-1">
                    {results.projects.map((p) => (
                      <a 
                        key={p.id}
                        href={`/?project=${p.id}`}
                        className="block px-3 py-2 rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)]"
                      >
                        {p.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!query && (
            <div className="p-8 text-center text-[color:var(--text-muted)] text-sm">
              Type to start searching your Scholar Core corpus.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
