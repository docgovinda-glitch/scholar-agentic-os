/**
 * Add Source Modal — Streamlined 1-Step Fast Intake for Knowledge Vault.
 *
 * Fast & Direct:
 * 1. Smart Link / DOI / Title intake, OR 1-click Fetch from Google Drive / OneDrive.
 * 2. Instant auto-fetch, metadata resolution, and citation generation.
 * 3. 1-click "Save Source" to save directly to Knowledge Vault.
 *
 * User files stay in their cloud storage or web source — zero file copies.
 */

import { useState, useEffect, useMemo } from "react";
import type { VaultItem } from "../../services/vaultContents";
import type { CloudStorageProvider, SourceType } from "../../services/vault/sourceTypes";
import { sourceToVaultItemPayload } from "../../services/vault/sourceTypes";
import { addVaultItem } from "../../services/vaultContents";
import { listProjects } from "../api";
import {
  checkForDuplicates,
  normalizeDoi,
  type DuplicateCheckResult,
} from "../../services/vault/duplicateDetection";
import {
  resolveDoiMetadata,
  resolveUrlMetadata,
  generateAPA7Citation,
  generateKeyPointsAndNotes,
} from "../../services/vault/metadataService";
import {
  getConnectedCloudDrives,
  fetchDriveFiles,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  connectCloudDrive,
  cleanFileNameForTitle,
  parseCloudShareUrl,
  inferMetadataFromCloudFile,
  getDriveFileWebUrl,
  type CloudDriveAccount,
  type DriveFileItem,
  type CloudDriveProvider,
} from "../../services/vault/cloudDriveService";

export interface AddSourceModalProps {
  userId: string;
  existingItems: VaultItem[];
  existingProjects?: string[];
  connectedDrives?: CloudDriveAccount[];
  onClose: () => void;
  onSourceSaved: (savedItem: VaultItem) => void;
}

type IntakeSourceMode = "smart" | "google_drive" | "onedrive";
type IntakeType = "url" | "doi" | "bibtex" | "cloud_drive" | "onedrive" | "manual";

