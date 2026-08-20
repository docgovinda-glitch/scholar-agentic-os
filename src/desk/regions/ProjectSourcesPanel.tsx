import React, { useState, useEffect } from "react";
import { authedJsonFetch } from "../api";

interface SearchResult {
  id: string;
  title: string;
  type: "project" | "claim";
}

export default function ProjectSourcesPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ projects: SearchResult[], claims: SearchResult[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await authedJsonFetch(`/api/search?q=${encodeURIComponent(query)}`, "GET", null);
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
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas)]">
      <div className="p-2 border-b border-[color:var(--border-subtle)]">
        <input
          type="search"
          placeholder="Search corpus..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded text-[color:var(--text-primary)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="text-xs text-[color:var(--text-muted)] text-center mt-4">Searching...</p>
        ) : !results ? (
          <p className="text-xs text-[color:var(--text-muted)] text-center mt-4">Type to search your corpus.</p>
        ) : results.projects.length === 0 && results.claims.length === 0 ? (
          <p className="text-xs text-[color:var(--text-muted)] text-center mt-4">No matches found.</p>
        ) : (
          <div className="space-y-4">
            {results.projects.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">Projects</h3>
                <ul className="space-y-1">
                  {results.projects.map(p => (
                    <li key={p.id} className="p-1.5 text-xs rounded hover:bg-[color:var(--surface-hover)] cursor-pointer">
                      <div className="font-semibold text-[color:var(--text-primary)] truncate">{p.title}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {results.claims.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1">Claims</h3>
                <ul className="space-y-1">
                  {results.claims.map(c => (
                    <li key={c.id} className="p-1.5 text-xs rounded hover:bg-[color:var(--surface-hover)] cursor-pointer">
                      <div className="text-[color:var(--text-secondary)] truncate">{c.title}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
