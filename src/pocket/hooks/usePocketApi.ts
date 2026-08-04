/**
 * Pocket API Hooks — React integration for approval queue, comments, chat
 * Handles API calls, caching, offline queuing, and error handling
 */

import { useState, useCallback, useEffect, useRef } from "react";

export interface PocketComment {
  id: string;
  text: string;
  section_id?: string;
  created_at: string;
  resolved: boolean;
  user_id: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ApprovalDecision {
  sourceId: string;
  decision: "approved" | "rejected" | "deferred";
}

export interface QueuedAction {
  id?: string;
  type: "approve" | "comment";
  projectId?: string;
  sourceId?: string;
  decision?: string;
  docId?: string;
  text?: string;
  sectionId?: string;
}

/**
 * Hook for managing approval queue decisions
 */
export function useApprovalQueue(projectId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueStats, setQueueStats] = useState({ total: 0, approved: 0, rejected: 0, pending: 0 });

  // Load initial queue stats
  useEffect(() => {
    loadQueueStats();
  }, [projectId]);

  const loadQueueStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/pocket/projects/${projectId}/approval-queue`);
      if (!res.ok) throw new Error("Failed to load queue stats");
      const data = await res.json();
      setQueueStats(data.stats);
    } catch (err) {
      console.error("Queue stats error:", err);
    }
  }, [projectId]);

  const submitDecision = useCallback(
    async (sourceId: string, decision: "approved" | "rejected" | "deferred") => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/pocket/projects/${projectId}/approve-source`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, decision }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to submit decision");
        }

        const data = await res.json();

        // Update local stats
        if (decision === "approved") {
          setQueueStats((prev) => ({
            ...prev,
            approved: prev.approved + 1,
            pending: Math.max(0, prev.pending - 1),
          }));
        } else if (decision === "rejected") {
          setQueueStats((prev) => ({
            ...prev,
            rejected: prev.rejected + 1,
            pending: Math.max(0, prev.pending - 1),
          }));
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return {
    loading,
    error,
    queueStats,
    submitDecision,
    refreshStats: loadQueueStats,
  };
}

/**
 * Hook for document comments
 */
export function useDocumentComments(docId: string) {
  const [comments, setComments] = useState<PocketComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load comments on mount and when docId changes
  useEffect(() => {
    loadComments();
  }, [docId]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pocket/documents/${docId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      const data = await res.json();
      setComments(data.comments);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load comments";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  const addComment = useCallback(
    async (text: string, sectionId?: string) => {
      try {
        const res = await fetch(`/api/pocket/documents/${docId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sectionId }),
        });

        if (!res.ok) throw new Error("Failed to create comment");
        const data = await res.json();

        // Add to local state
        setComments((prev) => [data.comment, ...prev]);
        return data.comment;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create comment";
        setError(message);
        throw err;
      }
    },
    [docId]
  );

  const updateComment = useCallback(
    async (commentId: string, updates: { text?: string; resolved?: boolean }) => {
      try {
        const res = await fetch(`/api/pocket/comments/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!res.ok) throw new Error("Failed to update comment");
        const data = await res.json();

        // Update local state
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? data.comment : c))
        );
        return data.comment;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update comment";
        setError(message);
        throw err;
      }
    },
    []
  );

  return {
    comments,
    loading,
    error,
    addComment,
    updateComment,
    refresh: loadComments,
  };
}

/**
 * Hook for chat streaming
 */
export function usePocketChat(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load chat history on mount
  useEffect(() => {
    loadMessages();
  }, [projectId]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/pocket/chat/${projectId}`);
      if (!res.ok) throw new Error("Failed to load chat");
      const data = await res.json();
      setMessages(data.messages);
    } catch (err) {
      console.error("Chat load error:", err);
    }
  }, [projectId]);

  const sendMessage = useCallback(
    async (text: string) => {
      setLoading(true);
      setError(null);

      // Add user message to UI immediately
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        abortControllerRef.current = new AbortController();

        const res = await fetch("/api/pocket/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            messages: [...messages, userMessage],
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) throw new Error("Failed to send message");

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                // Stream complete, add final message
                if (assistantContent) {
                  const assistantMessage: ChatMessage = {
                    id: `temp-${Date.now()}-assistant`,
                    role: "assistant",
                    content: assistantContent,
                    created_at: new Date().toISOString(),
                  };
                  setMessages((prev) => [...prev, assistantMessage]);
                }
              } else {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.token) {
                    assistantContent += parsed.token;
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Request was cancelled
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to send message";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [projectId, messages]
  );

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    cancelStream,
  };
}

/**
 * Hook for offline queue management
 */
export function useOfflineQueue(projectId: string) {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load queue from IndexedDB on mount
  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const db = await openOfflineDb();
      const allItems = await getAllFromStore(db, "queued-actions");
      setQueue(allItems.filter((a: any) => a.projectId === projectId));
    } catch (err) {
      console.error("Failed to load offline queue:", err);
    }
  }, [projectId]);

  const addToQueue = useCallback(
    async (action: QueuedAction) => {
      try {
        const db = await openOfflineDb();
        const withId = { ...action, id: `${Date.now()}`, projectId };
        await addToStore(db, "queued-actions", withId);
        setQueue((prev) => [...prev, withId]);
      } catch (err) {
        console.error("Failed to queue action:", err);
        throw err;
      }
    },
    []
  );

  const syncQueue = useCallback(async () => {
    if (queue.length === 0) return;

    setSyncing(true);
    setError(null);

    try {
      const res = await fetch("/api/pocket/sync/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: queue }),
      });

      if (!res.ok) throw new Error("Failed to sync actions");
      const data = await res.json();

      // Remove synced items from queue
      if (data.synced > 0) {
        setQueue((prev) => prev.slice(data.synced));

        // Clear synced items from IndexedDB
        const db = await openOfflineDb();
        for (let i = 0; i < data.synced; i++) {
          await deleteFromStore(db, "queued-actions", queue[i].id);
        }
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setError(message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [queue]);

  return {
    queue,
    syncing,
    error,
    addToQueue,
    syncQueue,
  };
}

/**
 * IndexedDB Helper Functions
 */

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pocket-offline", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("queued-actions")) {
        db.createObjectStore("queued-actions", { keyPath: "id" });
      }
    };
  });
}

function getAllFromStore(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function addToStore(db: IDBDatabase, storeName: string, item: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.add(item);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function deleteFromStore(db: IDBDatabase, storeName: string, key: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
