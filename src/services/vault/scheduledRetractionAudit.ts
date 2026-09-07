/**
 * Automated Scheduled Background Retraction Audit Service (Doc 43 §7.1 / AG-07)
 *
 * Runs scheduled integrity audits across Knowledge Vault holdings to detect newly
 * published retraction notices, errata, and expressions of concern.
 */

import { scanVaultRetractions, type RetractionCheckResult } from "./retractionService";
import type { VaultItem } from "../vaultContents";

export interface AuditScheduleConfig {
  enabled: boolean;
  intervalHours: number; // e.g. 24 for daily
  lastRunTimestamp?: number;
  autoQuarantine: boolean;
}

export interface AuditReport {
  id: string;
  userId: string;
  timestamp: string;
  durationMs: number;
  scannedCount: number;
  retractedCount: number;
  expressionOfConcernCount: number;
  flaggedItems: {
    itemId: string;
    itemTitle: string;
    doi?: string;
    status: string;
    reason?: string;
  }[];
}

export interface RetractionAlert {
  id: string;
  userId: string;
  itemId: string;
  itemTitle: string;
  status: "retracted" | "expression_of_concern";
  reason: string;
  discoveredAt: string;
  acknowledged: boolean;
}

const SCHEDULE_CONFIG_KEY = "scholar_vault_retraction_audit_config";
const AUDIT_HISTORY_KEY = "scholar_vault_retraction_audit_history";
const RETRACTION_ALERTS_KEY = "scholar_vault_retraction_alerts";

/**
 * Loads current audit configuration for a user.
 */
export function getAuditScheduleConfig(userId: string): AuditScheduleConfig {
  try {
    const raw = localStorage.getItem(`${SCHEDULE_CONFIG_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignore storage error
  }

  return {
    enabled: true,
    intervalHours: 24,
    autoQuarantine: false,
  };
}

/**
 * Saves audit configuration for a user.
 */
export function saveAuditScheduleConfig(userId: string, config: AuditScheduleConfig): void {
  try {
    localStorage.setItem(`${SCHEDULE_CONFIG_KEY}_${userId}`, JSON.stringify(config));
  } catch (e) {
    // Ignore storage error
  }
}

/**
 * Checks if a scheduled audit is due.
 */
export function isAuditDue(userId: string): boolean {
  const config = getAuditScheduleConfig(userId);
  if (!config.enabled) return false;
  if (!config.lastRunTimestamp) return true;

  const now = Date.now();
  const elapsedHours = (now - config.lastRunTimestamp) / (1000 * 60 * 60);
  return elapsedHours >= config.intervalHours;
}

/**
 * Runs a complete audit on Vault holdings, persists the report, and triggers alerts.
 */
export async function runVaultRetractionAudit(
  userId: string,
  items: VaultItem[],
  onProgress?: (scanned: number, total: number) => void
): Promise<AuditReport> {
  const startTime = Date.now();
  const scanResult = await scanVaultRetractions(userId, items, onProgress);
  const durationMs = Date.now() - startTime;

  const flaggedItems = scanResult.updatedItems
    .filter((it) => it.retractionStatus === "retracted" || it.retractionStatus === "expression_of_concern")
    .map((it) => ({
      itemId: it.id,
      itemTitle: it.title,
      doi: it.canonicalReference?.doi || it.metadata?.doi,
      status: it.retractionStatus || "retracted",
      reason: it.retractionDetails?.reason || "Academic integrity flag detected.",
    }));

  const retractedCount = flaggedItems.filter((it) => it.status === "retracted").length;
  const expressionOfConcernCount = flaggedItems.filter((it) => it.status === "expression_of_concern").length;

  const report: AuditReport = {
    id: `audit-${Date.now()}`,
    userId,
    timestamp: new Date().toISOString(),
    durationMs,
    scannedCount: scanResult.scanned,
    retractedCount,
    expressionOfConcernCount,
    flaggedItems,
  };

  // 1. Save Report in History
  saveAuditReport(userId, report);

  // 2. Generate Alerts for newly flagged items
  generateAlertsFromAudit(userId, flaggedItems);

  // 3. Update Last Run timestamp in config
  const config = getAuditScheduleConfig(userId);
  config.lastRunTimestamp = Date.now();
  saveAuditScheduleConfig(userId, config);

  return report;
}

/**
 * Appends an audit report to historical logs.
 */
function saveAuditReport(userId: string, report: AuditReport): void {
  try {
    const history = getAuditHistory(userId);
    history.unshift(report);
    // Keep last 50 audit runs
    const capped = history.slice(0, 50);
    localStorage.setItem(`${AUDIT_HISTORY_KEY}_${userId}`, JSON.stringify(capped));
  } catch (e) {
    // Ignore storage error
  }
}

/**
 * Retrieves audit history for a user.
 */
export function getAuditHistory(userId: string): AuditReport[] {
  try {
    const raw = localStorage.getItem(`${AUDIT_HISTORY_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignore storage error
  }
  return [];
}

/**
 * Generates unacknowledged alerts for newly discovered retracted items.
 */
function generateAlertsFromAudit(
  userId: string,
  flaggedItems: AuditReport["flaggedItems"]
): void {
  try {
    const existingAlerts = getRetractionAlerts(userId);
    const newAlerts: RetractionAlert[] = [];

    for (const item of flaggedItems) {
      const alreadyAlerted = existingAlerts.some((a) => a.itemId === item.itemId);
      if (!alreadyAlerted) {
        newAlerts.push({
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId,
          itemId: item.itemId,
          itemTitle: item.itemTitle,
          status: item.status as "retracted" | "expression_of_concern",
          reason: item.reason || "Publication has been officially retracted.",
          discoveredAt: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }

    if (newAlerts.length > 0) {
      const merged = [...newAlerts, ...existingAlerts];
      localStorage.setItem(`${RETRACTION_ALERTS_KEY}_${userId}`, JSON.stringify(merged));
    }
  } catch (e) {
    // Ignore storage error
  }
}

/**
 * Retrieves retraction alerts for a user.
 */
export function getRetractionAlerts(userId: string): RetractionAlert[] {
  try {
    const raw = localStorage.getItem(`${RETRACTION_ALERTS_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignore storage error
  }
  return [];
}

/**
 * Marks a specific alert as acknowledged.
 */
export function acknowledgeRetractionAlert(userId: string, alertId: string): void {
  try {
    const alerts = getRetractionAlerts(userId);
    const updated = alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a));
    localStorage.setItem(`${RETRACTION_ALERTS_KEY}_${userId}`, JSON.stringify(updated));
  } catch (e) {
    // Ignore storage error
  }
}

/**
 * Dismisses or deletes an alert.
 */
export function dismissRetractionAlert(userId: string, alertId: string): void {
  try {
    const alerts = getRetractionAlerts(userId);
    const filtered = alerts.filter((a) => a.id !== alertId);
    localStorage.setItem(`${RETRACTION_ALERTS_KEY}_${userId}`, JSON.stringify(filtered));
  } catch (e) {
    // Ignore storage error
  }
}