export default function AddSourceModal({
  userId,
  existingItems,
  existingProjects = [],
  connectedDrives: initialDrives,
  onClose,
  onSourceSaved,
}: AddSourceModalProps) {
  // Source intake mode tab
  const [sourceMode, setSourceMode] = useState<IntakeSourceMode>("smart");

  // Smart intake input
  const [smartInput, setSmartInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cloud Drive state
  const [cloudDrives, setCloudDrives] = useState<CloudDriveAccount[]>(initialDrives || []);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [driveFilter, setDriveFilter] = useState("");
  const [driveLoading, setDriveLoading] = useState(false);
  const [directCloudLink, setDirectCloudLink] = useState("");

  // Core metadata fields
  const [title, setTitle] = useState("");
  const [authorsText, setAuthorsText] = useState("");
  const [year, setYear] = useState("");
  const [journal, setJournal] = useState("");
  const [publisher, setPublisher] = useState("");
  const [doi, setDoi] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("paper");

  // Key points & project assignment
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [keyPointInput, setKeyPointInput] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [projectInput, setProjectInput] = useState("");
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [ongoingProjects, setOngoingProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [oneDriveEmailInput, setOneDriveEmailInput] = useState("");

  // Optional collapsible details
  const [showExtras, setShowExtras] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [whySaved, setWhySaved] = useState("");
  const [keyQuote, setKeyQuote] = useState("");
  const [cloudReference, setCloudReference] = useState<{
    provider: CloudStorageProvider;
    fileId: string;
    fileName: string;
    webUrl?: string;
  } | undefined>(undefined);

  // Duplicate warning
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);
  const [bypassDuplicate, setBypassDuplicate] = useState(false);

  // Check connection status
  const isGoogleConnected = cloudDrives.some((d) => d.provider === "google_drive");
  const isOneDriveConnected = cloudDrives.some((d) => d.provider === "onedrive");
  const googleAccount = cloudDrives.find((d) => d.provider === "google_drive");
  const oneDriveAccount = cloudDrives.find((d) => d.provider === "onedrive");

  // Load connected drives on mount if not provided
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const drives = await getConnectedCloudDrives(userId);
        if (mounted) setCloudDrives(drives);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // Load user's ongoing projects to populate the Project Selector
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await listProjects();
        if (mounted && res) {
          const list = (res as any).items || (res as any).projects || [];
          const mapped = list
            .map((p: any) => ({
              id: p.projectId || p.id || p.title,
              title:
                p.title ||
                p.answers?.working_title ||
                p.answers?.title ||
                p.answers?.research_question ||
                p.name ||
                (p.projectId ? `Project ${p.projectId.slice(0, 6)}` : undefined),
            }))
            .filter((p: any) => Boolean(p.title));
          setOngoingProjects(mapped);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Combined list of all available projects (from workspace projects + existing vault collections)
  const allAvailableProjects = useMemo(() => {
    const set = new Set<string>();
    (existingProjects || []).forEach((p) => set.add(p));
    ongoingProjects.forEach((p) => set.add(p.title));
    return Array.from(set).filter(Boolean);
  }, [existingProjects, ongoingProjects]);

  // Load files when cloud drive mode is selected
  useEffect(() => {
    if (sourceMode === "google_drive" && isGoogleConnected) {
      loadFilesForProvider("google_drive");
    } else if (sourceMode === "onedrive" && isOneDriveConnected) {
      loadFilesForProvider("onedrive");
    }
  }, [sourceMode, isGoogleConnected, isOneDriveConnected]);

  async function loadFilesForProvider(provider: CloudDriveProvider) {
    setDriveLoading(true);
    setError(null);
    try {
      const files = await fetchDriveFiles(provider, userId);
      setDriveFiles(files);
    } catch (err: any) {
      console.warn("Error fetching drive files:", err);
    } finally {
      setDriveLoading(false);
    }
  }

  // Detect input type for smart input
  function detectType(val: string): IntakeType {
    const trimmed = val.trim();
    if (!trimmed) return "manual";
    if (trimmed.startsWith("@") && (trimmed.includes("{") || trimmed.includes("="))) {
      return "bibtex";
    }
    const cleanedDoi = normalizeDoi(trimmed);
    if (cleanedDoi && /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(cleanedDoi)) {
      return "doi";
    }
    if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
      return "cloud_drive";
    }
    if (
      trimmed.includes("onedrive.live.com") ||
      trimmed.includes("sharepoint.com") ||
      trimmed.includes("1drv.ms") ||
      trimmed.includes("office.com")
    ) {
      return "onedrive";
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return "url";
    }
    return "manual";
  }

  // Parse BibTeX snippet
  function parseBibtex(raw: string) {
    const titleMatch = raw.match(/title\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const authorMatch = raw.match(/author\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const yearMatch = raw.match(/year\s*=\s*[\{"]?(\d{4})[\}"]?/i);
    const journalMatch = raw.match(/(?:journal|booktitle|publisher)\s*=\s*[\{"]([^"\}]+)[\}"]/i);
    const doiMatch = raw.match(/doi\s*=\s*[\{"]([^"\}]+)[\}"]/i);

    const parsedTitle = titleMatch?.[1]?.trim() || "";
    const parsedAuthors = authorMatch?.[1]?.trim() || "";
    const parsedYear = yearMatch?.[1] || "";
    const parsedJournal = journalMatch?.[1]?.trim() || "";
    const parsedDoi = doiMatch?.[1]?.trim() || "";

    if (parsedTitle) setTitle(parsedTitle);
    if (parsedAuthors) setAuthorsText(parsedAuthors);
    if (parsedYear) setYear(parsedYear);
    if (parsedJournal) {
      setJournal(parsedJournal);
      setPublisher(parsedJournal);
    }
    if (parsedDoi) setDoi(parsedDoi);
    setSourceType("paper");
    setFetchStatus("BibTeX reference parsed");

    const takeaways = generateKeyPointsAndNotes({
      title: parsedTitle,
      authors: parsedAuthors.split(/[,;&]|\band\b/i).map((a) => a.trim()).filter(Boolean),
      year: parsedYear,
      journal: parsedJournal,
    });
    applyTakeaways(takeaways);
  }

  // Helper to apply auto-extracted key points and notes
  function applyTakeaways(takeaways: {
    keyPoints?: string[];
    suggestedTags?: string[];
    whySaved?: string;
    keyQuote?: string;
  }) {
    if (takeaways.keyPoints && takeaways.keyPoints.length > 0) {
      setKeyPoints(takeaways.keyPoints);
    }
    if (takeaways.suggestedTags && takeaways.suggestedTags.length > 0) {
      setTags((prev) => Array.from(new Set([...prev, ...(takeaways.suggestedTags || [])])));
    }
    if (takeaways.whySaved && !whySaved.trim()) {
      setWhySaved(takeaways.whySaved);
    }
    if (takeaways.keyQuote && !keyQuote.trim()) {
      setKeyQuote(takeaways.keyQuote);
    }
  }

  // Select file from cloud drive list
  function handleSelectDriveFile(
    file: DriveFileItem,
    provider: CloudStorageProvider,
    openInNewTab: boolean = false
  ) {
    const activeAccount = provider === "google_drive" ? googleAccount : oneDriveAccount;
    const inferred = inferMetadataFromCloudFile(file, provider, {
      accountEmail: activeAccount?.accountEmail,
      accountName: activeAccount?.accountName,
    });

    setTitle(inferred.title);
    setAuthorsText(inferred.authors.join(", "));
    setYear(inferred.year);
    setJournal(inferred.journal || "");
    setPublisher(inferred.publisher || "");
    setWebUrl(inferred.webUrl);
    setSourceType(inferred.sourceType);
    setCloudReference({
      provider,
      fileId: file.id,
      fileName: file.name,
      webUrl: inferred.webUrl,
    });

    const provName = provider === "google_drive" ? "Google Drive" : "OneDrive";
    setFetchStatus(`✓ Selected from ${provName}: ${file.name}`);
    setError(null);

    applyTakeaways({
      keyPoints: inferred.keyPoints,
      suggestedTags: inferred.suggestedTags,
      whySaved: inferred.whySaved,
      keyQuote: inferred.keyQuote,
    });

    // Duplicate check
    const dup = checkForDuplicates(
      { title: inferred.title, authors: inferred.authors, year: inferred.year },
      existingItems
    );
    if (dup.isDuplicate) setDuplicateWarning(dup);

    // Open directly in Google Drive / OneDrive if requested
    if (openInNewTab && inferred.webUrl && typeof window !== "undefined") {
      window.open(inferred.webUrl, "_blank", "noopener,noreferrer");
    }
  }

  // Direct cloud link fetch
  function handleDirectCloudLink(provider: CloudStorageProvider) {
    const raw = directCloudLink.trim();
    if (!raw) return;

    const parsed = parseCloudShareUrl(raw);
    const providerName = provider === "google_drive" ? "Google Drive" : "OneDrive";
    const activeAccount = provider === "google_drive" ? googleAccount : oneDriveAccount;

    if (parsed) {
      const dummyFile: DriveFileItem = {
        id: parsed.fileId,
        name: parsed.fileName,
        mimeType: parsed.mimeType || "application/pdf",
        webViewLink: parsed.webUrl,
      };
      const inferred = inferMetadataFromCloudFile(dummyFile, provider, {
        accountEmail: activeAccount?.accountEmail,
        accountName: activeAccount?.accountName,
      });

      setTitle(inferred.title);
      setAuthorsText(inferred.authors.join(", "));
      setYear(inferred.year);
      setJournal(inferred.journal || "");
      setPublisher(inferred.publisher || "");
      setWebUrl(inferred.webUrl);
      setCloudReference({
        provider: parsed.provider,
        fileId: parsed.fileId,
        fileName: parsed.fileName,
        webUrl: parsed.webUrl,
      });
      setSourceType(inferred.sourceType);
      setFetchStatus(`✓ Linked to ${providerName} file`);
      setError(null);
      setDirectCloudLink("");

      applyTakeaways({
        keyPoints: inferred.keyPoints,
        suggestedTags: inferred.suggestedTags,
        whySaved: inferred.whySaved,
        keyQuote: inferred.keyQuote,
      });
    } else {
      // Fallback
      const dummyFile: DriveFileItem = {
        id: `cloud_${Date.now()}`,
        name: `${providerName} Document.pdf`,
        mimeType: "application/pdf",
        webViewLink: raw,
      };
      const inferred = inferMetadataFromCloudFile(dummyFile, provider, {
        accountEmail: activeAccount?.accountEmail,
        accountName: activeAccount?.accountName,
      });

      setTitle(inferred.title);
      setAuthorsText(inferred.authors.join(", "));
      setYear(inferred.year);
      setJournal(inferred.journal || "");
      setPublisher(inferred.publisher || "");
      setWebUrl(inferred.webUrl);
      setCloudReference({
        provider,
        fileId: dummyFile.id,
        fileName: dummyFile.name,
        webUrl: raw,
      });
      setSourceType(inferred.sourceType);
      setFetchStatus(`✓ Linked to ${providerName}`);
      setError(null);
      setDirectCloudLink("");

      applyTakeaways({
        keyPoints: inferred.keyPoints,
        suggestedTags: inferred.suggestedTags,
        whySaved: inferred.whySaved,
        keyQuote: inferred.keyQuote,
      });
    }
  }

  // Initiate OAuth connect
  async function handleConnectDrive(provider: CloudDriveProvider) {
    setBusy(true);
    setError(null);
    try {
      const res =
        provider === "google_drive"
          ? await initiateGoogleDriveAuth(userId)
          : await initiateOneDriveAuth(userId);

      if (res && (res as any).success === false) {
        throw new Error((res as any).error || "Provider connection failed");
      }

      const drives = await getConnectedCloudDrives(userId);
      setCloudDrives(drives);
    } catch (err: any) {
      const msg = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
      if (
        msg.includes("provider is not enabled") ||
        msg.includes("Unsupported provider") ||
        msg.includes("validation_failed")
      ) {
        setError(
          "Microsoft Azure OAuth is not enabled in your authentication settings. You can paste any OneDrive or SharePoint file link below to attach and cite documents directly."
        );
      } else {
        setError(
          err.message ||
            `Unable to connect ${provider === "google_drive" ? "Google Drive" : "OneDrive"}. You can also paste a file link directly below.`
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // Connect OneDrive workspace with email
  async function handleConnectOneDriveWithEmail() {
    const email = oneDriveEmailInput.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await connectCloudDrive(userId, "onedrive", { email, name: email.split("@")[0] });
      const drives = await getConnectedCloudDrives(userId);
      setCloudDrives(drives);
      setFetchStatus("✓ Connected to OneDrive workspace");
      setOneDriveEmailInput("");
    } catch (err: any) {
      setError(err.message || "Failed to connect OneDrive account");
    } finally {
      setBusy(false);
    }
  }

  // Resolve metadata from smart input
  async function handleSmartFetch(queryOverride?: string) {
    const raw = (queryOverride !== undefined ? queryOverride : smartInput).trim();
    if (!raw) return;

    const kind = detectType(raw);
    setError(null);
    setFetchStatus(null);
    setBusy(true);

    try {
      if (kind === "doi") {
        setFetchStatus("Resolving DOI via CrossRef / OpenAlex / DataCite…");
        const cleanDoi = normalizeDoi(raw) || raw;
        const res = await resolveDoiMetadata(cleanDoi);

        if (res.success && res.metadata.title) {
          setTitle(res.metadata.title);
          setAuthorsText((res.metadata.authors || []).join(", "));
          setYear(res.metadata.year || "");
          setJournal(res.metadata.journal || "");
          setDoi(res.metadata.doi || cleanDoi);
          setWebUrl(res.metadata.url || `https://doi.org/${res.metadata.doi || cleanDoi}`);
          setSourceType("paper");
          applyTakeaways(res);
          setFetchStatus("✓ DOI verified & key points auto-extracted");

          const dup = checkForDuplicates(
            {
              title: res.metadata.title,
              doi: res.metadata.doi || cleanDoi,
              authors: res.metadata.authors,
              year: res.metadata.year,
            },
            existingItems
          );
          if (dup.isDuplicate) setDuplicateWarning(dup);
        } else {
          setDoi(cleanDoi);
          setWebUrl(`https://doi.org/${cleanDoi}`);
          setSourceType("paper");
          setFetchStatus("DOI recognized — please fill remaining details");
        }
      } else if (kind === "url") {
        setFetchStatus("Fetching article metadata & citations…");
        const res = await resolveUrlMetadata(raw);

        setTitle(res.metadata.title || "");
        setAuthorsText((res.metadata.authors || []).join(", "));
        setYear(res.metadata.year || "");
        setJournal(res.metadata.journal || res.metadata.publisher || "");
        setPublisher(res.metadata.publisher || "");
        setDoi(res.metadata.doi || "");
        setWebUrl(res.metadata.url || raw);
        setSourceType(res.metadata.type === "paper" || res.metadata.doi || res.metadata.journal ? "paper" : "website");
        applyTakeaways(res);
        setFetchStatus(res.confidence === "verified" ? "✓ Metadata & key points auto-extracted" : "Source details fetched");

        const dup = checkForDuplicates(
          {
            title: res.metadata.title,
            doi: res.metadata.doi,
            authors: res.metadata.authors,
            year: res.metadata.year,
          },
          existingItems
        );
        if (dup.isDuplicate) setDuplicateWarning(dup);
      } else if (kind === "bibtex") {
        parseBibtex(raw);
      } else if (kind === "cloud_drive" || kind === "onedrive") {
        const parsed = parseCloudShareUrl(raw);
        const provider: CloudStorageProvider = kind === "cloud_drive" ? "google_drive" : "onedrive";
        const fileId = parsed?.fileId || `cloud_${Date.now()}`;
        const fileName = parsed?.fileName || (provider === "google_drive" ? "Google Drive Document.pdf" : "OneDrive Document.pdf");
        const activeAccount = provider === "google_drive" ? googleAccount : oneDriveAccount;

        const dummyFile: DriveFileItem = {
          id: fileId,
          name: fileName,
          mimeType: parsed?.mimeType || "application/pdf",
          webViewLink: raw,
        };
        const inferred = inferMetadataFromCloudFile(dummyFile, provider, {
          accountEmail: activeAccount?.accountEmail,
          accountName: activeAccount?.accountName,
        });

        setTitle(inferred.title);
        setAuthorsText(inferred.authors.join(", "));
        setYear(inferred.year);
        setJournal(inferred.journal || "");
        setPublisher(inferred.publisher || "");
        setWebUrl(inferred.webUrl);
        setSourceType(inferred.sourceType);
        setCloudReference({
          provider,
          fileId,
          fileName,
          webUrl: raw,
        });
        setFetchStatus(`✓ Connected to ${provider === "google_drive" ? "Google Drive" : "OneDrive"}`);

        applyTakeaways({
          keyPoints: inferred.keyPoints,
          suggestedTags: inferred.suggestedTags,
          whySaved: inferred.whySaved,
          keyQuote: inferred.keyQuote,
        });
      } else {
        // Raw title
        setTitle(raw);
        setFetchStatus("Title set — add author & year if known");
        const takeaways = generateKeyPointsAndNotes({ title: raw });
        applyTakeaways(takeaways);
      }
    } catch (err: any) {
      setError(err.message || "Failed to retrieve source metadata.");
    } finally {
      setBusy(false);
    }
  }

  // Handle paste directly into the smart input
  function handleSmartInputPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pastedText = e.clipboardData.getData("text").trim();
    if (pastedText) {
      setSmartInput(pastedText);
      const kind = detectType(pastedText);
      if (kind === "url" || kind === "doi" || kind === "bibtex" || kind === "cloud_drive" || kind === "onedrive") {
        setTimeout(() => {
          handleSmartFetch(pastedText);
        }, 50);
      }
    }
  }

  // Auto-generate key points and notes on demand
  function handleAutoExtractKeyPoints() {
    if (!title.trim()) return;
    setIsAutoExtracting(true);
    try {
      const authors = authorsText
        .split(/[,;&]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean);

      const takeaways = generateKeyPointsAndNotes({
        title: title.trim(),
        authors,
        journal: (journal || publisher).trim(),
        year: year.trim(),
      });
      applyTakeaways(takeaways);
      setShowExtras(true);
      setFetchStatus("✓ Key points and notes extracted for projects");
    } finally {
      setIsAutoExtracting(false);
    }
  }

  function handleAddKeyPoint() {
    const trimmed = keyPointInput.trim();
    if (trimmed && !keyPoints.includes(trimmed)) {
      setKeyPoints([...keyPoints, trimmed]);
      setKeyPointInput("");
    }
  }

  function handleRemoveKeyPoint(index: number) {
    setKeyPoints(keyPoints.filter((_, idx) => idx !== index));
  }

  function handleToggleProject(projectName: string) {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    if (selectedProjects.includes(trimmed)) {
      setSelectedProjects(selectedProjects.filter((p) => p !== trimmed));
    } else {
      setSelectedProjects([...selectedProjects, trimmed]);
    }
  }

  function handleAddProject() {
    const trimmed = projectInput.trim();
    if (trimmed && !selectedProjects.includes(trimmed)) {
      setSelectedProjects([...selectedProjects, trimmed]);
      setProjectInput("");
    }
  }

  // Handle saving the source directly
  async function handleSaveSource(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!title.trim()) {
      setError("Source title is required");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const authors = authorsText
        .split(/[,;&]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean);

      const citation = generateAPA7Citation({
        authors,
        year: year.trim() || undefined,
        title: title.trim(),
        journal: journal.trim() || undefined,
        publisher: publisher.trim() || undefined,
        doi: doi.trim() || undefined,
        url: webUrl.trim() || cloudReference?.webUrl || undefined,
      });

      const sourcePayload = sourceToVaultItemPayload({
        metadata: {
          title: title.trim(),
          authors,
          year: year.trim() || undefined,
          journal: journal.trim() || undefined,
          publisher: publisher.trim() || undefined,
          doi: doi.trim() || undefined,
          url: webUrl.trim() || cloudReference?.webUrl || undefined,
          type: sourceType,
        },
        cloudReference,
        projects: selectedProjects,
        tags,
        notes: {
          whySaved: whySaved.trim() || undefined,
          keyQuote: keyQuote.trim() || undefined,
          keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        },
        citation,
        citationStatus: "confirmed",
        integrityStatus: "clean",
      });

      const saved = await addVaultItem(userId, sourcePayload);
      onSourceSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save source.");
    } finally {
      setBusy(false);
    }
  }

  function handleAddTag() {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  // Filter drive files by query
  const filteredDriveFiles = driveFiles.filter((f) => {
    if (!driveFilter.trim()) return true;
    return f.name.toLowerCase().includes(driveFilter.toLowerCase().trim());
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
          <div>
            <h2 id="add-source-title" className="text-base font-bold text-[color:var(--text-primary)]">
              Add Source
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Paste a link, DOI, or fetch directly from Google Drive and OneDrive.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-md hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Source Intake Selector Tabs */}
        <div className="flex border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 px-6 pt-2">
          <button
            type="button"
            onClick={() => setSourceMode("smart")}
            className={`flex items-center gap-1.5 pb-2.5 pt-1 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              sourceMode === "smart"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] font-bold"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <span>🔗</span>
            <span>Link / DOI / Reference</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceMode("google_drive")}
            className={`flex items-center gap-1.5 pb-2.5 pt-1 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              sourceMode === "google_drive"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] font-bold"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <span className="text-sm">📁</span>
            <span>Google Drive</span>
            {isGoogleConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Connected" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setSourceMode("onedrive")}
            className={`flex items-center gap-1.5 pb-2.5 pt-1 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              sourceMode === "onedrive"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] font-bold"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <span className="text-sm">☁️</span>
            <span>OneDrive</span>
            {isOneDriveConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Connected" />
            )}
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSaveSource} className="p-6 flex flex-col gap-4">
          {/* TAB 1: SMART INTAKE */}
          {sourceMode === "smart" && (
            <div className="flex flex-col gap-2">
              <label htmlFor="smart-intake-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                URL, DOI, or Reference
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="smart-intake-input"
                  type="text"
                  value={smartInput}
                  onChange={(e) => setSmartInput(e.target.value)}
                  onPaste={handleSmartInputPaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !title) {
                      e.preventDefault();
                      handleSmartFetch();
                    }
                  }}
                  placeholder="Paste URL (https://...), DOI (10.1038/...), or title..."
                  className="flex-1 px-3.5 py-2.5 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => handleSmartFetch()}
                  disabled={busy || !smartInput.trim()}
                  className="px-3.5 py-2.5 bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] text-xs font-semibold rounded-[var(--radius-md)] disabled:opacity-50 cursor-pointer shrink-0 transition-colors"
                >
                  {busy ? "Fetching…" : "Fetch"}
                </button>
              </div>

              {/* Quick Cloud Buttons Row */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-[color:var(--text-muted)]">Or fetch from:</span>
                <button
                  type="button"
                  onClick={() => setSourceMode("google_drive")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text-secondary)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                >
                  <span>📁</span>
                  <span>Google Drive</span>
                  {isGoogleConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("onedrive")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text-secondary)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                >
                  <span>☁️</span>
                  <span>OneDrive</span>
                  {isOneDriveConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE DRIVE INTAKE */}
          {sourceMode === "google_drive" && (
            <div className="flex flex-col gap-3 p-3.5 bg-[color:var(--surface-inset)] rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)]">
              {isGoogleConnected ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[color:var(--text-primary)]">
                      <span>📁</span>
                      <span>Google Drive</span>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-full">
                        Connected ({googleAccount?.accountEmail})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href="https://drive.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[color:var(--accent)] hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                      >
                        <span>↗ Open Google Drive</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => loadFilesForProvider("google_drive")}
                        disabled={driveLoading}
                        className="text-[11px] text-[color:var(--accent)] hover:underline cursor-pointer"
                      >
                        {driveLoading ? "Refreshing…" : "↻ Refresh files"}
                      </button>
                    </div>
                  </div>

                  {/* Search filter inside Drive */}
                  <input
                    type="text"
                    value={driveFilter}
                    onChange={(e) => setDriveFilter(e.target.value)}
                    placeholder="Search documents, PDFs, or sheets in Drive..."
                    className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                  />

                  {/* Drive Files List */}
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] p-1">
                    {driveLoading ? (
                      <div className="py-6 text-center text-xs text-[color:var(--text-muted)]">
                        Loading your Google Drive files…
                      </div>
                    ) : filteredDriveFiles.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[color:var(--text-muted)]">
                        {driveFilter ? "No matching files found." : "No documents found in Google Drive."}
                      </div>
                    ) : (
                      filteredDriveFiles.map((file) => {
                        const isSelected = cloudReference?.fileId === file.id;
                        const driveUrl = getDriveFileWebUrl(file, "google_drive");

                        return (
                          <div
                            key={file.id}
                            className={`flex items-center justify-between p-2 rounded-[var(--radius-sm)] transition-colors ${
                              isSelected
                                ? "bg-[color:var(--accent-subtle)]/40 border border-[color:var(--accent)]/30"
                                : "hover:bg-[color:var(--surface-hover)]"
                            }`}
                          >
                            <div
                              onClick={() => handleSelectDriveFile(file, "google_drive", true)}
                              className="flex items-center gap-2 truncate pr-2 flex-1 cursor-pointer"
                              title="Click to select source and open in Google Drive"
                            >
                              <span className="text-sm shrink-0">
                                {file.mimeType?.includes("pdf")
                                  ? "📄"
                                  : file.mimeType?.includes("document")
                                  ? "📝"
                                  : file.mimeType?.includes("spreadsheet")
                                  ? "📊"
                                  : "📁"}
                              </span>
                              <span className="text-xs font-medium text-[color:var(--text-primary)] truncate">
                                {file.name}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                                  ✓ Selected
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={driveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-[var(--radius-sm)] transition-colors flex items-center gap-0.5 cursor-pointer"
                                title="Open directly in Google Drive"
                              >
                                <span>↗ Open in Drive</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleSelectDriveFile(file, "google_drive", true)}
                                className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-[color:var(--accent)] text-white"
                                    : "text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)]"
                                }`}
                              >
                                {isSelected ? "Selected ✓" : "Select Source →"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Direct link option */}
                  <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center gap-2">
                    <input
                      type="text"
                      value={directCloudLink}
                      onChange={(e) => setDirectCloudLink(e.target.value)}
                      placeholder="Or paste Drive file link (https://drive.google.com/...)"
                      className="flex-1 px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleDirectCloudLink("google_drive")}
                      disabled={!directCloudLink.trim()}
                      className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold rounded-[var(--radius-md)] disabled:opacity-50 cursor-pointer"
                    >
                      Fetch Link
                    </button>
                  </div>
                </>
              ) : (
                /* Google Drive Not Connected Setup Card */
                <div className="flex flex-col gap-3 py-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">📁</span>
                    <div>
                      <h3 className="text-xs font-bold text-[color:var(--text-primary)]">Connect Google Drive</h3>
                      <p className="text-[11px] text-[color:var(--text-muted)]">
                        Select and cite your research papers, notes, and datasets with zero document storage.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConnectDrive("google_drive")}
                    disabled={busy}
                    className="w-full py-2 bg-[color:var(--accent-solid)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] text-xs font-bold rounded-[var(--radius-md)] flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 transition-colors"
                  >
                    <span>📁</span>
                    <span>{busy ? "Connecting…" : "Connect Google Drive"}</span>
                  </button>

                  <div className="flex items-center gap-2 pt-1 border-t border-[color:var(--border-subtle)]">
                    <input
                      type="text"
                      value={directCloudLink}
                      onChange={(e) => setDirectCloudLink(e.target.value)}
                      placeholder="Or paste Google Drive share link directly..."
                      className="flex-1 px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleDirectCloudLink("google_drive")}
                      disabled={!directCloudLink.trim()}
                      className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold rounded-[var(--radius-md)] disabled:opacity-50 cursor-pointer"
                    >
                      Fetch Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MICROSOFT ONEDRIVE INTAKE */}
          {sourceMode === "onedrive" && (
            <div className="flex flex-col gap-3 p-3.5 bg-[color:var(--surface-inset)] rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)]">
              {isOneDriveConnected ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[color:var(--text-primary)]">
                      <span>☁️</span>
                      <span>Microsoft OneDrive</span>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-full">
                        Connected ({oneDriveAccount?.accountEmail})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href="https://onedrive.live.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[color:var(--accent)] hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                      >
                        <span>↗ Open OneDrive</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => loadFilesForProvider("onedrive")}
                        disabled={driveLoading}
                        className="text-[11px] text-[color:var(--accent)] hover:underline cursor-pointer"
                      >
                        {driveLoading ? "Refreshing…" : "↻ Refresh files"}
                      </button>
                    </div>
                  </div>

                  {/* Search filter inside OneDrive */}
                  <input
                    type="text"
                    value={driveFilter}
                    onChange={(e) => setDriveFilter(e.target.value)}
                    placeholder="Search Word documents, PDFs, or datasets in OneDrive..."
                    className="px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                  />

                  {/* OneDrive Files List */}
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] p-1">
                    {driveLoading ? (
                      <div className="py-6 text-center text-xs text-[color:var(--text-muted)]">
                        Loading your OneDrive files…
                      </div>
                    ) : filteredDriveFiles.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[color:var(--text-muted)]">
                        {driveFilter ? "No matching files found." : "No documents found in OneDrive."}
                      </div>
                    ) : (
                      filteredDriveFiles.map((file) => {
                        const isSelected = cloudReference?.fileId === file.id;
                        const oneDriveUrl = getDriveFileWebUrl(file, "onedrive");

                        return (
                          <div
                            key={file.id}
                            className={`flex items-center justify-between p-2 rounded-[var(--radius-sm)] transition-colors ${
                              isSelected
                                ? "bg-[color:var(--accent-subtle)]/40 border border-[color:var(--accent)]/30"
                                : "hover:bg-[color:var(--surface-hover)]"
                            }`}
                          >
                            <div
                              onClick={() => handleSelectDriveFile(file, "onedrive", true)}
                              className="flex items-center gap-2 truncate pr-2 flex-1 cursor-pointer"
                              title="Click to select source and open in OneDrive"
                            >
                              <span className="text-sm shrink-0">
                                {file.mimeType?.includes("pdf")
                                  ? "📄"
                                  : file.mimeType?.includes("word") || file.name.endsWith(".docx")
                                  ? "📝"
                                  : file.mimeType?.includes("sheet") || file.name.endsWith(".xlsx")
                                  ? "📊"
                                  : "☁️"}
                              </span>
                              <span className="text-xs font-medium text-[color:var(--text-primary)] truncate">
                                {file.name}
                              </span>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full shrink-0">
                                  ✓ Selected
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={oneDriveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-[var(--radius-sm)] transition-colors flex items-center gap-0.5 cursor-pointer"
                                title="Open directly in OneDrive"
                              >
                                <span>↗ Open in OneDrive</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleSelectDriveFile(file, "onedrive", true)}
                                className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-[color:var(--accent)] text-white"
                                    : "text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)]"
                                }`}
                              >
                                {isSelected ? "Selected ✓" : "Select Source →"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Direct link option */}
                  <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center gap-2">
                    <input
                      type="text"
                      value={directCloudLink}
                      onChange={(e) => setDirectCloudLink(e.target.value)}
                      placeholder="Or paste OneDrive/SharePoint link (https://1drv.ms/...)"
                      className="flex-1 px-3 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleDirectCloudLink("onedrive")}
                      disabled={!directCloudLink.trim()}
                      className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold rounded-[var(--radius-md)] disabled:opacity-50 cursor-pointer"
                    >
                      Fetch Link
                    </button>
                  </div>
                </>
              ) : (
                /* OneDrive Not Connected Setup Card */
                <div className="flex flex-col gap-3 py-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">☁️</span>
                    <div>
                      <h3 className="text-xs font-bold text-[color:var(--text-primary)]">Connect Microsoft OneDrive</h3>
                      <p className="text-[11px] text-[color:var(--text-muted)]">
                        Select and cite your Word documents, OneDrive PDFs, and research notes with zero file copies.
                      </p>
                    </div>
                  </div>

                  {/* Option A: Direct share link (zero setup required) */}
                  <div className="p-2.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[color:var(--text-primary)]">
                      Option 1: Paste OneDrive / SharePoint Link (Instant & Zero Setup)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={directCloudLink}
                        onChange={(e) => setDirectCloudLink(e.target.value)}
                        placeholder="Paste OneDrive or SharePoint link (https://1drv.ms/...)"
                        className="flex-1 px-3 py-1.5 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => handleDirectCloudLink("onedrive")}
                        disabled={!directCloudLink.trim()}
                        className="px-3 py-1.5 bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-white text-xs font-semibold rounded-[var(--radius-sm)] disabled:opacity-50 cursor-pointer"
                      >
                        Fetch Link
                      </button>
                    </div>
                  </div>

                  {/* Option B: Connect Workspace with Email */}
                  <div className="p-2.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-[color:var(--text-primary)]">
                      Option 2: Connect with Microsoft / Institutional Email
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={oneDriveEmailInput}
                        onChange={(e) => setOneDriveEmailInput(e.target.value)}
                        placeholder="e.g. researcher@outlook.com or university.edu"
                        className="flex-1 px-3 py-1.5 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleConnectOneDriveWithEmail}
                        disabled={busy || !oneDriveEmailInput.trim()}
                        className="px-3 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] text-xs font-semibold rounded-[var(--radius-sm)] disabled:opacity-50 cursor-pointer"
                      >
                        Connect Workspace
                      </button>
                    </div>
                  </div>

                  {/* Option C: Supabase OAuth */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleConnectDrive("onedrive")}
                      disabled={busy}
                      className="w-full py-2 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] text-xs font-semibold rounded-[var(--radius-md)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      <span>☁️</span>
                      <span>{busy ? "Connecting…" : "Sign In with Microsoft OAuth"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fetch feedback or error */}
          {fetchStatus && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              {fetchStatus}
            </p>
          )}
          {error && (
            <p className="text-[11px] text-[color:var(--state-danger)] font-medium">
              {error}
            </p>
          )}

          {/* Cloud Reference Attached Chip */}
          {cloudReference && (
            <div className="p-2.5 bg-[color:var(--accent-subtle)]/30 border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <span>{cloudReference.provider === "google_drive" ? "📁" : "☁️"}</span>
                <span className="font-semibold text-[color:var(--text-primary)] truncate">
                  {cloudReference.fileName}
                </span>
                <span className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-wide">
                  ({cloudReference.provider === "google_drive" ? "Google Drive" : "OneDrive"})
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {cloudReference.webUrl && (
                  <a
                    href={cloudReference.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-[var(--radius-sm)] transition-colors cursor-pointer"
                    title={`Open in ${cloudReference.provider === "google_drive" ? "Google Drive" : "OneDrive"}`}
                  >
                    <span>↗ Open in {cloudReference.provider === "google_drive" ? "Google Drive" : "OneDrive"}</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setCloudReference(undefined)}
                  className="text-[11px] text-[color:var(--text-muted)] hover:text-red-500 cursor-pointer"
                >
                  ✕ Detach
                </button>
              </div>
            </div>
          )}

          {/* Duplicate Warning */}
          {duplicateWarning?.isDuplicate && !bypassDuplicate && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 rounded-[var(--radius-md)] text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 truncate">
                <span>⚠️</span>
                <span className="truncate">
                  Already in Vault: <strong>"{duplicateWarning.existingItem?.title}"</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBypassDuplicate(true)}
                className="shrink-0 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold cursor-pointer"
              >
                Save Anyway
              </button>
            </div>
          )}

          {/* Core Metadata Fields */}
          <div className="pt-2 border-t border-[color:var(--border-subtle)] flex flex-col gap-3">
            {/* Title */}
            <div className="flex flex-col gap-1">
              <label htmlFor="source-title" className="text-xs font-bold text-[color:var(--text-primary)]">
                Title *
              </label>
              <input
                id="source-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Towards a Global International Relations?"
                className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
              />
            </div>

            {/* Authors */}
            <div className="flex flex-col gap-1">
              <label htmlFor="source-authors" className="text-xs font-bold text-[color:var(--text-primary)]">
                Authors (comma-separated)
              </label>
              <input
                id="source-authors"
                type="text"
                value={authorsText}
                onChange={(e) => setAuthorsText(e.target.value)}
                placeholder="e.g. Acharya, Amitav"
                className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
              />
            </div>

            {/* Year & Journal/Publisher Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="source-year" className="text-xs font-bold text-[color:var(--text-primary)]">
                  Publication Year
                </label>
                <input
                  id="source-year"
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g. 2024"
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="source-journal" className="text-xs font-bold text-[color:var(--text-primary)]">
                  Journal / Publisher
                </label>
                <input
                  id="source-journal"
                  type="text"
                  value={journal || publisher}
                  onChange={(e) => {
                    setJournal(e.target.value);
                    setPublisher(e.target.value);
                  }}
                  placeholder="e.g. E-International Relations"
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>
            </div>

            {/* DOI & URL Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="source-doi" className="text-xs font-bold text-[color:var(--text-primary)]">
                  DOI
                </label>
                <input
                  id="source-doi"
                  type="text"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                  placeholder="10.1038/..."
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="source-weburl" className="text-xs font-bold text-[color:var(--text-primary)]">
                  Link / Web URL
                </label>
                <input
                  id="source-weburl"
                  type="text"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="https://..."
                  className="px-3 py-2 text-xs bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
              </div>
            </div>
          </div>

          {/* Optional Details Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowExtras(!showExtras)}
              className="text-xs text-[color:var(--accent)] hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <span>{showExtras ? "▼" : "▶"}</span>
              <span>{showExtras ? "Hide tags and writing notes" : "+ Add tags or notes (optional)"}</span>
              {keyPoints.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-full border border-amber-500/30">
                  ✨ {keyPoints.length} Key {keyPoints.length === 1 ? "Point" : "Points"}
                </span>
              )}
              {selectedProjects.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-semibold bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] rounded-full border border-[color:var(--border-subtle)]">
                  📁 {selectedProjects.length}
                </span>
              )}
            </button>

            {showExtras && (
              <div className="mt-3 p-3 bg-[color:var(--surface-inset)]/50 border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] flex flex-col gap-3 animate-in fade-in duration-150">
                {/* Tags */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="tag-input-field" className="text-[11px] font-bold text-[color:var(--text-secondary)] flex items-center gap-1.5">
                      <span>🏷️</span>
                      <span>Thematic Tags</span>
                    </label>
                    <span className="text-[10px] text-[color:var(--text-muted)]">
                      For library-wide search & AI synthesis
                    </span>
                  </div>
                  <p className="text-[10px] text-[color:var(--text-muted)]">
                    Cross-project keywords, methodologies, or research paradigms (e.g. <em>#mixed-methods</em>, <em>#climate-policy</em>, <em>#decoloniality</em>). Tags help you categorize and retrieve sources across all research projects.
                  </p>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)]"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="hover:text-red-500 cursor-pointer ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="tag-input-field"
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag and press enter (e.g. qualitative-methods, AI-ethics)"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      aria-label="Add tag"
                      className="px-2.5 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Writing note / why saved */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="why-saved-input" className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    Why are you saving this source?
                  </label>
                  <input
                    id="why-saved-input"
                    type="text"
                    value={whySaved}
                    onChange={(e) => setWhySaved(e.target.value)}
                    placeholder="e.g. Supports Section 2 theoretical framework"
                    className="px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] focus:outline-hidden"
                  />
                </div>

                {/* Key quote */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="key-quote-input" className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    Key Quote
                  </label>
                  <textarea
                    id="key-quote-input"
                    rows={2}
                    value={keyQuote}
                    onChange={(e) => setKeyQuote(e.target.value)}
                    placeholder="Relevant excerpt or passage..."
                    className="px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] focus:outline-hidden"
                  />
                </div>

                {/* Key Points & Project Takeaways */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[color:var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[11px] font-bold text-[color:var(--text-secondary)] flex items-center gap-1.5">
                        <span>💡</span>
                        <span>Key Points & Project Takeaways</span>
                      </label>
                      <p className="text-[10px] text-[color:var(--text-muted)]">
                        Core arguments and claims auto-fetched or saved for project writing and evidence.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoExtractKeyPoints}
                      disabled={isAutoExtracting || !title.trim()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <span>✨</span>
                      <span>{isAutoExtracting ? "Extracting…" : "Auto-extract"}</span>
                    </button>
                  </div>

                  {keyPoints.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                      {keyPoints.map((kp, idx) => (
                        <div
                          key={idx}
                          className="group flex items-start gap-2 p-2 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[var(--radius-sm)] text-xs text-[color:var(--text-primary)]"
                        >
                          <span className="text-[color:var(--accent)] font-bold mt-0.5">•</span>
                          <span className="flex-1 leading-snug">{kp}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyPoint(idx)}
                            aria-label={`Remove key point ${idx + 1}`}
                            className="text-[color:var(--text-muted)] hover:text-red-500 opacity-60 group-hover:opacity-100 cursor-pointer shrink-0 ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keyPointInput}
                      onChange={(e) => setKeyPointInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddKeyPoint();
                        }
                      }}
                      placeholder="Add key takeaway or argument and press enter"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddKeyPoint}
                      disabled={!keyPointInput.trim()}
                      aria-label="Add key point"
                      className="px-2.5 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] disabled:opacity-40 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Assign to Project(s) */}
                <div className="flex flex-col gap-2 pt-2 border-t border-[color:var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <label htmlFor="project-selector-dropdown" className="text-[11px] font-bold text-[color:var(--text-secondary)] flex items-center gap-1.5">
                      <span>📁</span>
                      <span>Assign to Ongoing Project(s)</span>
                    </label>
                    <span className="text-[10px] text-[color:var(--text-muted)] font-medium">
                      In-text citations & reference lists
                    </span>
                  </div>
                  <p className="text-[10px] text-[color:var(--text-muted)] leading-relaxed">
                    Select from your active research projects or assignments. Sources assigned to a project become directly available in that workspace for AI evidence extraction, literature matrix synthesis, in-text citations (e.g. <em>(Author, Year)</em>), and manuscript bibliographies.
                  </p>

                  {/* Project Selector Dropdown */}
                  <div className="flex items-center gap-2">
                    <select
                      id="project-selector-dropdown"
                      aria-label="Select an ongoing project"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleToggleProject(e.target.value);
                        }
                      }}
                      className="flex-1 px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)] cursor-pointer"
                    >
                      <option value="" disabled>
                        {allAvailableProjects.length > 0
                          ? "▾ Select an ongoing project to link..."
                          : "No ongoing projects found — enter a project name below"}
                      </option>
                      {allAvailableProjects.map((proj) => {
                        const isSelected = selectedProjects.includes(proj);
                        return (
                          <option key={proj} value={proj}>
                            {isSelected ? `✓ ${proj} (Assigned)` : `+ ${proj}`}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Ongoing Projects Quick-Toggle Pills */}
                  {allAvailableProjects.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {allAvailableProjects.map((p) => {
                        const isSelected = selectedProjects.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleToggleProject(p)}
                            aria-label={`${isSelected ? "Remove from" : "Assign to"} ${p}`}
                            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[color:var(--accent)] border-[color:var(--accent)] text-white font-bold shadow-xs"
                                : "bg-[color:var(--surface-raised)] border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                            }`}
                          >
                            <span>{isSelected ? "✓" : "+"}</span>
                            <span>{p}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Active Assigned Projects Summary Box */}
                  {selectedProjects.length > 0 && (
                    <div className="p-2.5 bg-[color:var(--accent-subtle)]/30 border border-[color:var(--accent)]/30 rounded-[var(--radius-md)] text-xs flex flex-col gap-1.5 animate-in fade-in duration-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[color:var(--accent)] uppercase tracking-wider">
                          Assigned to {selectedProjects.length} Project{selectedProjects.length > 1 ? "s" : ""}:
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                          ✓ Integrated for citations & references
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedProjects.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-[color:var(--accent)] text-white font-medium"
                          >
                            <span>📁 {p}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleProject(p)}
                              className="hover:opacity-75 cursor-pointer ml-1 font-bold text-xs"
                              title="Remove project"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Project Creation Input */}
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      value={projectInput}
                      onChange={(e) => setProjectInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddProject();
                        }
                      }}
                      placeholder="Assign project (e.g. Master's Thesis, Capstone)"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleAddProject}
                      disabled={!projectInput.trim()}
                      className="px-2.5 py-1.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] disabled:opacity-40 cursor-pointer"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[color:var(--border-subtle)]">
            <span className="text-[11px] text-[color:var(--text-muted)] flex items-center gap-1">
              <span>🛡️</span>
              <span>Zero document storage</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] rounded-[var(--radius-md)] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="px-4 py-2 bg-[color:var(--accent-solid)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] text-xs font-bold rounded-[var(--radius-md)] shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
              >
                {busy ? "Saving…" : "Save Source"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
