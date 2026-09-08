/**
 * Settings View for Source Library
 *
 * Manages Google Drive & OneDrive connections, library storage selection,
 * and communicates the strict zero-server storage policy.
 */

import { useState } from "react";
import {
  type CloudDriveAccount,
  type CloudDriveProvider,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  disconnectCloudDrive,
} from "../../services/vault/cloudDriveService";

export interface SettingsViewProps {
  userId: string;
  connectedDrives: CloudDriveAccount[];
  onRefreshDrives: () => void;
  onResetVault?: () => void;
}

export default function SettingsView({
  userId,
  connectedDrives,
  onRefreshDrives,
  onResetVault,
}: SettingsViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryStorage, setLibraryStorage] = useState<CloudDriveProvider>("google_drive");
  const [confirmReset, setConfirmReset] = useState(false);

  const isGoogleConnected = connectedDrives.some((d) => d.provider === "google_drive");
  const isOneDriveConnected = connectedDrives.some((d) => d.provider === "onedrive");

  const googleAccount = connectedDrives.find((d) => d.provider === "google_drive");
  const oneDriveAccount = connectedDrives.find((d) => d.provider === "onedrive");

  async function handleConnect(provider: CloudDriveProvider) {
    setBusy(true);
    setError(null);
    try {
      if (provider === "google_drive") {
        await initiateGoogleDriveAuth(userId);
      } else {
        await initiateOneDriveAuth(userId);
      }
      onRefreshDrives();
    } catch (err: any) {
      setError(err.message || "Failed to initiate cloud connection.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect(provider: CloudDriveProvider) {
    setBusy(true);
    setError(null);
    try {
      await disconnectCloudDrive(userId, provider);
      onRefreshDrives();
    } catch (err: any) {
      setError(err.message || "Failed to disconnect account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text-primary)]">Settings</h2>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
          Manage your cloud storage connections and library preferences.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-[var(--radius-md)] text-xs leading-relaxed flex items-start gap-2"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Cloud Connections */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-4 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Connections</h3>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            Connect your cloud drives to browse and open your research sources.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Google Drive Item */}
          <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📁</span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)]">Google Drive</h4>
                  {isGoogleConnected ? (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[10px] text-[color:var(--text-muted)]">○ Not connected</span>
                  )}
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                  {googleAccount?.accountEmail || "Sync Google Docs, PDFs, & Sheets"}
                </p>
              </div>
            </div>

            {isGoogleConnected ? (
              <button
                type="button"
                onClick={() => handleDisconnect("google_drive")}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleConnect("google_drive")}
                disabled={busy}
                className="px-3.5 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-xs disabled:opacity-50"
              >
                Connect
              </button>
            )}
          </div>

          {/* OneDrive Item */}
          <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
            <div className="flex items-center gap-3">
              <span className="text-2xl">☁️</span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)]">Microsoft OneDrive</h4>
                  {isOneDriveConnected ? (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[10px] text-[color:var(--text-muted)]">○ Not connected</span>
                  )}
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                  {oneDriveAccount?.accountEmail || "Sync Office 365, Word, & OneDrive"}
                </p>
              </div>
            </div>

            {isOneDriveConnected ? (
              <button
                type="button"
                onClick={() => handleDisconnect("onedrive")}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleConnect("onedrive")}
                disabled={busy}
                className="px-3.5 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-xs disabled:opacity-50"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Library Storage Preference */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-3 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Library Storage Provider</h3>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            Designate which cloud service is your preferred default storage location.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 p-3 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] cursor-pointer">
            <input
              type="radio"
              name="libraryStorage"
              value="google_drive"
              checked={libraryStorage === "google_drive"}
              onChange={() => setLibraryStorage("google_drive")}
              className="accent-[color:var(--accent)]"
            />
            <span className="text-xs font-bold text-[color:var(--text-primary)]">Google Drive</span>
            <span className="text-[11px] text-[color:var(--text-muted)] ml-auto font-mono">
              Source Library/
            </span>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] cursor-pointer">
            <input
              type="radio"
              name="libraryStorage"
              value="onedrive"
              checked={libraryStorage === "onedrive"}
              onChange={() => setLibraryStorage("onedrive")}
              className="accent-[color:var(--accent)]"
            />
            <span className="text-xs font-bold text-[color:var(--text-primary)]">Microsoft OneDrive</span>
            <span className="text-[11px] text-[color:var(--text-muted)] ml-auto font-mono">
              Source Library/
            </span>
          </label>
        </div>
      </div>

      {/* Storage & Privacy Transparency */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <h3 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
            Storage & Privacy Architecture
          </h3>
        </div>
        <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
          Your source files remain in your connected cloud storage (Google Drive or Microsoft OneDrive). We do not maintain a separate copy of your files, upload documents to our own servers, or build a server document repository.
        </p>
      </div>

      {/* Reset Library (Quietly placed under settings with double confirmation) */}
      {onResetVault && (
        <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[color:var(--state-danger)]">Reset Library</div>
            <div className="text-[11px] text-[color:var(--text-muted)]">
              Clear your metadata and start fresh. Your cloud files are never deleted.
            </div>
          </div>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 text-xs text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-red-500/10 cursor-pointer"
            >
              Reset Library…
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetVault();
                  setConfirmReset(false);
                }}
                className="px-3 py-1.5 bg-[color:var(--state-danger)] text-white rounded-[var(--radius-md)] text-xs font-bold hover:opacity-90 cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2.5 py-1.5 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
