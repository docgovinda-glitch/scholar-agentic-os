/**
 * Settings View for Source Library / Knowledge Vault
 *
 * Comprehensive settings review:
 * 1. Manages Google Drive & OneDrive connections with verification and setup help.
 * 2. Vault Security & Storage Mode (Universal Cloud Sync vs Device-Local AES-GCM-256).
 * 3. Citation & Research Preferences (APA 7th, MLA, Chicago, Harvard, IEEE, Retraction Sentinel).
 * 4. Library Storage Provider preference (Google Drive vs Microsoft OneDrive).
 * 5. Communicates the strict zero-server storage policy and privacy architecture.
 */

import { useState, useEffect } from "react";
import {
  type CloudDriveAccount,
  type CloudDriveProvider,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  disconnectCloudDrive,
  fetchDriveFiles,
} from "../../services/vault/cloudDriveService";
import {
  getVaultStorageMode,
  updateVaultStorageMode,
} from "../../services/userVault";

export interface SettingsViewProps {
  userId: string;
  connectedDrives: CloudDriveAccount[];
  onRefreshDrives: () => void;
  onResetVault?: () => void;
}

export type CitationFormat = "apa7" | "mla9" | "chicago17" | "harvard" | "ieee";

export default function SettingsView({
  userId,
  connectedDrives,
  onRefreshDrives,
  onResetVault,
}: SettingsViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [libraryStorage, setLibraryStorage] = useState<CloudDriveProvider>("google_drive");
  const [confirmReset, setConfirmReset] = useState(false);

  // Setup guide disclosure
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Vault storage mode
  const [storageMode, setStorageMode] = useState<"synced" | "local">("synced");
  const [modeLoading, setModeLoading] = useState(false);

  // Citation & research preferences
  const [defaultCitationStyle, setDefaultCitationStyle] = useState<CitationFormat>(() => {
    try {
      return (localStorage.getItem(`scholar_vault_citation_style_${userId}`) as CitationFormat) || "apa7";
    } catch {
      return "apa7";
    }
  });

  const [retractionSentinel, setRetractionSentinel] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem(`scholar_vault_retraction_sentinel_${userId}`);
      return val !== null ? val === "true" : true;
    } catch {
      return true;
    }
  });

  const [duplicateSensitivity, setDuplicateSensitivity] = useState<"standard" | "strict">(() => {
    try {
      return (localStorage.getItem(`scholar_vault_duplicate_sensitivity_${userId}`) as "standard" | "strict") || "standard";
    } catch {
      return "standard";
    }
  });

  // Load active storage mode on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mode = await getVaultStorageMode();
        if (mounted) setStorageMode(mode);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isGoogleConnected = connectedDrives.some((d) => d.provider === "google_drive");
  const isOneDriveConnected = connectedDrives.some((d) => d.provider === "onedrive");

  const googleAccount = connectedDrives.find((d) => d.provider === "google_drive");
  const oneDriveAccount = connectedDrives.find((d) => d.provider === "onedrive");

  async function handleConnect(provider: CloudDriveProvider) {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
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
    setSuccessMsg(null);
    try {
      await disconnectCloudDrive(userId, provider);
      onRefreshDrives();
      setSuccessMsg(`Successfully disconnected ${provider === "google_drive" ? "Google Drive" : "OneDrive"}.`);
    } catch (err: any) {
      setError(err.message || "Failed to disconnect account.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyConnection(provider: CloudDriveProvider) {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const files = await fetchDriveFiles(provider, userId);
      const providerName = provider === "google_drive" ? "Google Drive" : "Microsoft OneDrive";
      setSuccessMsg(`✓ ${providerName} connection verified. Found ${files.length} active documents.`);
    } catch (err: any) {
      setError(`Could not verify ${provider} connection: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStorageMode(targetMode: "synced" | "local") {
    setModeLoading(true);
    setError(null);
    try {
      const res = await updateVaultStorageMode(targetMode);
      if (res.success) {
        setStorageMode(targetMode);
        setSuccessMsg(
          targetMode === "synced"
            ? "✓ Upgraded to Universal Cloud Sync (accessible across devices)."
            : "✓ Switched to Local Device Encrypted mode (stored strictly in this browser)."
        );
      } else {
        setError(res.error || "Failed to update storage mode.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to switch storage mode.");
    } finally {
      setModeLoading(false);
    }
  }

  function handleSaveCitationStyle(val: CitationFormat) {
    setDefaultCitationStyle(val);
    try {
      localStorage.setItem(`scholar_vault_citation_style_${userId}`, val);
      setSuccessMsg(`Citation style set to ${val.toUpperCase()}.`);
    } catch {}
  }

  function handleToggleRetractionSentinel(enabled: boolean) {
    setRetractionSentinel(enabled);
    try {
      localStorage.setItem(`scholar_vault_retraction_sentinel_${userId}`, String(enabled));
    } catch {}
  }

  function handleToggleDuplicateSensitivity(val: "standard" | "strict") {
    setDuplicateSensitivity(val);
    try {
      localStorage.setItem(`scholar_vault_duplicate_sensitivity_${userId}`, val);
    } catch {}
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      <div>
        <h2 className="text-lg font-bold text-[color:var(--text-primary)]">Settings</h2>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
          Manage your cloud storage connections, vault security mode, and citation preferences.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-[var(--radius-md)] text-xs leading-relaxed flex items-start gap-2 animate-in fade-in"
        >
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-[var(--radius-md)] text-xs leading-relaxed flex items-start gap-2 animate-in fade-in"
        >
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* SECTION 1: CLOUD CONNECTIONS */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Cloud Storage Connections</h3>
            <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
              Connect Google Drive and OneDrive to browse, fetch, and cite your research sources with zero document copies.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSetupGuide(!showSetupGuide)}
            className="text-xs text-[color:var(--accent)] hover:underline font-semibold cursor-pointer shrink-0"
          >
            {showSetupGuide ? "Hide Setup Guide" : "Setup Guide & Help ↗"}
          </button>
        </div>

        {/* Collapsible Easy Setup Guide */}
        {showSetupGuide && (
          <div className="p-4 bg-[color:var(--surface-inset)] rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] text-xs flex flex-col gap-3 animate-in fade-in">
            <h4 className="font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
              <span>💡</span>
              <span>Quick Setup & How It Works</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-[color:var(--text-secondary)]">
              <div className="p-2.5 bg-[color:var(--surface-raised)] rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
                <span className="font-bold text-[color:var(--text-primary)] block mb-1">📁 Google Drive Setup</span>
                <p>Click "Connect" to authenticate with Google. Approves read-only access to view and index documents. Your source files stay strictly in your Drive.</p>
              </div>
              <div className="p-2.5 bg-[color:var(--surface-raised)] rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
                <span className="font-bold text-[color:var(--text-primary)] block mb-1">☁️ OneDrive Setup</span>
                <p>Click "Connect" to log in with your Microsoft account (personal or institution). Approves Files.Read to index Word docs, PDFs, and notes.</p>
              </div>
            </div>
            <p className="text-[11px] text-[color:var(--text-muted)] leading-relaxed">
              <strong>Direct Link Alternative:</strong> Even if you don't connect an account, you can always paste any public or shareable link directly in the Add Source modal.
            </p>
          </div>
        )}

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
                      Connected &amp; Synced
                    </span>
                  ) : (
                    <span className="text-[10px] text-[color:var(--text-muted)]">○ Not connected</span>
                  )}
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                  {googleAccount?.accountEmail || "Sync Google Docs, PDFs, & Sheets with zero file copies"}
                </p>
              </div>
            </div>

            {isGoogleConnected ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleVerifyConnection("google_drive")}
                  disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => window.open("https://drive.google.com", "_blank")}
                  className="px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Open Drive ↗
                </button>
                <button
                  type="button"
                  onClick={() => handleDisconnect("google_drive")}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-semibold text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleConnect("google_drive")}
                disabled={busy}
                className="px-3.5 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-xs disabled:opacity-50 transition-colors"
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
                      Connected &amp; Synced
                    </span>
                  ) : (
                    <span className="text-[10px] text-[color:var(--text-muted)]">○ Not connected</span>
                  )}
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                  {oneDriveAccount?.accountEmail || "Sync Office 365, Word documents, & OneDrive"}
                </p>
              </div>
            </div>

            {isOneDriveConnected ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleVerifyConnection("onedrive")}
                  disabled={busy}
                  className="px-2.5 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => window.open("https://onedrive.live.com", "_blank")}
                  className="px-3 py-1.5 text-xs font-semibold text-[color:var(--accent)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Open OneDrive ↗
                </button>
                <button
                  type="button"
                  onClick={() => handleDisconnect("onedrive")}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-semibold text-[color:var(--state-danger)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleConnect("onedrive")}
                disabled={busy}
                className="px-3.5 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer shadow-xs disabled:opacity-50 transition-colors"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: VAULT SECURITY & STORAGE MODE */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-4 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Vault Storage &amp; Security Mode</h3>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            Choose whether your citations and references sync across devices or stay strictly on this browser.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Universal Cloud Sync Mode */}
          <div
            className={`p-4 rounded-[var(--radius-lg)] border transition-all flex flex-col justify-between gap-3 ${
              storageMode === "synced"
                ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/20"
                : "border-[color:var(--border-default)] bg-[color:var(--surface-inset)] opacity-80"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[color:var(--text-primary)]">Universal Cloud Sync</span>
                {storageMode === "synced" && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                Metadata is synced to your Scholar account via Supabase. Available across all your computers, browsers, and mobile devices.
              </p>
            </div>
            {storageMode !== "synced" && (
              <button
                type="button"
                onClick={() => handleToggleStorageMode("synced")}
                disabled={modeLoading}
                aria-busy={modeLoading}
                className="w-full py-1.5 text-xs font-semibold text-[color:var(--accent)] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {modeLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span>Switching…</span>
                  </>
                ) : (
                  "Enable Cloud Sync"
                )}
              </button>
            )}
          </div>

          {/* Device-Local Encrypted Mode */}
          <div
            className={`p-4 rounded-[var(--radius-lg)] border transition-all flex flex-col justify-between gap-3 ${
              storageMode === "local"
                ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/20"
                : "border-[color:var(--border-default)] bg-[color:var(--surface-inset)] opacity-80"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[color:var(--text-primary)]">Local Device Encrypted</span>
                {storageMode === "local" && (
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                Stored exclusively in this device's IndexedDB, encrypted with AES-GCM-256 and passphrase. Zero metadata leaves this machine.
              </p>
            </div>
            {storageMode !== "local" && (
              <button
                type="button"
                onClick={() => handleToggleStorageMode("local")}
                disabled={modeLoading}
                aria-busy={modeLoading}
                className="w-full py-1.5 text-xs font-semibold text-[color:var(--text-secondary)] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] hover:bg-[color:var(--surface-hover)] cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {modeLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span>Switching…</span>
                  </>
                ) : (
                  "Switch to Local Mode"
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3: CITATION & RESEARCH PREFERENCES */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-4 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Citation &amp; Research Preferences</h3>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            Configure default citation style formats, integrity alerts, and duplicate detection.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Default Citation Format Selector */}
          <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
            <div>
              <label htmlFor="citation-style-select" className="text-xs font-bold text-[color:var(--text-primary)] block">
                Default Citation Style
              </label>
              <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                Automatically formats newly saved sources in this style.
              </p>
            </div>
            <select
              id="citation-style-select"
              value={defaultCitationStyle}
              onChange={(e) => handleSaveCitationStyle(e.target.value as CitationFormat)}
              className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
            >
              <option value="apa7">APA 7th Edition (Standard)</option>
              <option value="mla9">MLA 9th Edition</option>
              <option value="chicago17">Chicago 17th (Author-Date)</option>
              <option value="harvard">Harvard</option>
              <option value="ieee">IEEE</option>
            </select>
          </div>

          {/* Academic Integrity Retraction Sentinel */}
          <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
            <div>
              <div className="text-xs font-bold text-[color:var(--text-primary)]">Academic Integrity Sentinel</div>
              <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                Automatically check CrossRef and OpenAlex for retracted papers or expressions of concern.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={retractionSentinel}
                onChange={(e) => handleToggleRetractionSentinel(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[color:var(--accent)]" />
            </label>
          </div>

          {/* Duplicate Detection Sensitivity */}
          <div className="flex items-center justify-between p-3.5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]">
            <div>
              <label htmlFor="duplicate-sensitivity-select" className="text-xs font-bold text-[color:var(--text-primary)] block">
                Duplicate Detection Sensitivity
              </label>
              <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                Warns if a newly added paper is already present in your Knowledge Vault.
              </p>
            </div>
            <select
              id="duplicate-sensitivity-select"
              value={duplicateSensitivity}
              onChange={(e) => handleToggleDuplicateSensitivity(e.target.value as "standard" | "strict")}
              className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
            >
              <option value="standard">Standard (Title &amp; DOI)</option>
              <option value="strict">Strict (Title, DOI, Authors &amp; Year)</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 4: LIBRARY STORAGE PREFERENCE */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-3 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Canonical Storage Designation</h3>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            Designate which cloud service contains your primary research workspace folder.
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

      {/* SECTION 5: STORAGE & PRIVACY TRANSPARENCY */}
      <div className="p-5 rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <h3 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
            Storage &amp; Privacy Architecture
          </h3>
        </div>
        <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
          Your source files remain in your connected cloud storage. Source Library does not maintain a separate copy of your files.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Source Library Stores:
            </span>
            <ul className="text-[11px] text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
              <li>Lightweight metadata</li>
              <li>Project assignments</li>
              <li>Tags</li>
              <li>Writing notes</li>
              <li>Citation data</li>
              <li>Cloud references</li>
              <li>Integrity-check metadata</li>
            </ul>
          </div>

          <div className="p-3 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-[color:var(--state-danger)] uppercase tracking-wide">
              Source Library Does Not Store:
            </span>
            <ul className="text-[11px] text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
              <li>Document binaries</li>
              <li>Permanent document copies</li>
              <li>Permanent extracted full text</li>
              <li>Permanent OCR output</li>
              <li>Permanent transcription output</li>
            </ul>
          </div>
        </div>
      </div>

      {/* SECTION 6: RESET LIBRARY */}
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
