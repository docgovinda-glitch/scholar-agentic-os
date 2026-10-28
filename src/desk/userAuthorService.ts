/**
 * User Author Service
 *
 * Persists and manages reusable author profiles for a specific authenticated user.
 * Authors once saved in Journal Article are stored for that user, allowing:
 * 1. 1-click addition of saved authors into any manuscript.
 * 2. Automatic saving of manuscript authors into the user's personal author roster.
 * 3. Adding new authors or removing existing authors from either the manuscript or the user's saved roster.
 */

import type { Author } from "./types.ts";
import { authedFetch, authedJsonFetch } from "./api";

const AUTHORS_CHANGED_EVENT = "scholar_saved_authors_changed";

/**
 * Returns the localStorage key scoped to the specific user's email or identity.
 */
export function getUserAuthorStorageKey(userEmail?: string | null): string {
  const normalized = (userEmail || "").trim().toLowerCase();
  return normalized ? `scholar_user_authors_${normalized}` : "scholar_user_authors_default";
}

/**
 * Retrieves the list of authors saved for the given user from local storage.
 */
export function getLocalSavedAuthors(userEmail?: string | null): Author[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getUserAuthorStorageKey(userEmail));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists an author to the specific user's saved authors list.
 * Deduplicates by author ID, email, or full name.
 */
export function saveAuthorForUser(author: Author, userEmail?: string | null): Author[] {
  if (typeof window === "undefined") return [];
  // Ensure the author has at least some identifying information
  const hasName = Boolean(author.firstName?.trim() || author.surname?.trim() || author.email?.trim());
  if (!hasName) return getLocalSavedAuthors(userEmail);

  try {
    const current = getLocalSavedAuthors(userEmail);
    const normalizedEmail = (author.email || "").trim().toLowerCase();
    const normalizedName = `${author.firstName || ""} ${author.surname || ""}`.trim().toLowerCase();

    // Find existing match
    const existingIndex = current.findIndex((existing) => {
      if (author.id && existing.id === author.id) return true;
      if (normalizedEmail && existing.email && existing.email.trim().toLowerCase() === normalizedEmail) return true;
      if (normalizedName) {
        const existingName = `${existing.firstName || ""} ${existing.surname || ""}`.trim().toLowerCase();
        if (existingName === normalizedName) return true;
      }
      return false;
    });

    const updatedAuthor: Author = {
      ...author,
      id: author.id || `auth-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: author.title?.trim() || undefined,
      firstName: author.firstName?.trim() || "",
      middleName: author.middleName?.trim() || undefined,
      surname: author.surname?.trim() || "",
      email: author.email?.trim() || "",
      orcid: author.orcid?.trim() || undefined,
      affiliation: author.affiliation?.trim() || undefined,
      isCorresponding: Boolean(author.isCorresponding),
      creditRoles: Array.isArray(author.creditRoles) ? [...author.creditRoles] : [],
    };

    let next: Author[];
    if (existingIndex >= 0) {
      next = [...current];
      next[existingIndex] = { ...next[existingIndex], ...updatedAuthor };
    } else {
      next = [updatedAuthor, ...current];
    }

    localStorage.setItem(getUserAuthorStorageKey(userEmail), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(AUTHORS_CHANGED_EVENT, { detail: { userEmail } }));

    // Synchronize to backend if accessible
    authedJsonFetch("/api/user/saved-authors", "POST", { author: updatedAuthor }).catch(() => {});

    return next;
  } catch {
    return getLocalSavedAuthors(userEmail);
  }
}

/**
 * Saves multiple authors from a manuscript into the specific user's saved author pool.
 */
export function saveAuthorsListForUser(authors: Author[], userEmail?: string | null): Author[] {
  if (typeof window === "undefined" || !Array.isArray(authors) || authors.length === 0) {
    return getLocalSavedAuthors(userEmail);
  }

  let current = getLocalSavedAuthors(userEmail);
  for (const author of authors) {
    const hasInfo = Boolean(author.firstName?.trim() || author.surname?.trim() || author.email?.trim());
    if (!hasInfo) continue;

    const normalizedEmail = (author.email || "").trim().toLowerCase();
    const normalizedName = `${author.firstName || ""} ${author.surname || ""}`.trim().toLowerCase();

    const existingIndex = current.findIndex((existing) => {
      if (author.id && existing.id === author.id) return true;
      if (normalizedEmail && existing.email && existing.email.trim().toLowerCase() === normalizedEmail) return true;
      if (normalizedName) {
        const existingName = `${existing.firstName || ""} ${existing.surname || ""}`.trim().toLowerCase();
        if (existingName === normalizedName) return true;
      }
      return false;
    });

    const clean: Author = {
      ...author,
      id: author.id || `auth-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: author.title?.trim() || undefined,
      firstName: author.firstName?.trim() || "",
      middleName: author.middleName?.trim() || undefined,
      surname: author.surname?.trim() || "",
      email: author.email?.trim() || "",
      orcid: author.orcid?.trim() || undefined,
      affiliation: author.affiliation?.trim() || undefined,
      creditRoles: Array.isArray(author.creditRoles) ? [...author.creditRoles] : [],
    };

    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...clean };
    } else {
      current.push(clean);
    }
  }

  try {
    localStorage.setItem(getUserAuthorStorageKey(userEmail), JSON.stringify(current));
    window.dispatchEvent(new CustomEvent(AUTHORS_CHANGED_EVENT, { detail: { userEmail } }));
  } catch {
    // ignore
  }

  return current;
}

/**
 * Removes an author from the user's saved authors roster.
 */
export function removeSavedAuthorForUser(authorId: string, userEmail?: string | null): Author[] {
  if (typeof window === "undefined") return [];
  try {
    const current = getLocalSavedAuthors(userEmail);
    const next = current.filter((a) => a.id !== authorId && a.email !== authorId);
    localStorage.setItem(getUserAuthorStorageKey(userEmail), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(AUTHORS_CHANGED_EVENT, { detail: { userEmail } }));

    // Notify backend
    authedFetch(`/api/user/saved-authors/${encodeURIComponent(authorId)}`, {
      method: "DELETE",
    }).catch(() => {});

    return next;
  } catch {
    return getLocalSavedAuthors(userEmail);
  }
}

/**
 * Synchronizes saved authors from the backend if available.
 */
export async function syncSavedAuthors(userEmail?: string | null): Promise<Author[]> {
  try {
    const res = await authedFetch("/api/user/saved-authors");
    if (!res.ok) return getLocalSavedAuthors(userEmail);
    const data = await res.json();
    if (Array.isArray(data?.authors) && data.authors.length > 0) {
      return saveAuthorsListForUser(data.authors, userEmail);
    }
  } catch {
    // fallback to local
  }
  return getLocalSavedAuthors(userEmail);
}
