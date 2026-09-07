import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAuditScheduleConfig,
  saveAuditScheduleConfig,
  isAuditDue,
  runVaultRetractionAudit,
  getAuditHistory,
  getRetractionAlerts,
  acknowledgeRetractionAlert,
  dismissRetractionAlert,
} from "../scheduledRetractionAudit";
import { setSessionUnlocked, lockVault } from "../../vaultContents";
import type { VaultItem } from "../../vaultContents";

describe("Scheduled Retraction Audit Service (AG-07 & Doc 43 §7.1)", () => {
  const userId = "user-audit-123";

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setSessionUnlocked(true, "audit-test-pass");
  });

  const sampleItems: VaultItem[] = [
    {
      id: "item-clean-1",
      title: "Stable Diffusion in Microscopy",
      content: "DOI: 10.1038/s41586-2024-001. Advanced imaging techniques...",
      sourceType: "file",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "item-retracted-1",
      title: "RETRACTED: Superconducting Materials at Ambient Temperature",
      content: "DOI: 10.1038/s41586-2024-002. LK-99 room temperature claims...",
      sourceType: "file",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("manages schedule configurations and checks if audit is due", () => {
    const defaultConfig = getAuditScheduleConfig(userId);
    expect(defaultConfig.enabled).toBe(true);
    expect(defaultConfig.intervalHours).toBe(24);

    // Audit is due when never run
    expect(isAuditDue(userId)).toBe(true);

    // Set last run to just now
    saveAuditScheduleConfig(userId, {
      ...defaultConfig,
      lastRunTimestamp: Date.now(),
    });
    expect(isAuditDue(userId)).toBe(false);

    // Set last run to 25 hours ago
    saveAuditScheduleConfig(userId, {
      ...defaultConfig,
      lastRunTimestamp: Date.now() - 25 * 60 * 60 * 1000,
    });
    expect(isAuditDue(userId)).toBe(true);

    // When disabled, audit is never due
    saveAuditScheduleConfig(userId, {
      ...defaultConfig,
      enabled: false,
    });
    expect(isAuditDue(userId)).toBe(false);
  });

  it("runs full audit, generates audit report and retraction alerts", async () => {
    const report = await runVaultRetractionAudit(userId, sampleItems);

    expect(report.scannedCount).toBe(2);
    expect(report.retractedCount).toBe(1);
    expect(report.flaggedItems.length).toBe(1);
    expect(report.flaggedItems[0].itemId).toBe("item-retracted-1");
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    // Verify report saved to history
    const history = getAuditHistory(userId);
    expect(history.length).toBe(1);
    expect(history[0].id).toBe(report.id);

    // Verify alert generated
    const alerts = getRetractionAlerts(userId);
    expect(alerts.length).toBe(1);
    expect(alerts[0].itemId).toBe("item-retracted-1");
    expect(alerts[0].acknowledged).toBe(false);

    // Acknowledge alert
    acknowledgeRetractionAlert(userId, alerts[0].id);
    const updatedAlerts = getRetractionAlerts(userId);
    expect(updatedAlerts[0].acknowledged).toBe(true);

    // Dismiss alert
    dismissRetractionAlert(userId, alerts[0].id);
    expect(getRetractionAlerts(userId).length).toBe(0);
  });
});
