/**
 * Retraction Watch & Academic Integrity Monitoring Service (Doc 43 §7.1 & AG-07)
 *
 * Automatically checks Knowledge Vault items against Crossref API and retraction patterns
 * to identify retracted publications, withdrawals, and expressions of concern.
 */

import { updateVaultItemDetails, type VaultItem, type RetractionStatus } from "../vaultContents";

export interface RetractionCheckResult {
  status: RetractionStatus;
  isRetracted: boolean;
  noticeUrl?: string;
  reason?: string;
  date?: string;
}

/**
 * Extracts clean DOI from various VaultItem fields.
 */
export function extractDoiFromItem(item: VaultItem): string | null {
  if (item.canonicalReference?.doi) {
    return cleanDoi(item.canonicalReference.doi);
  }
  if (item.metadata?.doi) {
    return cleanDoi(item.metadata.doi);
  }
  if (item.externalReference) {
    const match = item.externalReference.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/i);
    if (match) return cleanDoi(match[1]);
  }
  const contentMatch = ((item.title ?? "") + " " + (item.content ?? "").slice(0, 1500)).match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/i);
  if (contentMatch) {
    return cleanDoi(contentMatch[1]);
  }
  return null;
}

function cleanDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/[\.,;:]$/, "")
    .toLowerCase();
}

/**
 * Checks a single item for retraction notices.
 */
export async function checkItemRetraction(item: VaultItem): Promise<RetractionCheckResult> {
  // 1. Check title / content heuristics first
  const lowerTitle = (item.title || "").toLowerCase();
  if (lowerTitle.includes("retraction note") || lowerTitle.startsWith("retracted:") || lowerTitle.includes("[retracted]")) {
    return {
      status: "retracted",
      isRetracted: true,
      reason: "Document title explicitly indicates a Retraction notice or retracted status.",
    };
  }

  if (lowerTitle.includes("expression of concern") || lowerTitle.startsWith("expression of concern:")) {
    return {
      status: "expression_of_concern",
      isRetracted: true,
      reason: "Document title indicates an active Expression of Concern.",
    };
  }

  const doi = extractDoiFromItem(item);
  if (!doi) {
    // Without a DOI there is nothing to look up: not checked, not "clean".
    return { status: "unknown", isRetracted: false };
  }

  // 2. Query Crossref API for updates, retractions, and Crossmark assertions
  try {
    const encodedDoi = encodeURIComponent(doi);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://api.crossref.org/works/${encodedDoi}`, {
      headers: {
        "User-Agent": "ScholarOS-IntegrityWatch/2.0 (mailto:integrity@scholar.os)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { status: "unknown", isRetracted: false };
    }

    const data = await res.json();
    const message = data.message;

    // Check Crossmark update-to relations
    const updateTo = message["update-to"] || [];
    const relation = message["relation"] || {};
    const updates = message["updates"] || [];

    // Check if the work itself is a retraction notice
    if (message.type === "retraction" || message.subtype === "retraction") {
      return {
        status: "retracted",
        isRetracted: true,
        noticeUrl: message.URL || `https://doi.org/${doi}`,
        reason: "Crossref work type is registered as Retraction.",
      };
    }

    // Check updates array for retraction events
    for (const u of [...updateTo, ...updates]) {
      const type = (u.type || u["type-label"] || "").toLowerCase();
      if (type.includes("retract") || type.includes("withdrawal")) {
        return {
          status: "retracted",
          isRetracted: true,
          noticeUrl: u.DOI ? `https://doi.org/${u.DOI}` : message.URL,
          reason: `Crossref flagged an official ${type} update.`,
          date: u.updated?.["date-time"] || u.date?.["date-time"],
        };
      }
      if (type.includes("concern")) {
        return {
          status: "expression_of_concern",
          isRetracted: true,
          noticeUrl: u.DOI ? `https://doi.org/${u.DOI}` : message.URL,
          reason: "Crossref flagged an Expression of Concern notice.",
        };
      }
    }

    return { status: "clean", isRetracted: false };
  } catch (e: any) {
    // Graceful network timeout / offline fallback
    return { status: "unknown", isRetracted: false };
  }
}

/**
 * Scans all Vault items for retractions and persists updated status in storage.
 */
export async function scanVaultRetractions(
  userId: string,
  items: VaultItem[],
  onProgress?: (scanned: number, total: number) => void
): Promise<{
  scanned: number;
  retractedCount: number;
  updatedItems: VaultItem[];
}> {
  let retractedCount = 0;
  const updatedItems = [...items];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) onProgress(i + 1, items.length);

    let check = await checkItemRetraction(item);
    // A failed lookup (offline, Crossref down) keeps the last real result.
    if (check.status === "unknown" && extractDoiFromItem(item) && item.retractionStatus && item.retractionStatus !== "unknown") {
      check = { status: item.retractionStatus, isRetracted: item.retractionStatus !== "clean", reason: item.retractionDetails?.reason, noticeUrl: item.retractionDetails?.noticeUrl };
    }
    if (check.status === "retracted" || check.status === "expression_of_concern") {
      retractedCount++;
    }

    const itemCopy: VaultItem = {
      ...item,
      retractionStatus: check.status,
      retractionDetails: {
        noticeUrl: check.noticeUrl,
        reason: check.reason,
        date: check.date,
      },
    };
    updatedItems[i] = itemCopy;

    if (item.retractionStatus !== check.status) {
      try {
        const updated = await updateVaultItemDetails(userId, item.id, {
          retractionStatus: check.status,
          retractionDetails: {
            noticeUrl: check.noticeUrl,
            reason: check.reason,
            date: check.date,
          },
        });

        if (updated) {
          updatedItems[i] = updated;
        }
      } catch (e) {
        // Local persistence fallback
      }
    }
  }

  return {
    scanned: items.length,
    retractedCount,
    updatedItems,
  };
}
