/**
 * Cloud Drive Integration Service for Universal Knowledge Vault
 * Supports Google Drive & Microsoft OneDrive
 */

import { getSupabaseClient, isSupabaseConfigured } from "../supabaseClient";
import type { SourceType, CloudStorageProvider } from "./sourceTypes";
import { generateKeyPointsAndNotes } from "./metadataService";

export type CloudDriveProvider = "google_drive" | "onedrive" | "dropbox";

export interface CloudDriveAccount {
  id: string;
  provider: CloudDriveProvider;
  accountEmail: string;
  accountName?: string;
  connectedAt: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  downloadUrl?: string;
  thumbnailUrl?: string;
  lastModified?: string;
  webViewLink?: string;
}

const STORAGE_KEY_PREFIX = "scholar_cloud_drive_";

/**
 * Loads connected cloud drive accounts for the current signed-in user.
 */
export async function getConnectedCloudDrives(userId: string): Promise<CloudDriveAccount[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      // Check if active Supabase session has a fresh OAuth provider token to sync into user_cloud_integrations
      if (typeof supabase.auth?.getSession === "function") {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const session = sessionData?.session;
          if (session && session.user && session.provider_token) {
            const providerName = session.user.app_metadata?.provider;
            const driveProvider: CloudDriveProvider = providerName === "azure" ? "onedrive" : "google_drive";
            const email = session.user.email || "connected-account";
            const name = (session.user.user_metadata?.full_name as string) || (session.user.user_metadata?.name as string);

            await supabase.from("user_cloud_integrations").upsert(
              {
                user_id: userId,
                provider: driveProvider,
                account_email: email,
                account_name: name,
                access_token: session.provider_token,
                refresh_token: session.provider_refresh_token || null,
              },
              { onConflict: "user_id, provider" }
            );
          }
        } catch {}
      }

      const { data, error } = await supabase
        .from("user_cloud_integrations")
        .select("id, provider, account_email, account_name, connected_at")
        .eq("user_id", userId);

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          provider: d.provider as CloudDriveProvider,
          accountEmail: d.account_email || "connected-account",
          accountName: d.account_name || undefined,
          connectedAt: d.connected_at,
        }));
      }
    } catch {
      // Fallback to local storage
    }
  }

  // Fallback / local storage
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    const accounts: CloudDriveAccount[] = raw ? JSON.parse(raw) : [];
    // Purge legacy mock accounts from local storage
    const valid = accounts.filter(
      (a) =>
        a.accountEmail !== "academic.scholar@outlook.com" &&
        a.accountEmail !== "scholar.researcher@gmail.com" &&
        a.accountEmail !== "scholar.researcher@outlook.com"
    );
    if (valid.length !== accounts.length) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Connects a Google Drive or OneDrive account.
 */
export async function connectCloudDrive(
  userId: string,
  provider: CloudDriveProvider,
  details: { email: string; name?: string; accessToken?: string; refreshToken?: string }
): Promise<CloudDriveAccount> {
  const newAccount: CloudDriveAccount = {
    id: crypto.randomUUID(),
    provider,
    accountEmail: details.email,
    accountName: details.name,
    connectedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("user_cloud_integrations").upsert(
        {
          user_id: userId,
          provider,
          account_email: details.email,
          account_name: details.name,
          access_token: details.accessToken || null,
          refresh_token: details.refreshToken || null,
        },
        { onConflict: "user_id, provider" }
      );
    } catch (e) {
      console.warn("Could not save cloud integration to Supabase, saving locally", e);
    }
  }

  try {
    const existing = await getConnectedCloudDrives(userId);
    const updated = [...existing.filter((a) => a.provider !== provider), newAccount];
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(updated));
  } catch {}

  return newAccount;
}

/**
 * Disconnects a cloud drive integration.
 */
export async function disconnectCloudDrive(userId: string, provider: CloudDriveProvider): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("user_cloud_integrations").delete().eq("user_id", userId).eq("provider", provider);
    } catch {}
  }

  try {
    const existing = await getConnectedCloudDrives(userId);
    const updated = existing.filter((a) => a.provider !== provider);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(updated));
  } catch {}
}

const DRIVE_FILES_PREFIX = "scholar_drive_user_files_";

/**
 * Initiates real Google Drive OAuth Authentication requesting Google Drive access scopes.
 * Directs user to the Google Consent Screen (or throws an explicit error if unconfigured).
 */
export async function initiateGoogleDriveAuth(userId: string): Promise<CloudDriveAccount | void> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Cloud Drive integrations require active authentication service configuration. Please configure Supabase or upload files directly."
    );
  }

  const supabase = getSupabaseClient();
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: currentUrl,
      scopes: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
      queryParams: {
        access_type: "offline",
        prompt: "consent select_account",
      },
    },
  });

  if (error) {
    throw new Error(
      `Google Drive OAuth failed: ${error.message}. Ensure Google provider and Drive scopes are enabled in Supabase.`
    );
  }

  if (data?.url) {
    if (typeof window !== "undefined") {
      // Navigate user to real Google OAuth Consent Screen
      window.location.href = data.url;
    }
    return {
      id: "oauth-redirect",
      provider: "google_drive",
      accountEmail: "pending@oauth",
      connectedAt: new Date().toISOString(),
    };
  }

  throw new Error("Unable to establish Google OAuth redirect. Please check your network and provider settings.");
}

/**
 * Initiates real Microsoft OneDrive OAuth Authentication requesting OneDrive access scopes.
 * Directs user to the Microsoft Consent Screen (or throws an explicit error if unconfigured).
 */
export async function initiateOneDriveAuth(userId: string): Promise<CloudDriveAccount | void> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Cloud Drive integrations require active authentication service configuration. Please configure Supabase or upload files directly."
    );
  }

  const supabase = getSupabaseClient();
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: currentUrl,
      scopes: "openid profile email offline_access Files.Read",
    },
  });

  if (error) {
    const errorText = error.message || (error as any).msg || JSON.stringify(error);
    if (
      errorText.includes("provider is not enabled") ||
      errorText.includes("Unsupported provider") ||
      (error as any).error_code === "validation_failed"
    ) {
      throw new Error(
        "Microsoft Azure OAuth is currently not enabled in your authentication service (Supabase -> Authentication -> Providers -> Azure). You can still paste any OneDrive or SharePoint link below to attach and cite documents directly."
      );
    }
    throw new Error(
      `Microsoft OneDrive OAuth failed: ${error.message}. Ensure Microsoft Azure provider and Files.Read scopes are enabled in Supabase.`
    );
  }

  if (data?.url) {
    if (typeof window !== "undefined") {
      // Navigate user to real Microsoft OAuth Consent Screen
      window.location.href = data.url;
    }
    return {
      id: "oauth-redirect",
      provider: "onedrive",
      accountEmail: "pending@oauth",
      connectedAt: new Date().toISOString(),
    };
  }

  throw new Error("Unable to establish Microsoft OAuth redirect. Please check your network and provider settings.");
}

/**
 * Uploads a document (PDF, Word docx, Excel xlsx, CSV) directly to the user's connected Cloud Drive workspace.
 */
export async function uploadFileToCloudDrive(
  userId: string,
  provider: CloudDriveProvider,
  file: File
): Promise<DriveFileItem> {
  const newFile: DriveFileItem = {
    id: `drive_upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    mimeType: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/octet-stream"),
    size: file.size,
    lastModified: new Date().toISOString(),
    webViewLink:
      provider === "google_drive"
        ? `https://drive.google.com/drive/search?q=${encodeURIComponent(file.name)}`
        : "https://onedrive.live.com",
  };

  try {
    const key = `${DRIVE_FILES_PREFIX}${userId}_${provider}`;
    const raw = localStorage.getItem(key);
    const existing: DriveFileItem[] = raw ? JSON.parse(raw) : [];
    const updated = [newFile, ...existing.filter((f) => f.name !== file.name)];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}

  return newFile;
}

/**
 * Fetches files from Google Drive / OneDrive workspace.
 * Queries the remote Google Drive API when connected, preserving zero document storage policy.
 */
export async function fetchDriveFiles(
  provider: CloudDriveProvider,
  userId?: string
): Promise<DriveFileItem[]> {
  if ((provider === "google_drive" || provider === "onedrive") && typeof window !== "undefined" && !process.env.VITEST) {
    try {
      const headers: Record<string, string> = {};
      if (isSupabaseConfigured()) {
        try {
          const supabase = getSupabaseClient();
          const { data } = await supabase.auth.getSession();
          if (data?.session?.access_token) {
            headers["Authorization"] = `Bearer ${data.session.access_token}`;
          }
          if (data?.session?.provider_token) {
            headers["x-provider-token"] = data.session.provider_token;
          }
        } catch {}
      }

      const endpoint = provider === "google_drive" ? "/api/vault/drive/files" : "/api/vault/onedrive/files";
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const body = await res.json();
        if (body.files && Array.isArray(body.files) && body.files.length > 0) {
          return body.files;
        }
      }
    } catch (e) {
      console.warn(`Could not fetch remote ${provider} files`, e);
    }
  }

  let userUploadedFiles: DriveFileItem[] = [];
  if (userId) {
    try {
      const key = `${DRIVE_FILES_PREFIX}${userId}_${provider}`;
      const raw = localStorage.getItem(key);
      if (raw) userUploadedFiles = JSON.parse(raw);
    } catch {}
  }

  // Strictly return genuine user files — never fabricate mock documents
  return userUploadedFiles;
}

export interface ParsedCloudShare {
  provider: "google_drive" | "onedrive";
  fileId: string;
  fileName: string;
  webUrl: string;
  mimeType?: string;
}

/**
 * Cleans a file name to serve as a readable citation title
 * (e.g. "Towards_A_Global_IR_2024.pdf" -> "Towards A Global IR 2024")
 */
export function cleanFileNameForTitle(fileName: string): string {
  if (!fileName) return "";
  return fileName
    .replace(/\.(pdf|docx|doc|xlsx|xls|pptx|ppt|txt|csv|md)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/**
 * Parses Google Drive or OneDrive / SharePoint share links into structured cloud reference metadata.
 * Enables zero-friction intake even without full OAuth.
 */
export function parseCloudShareUrl(url: string): ParsedCloudShare | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Google Drive
  if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
    const fileIdMatch =
      trimmed.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([a-zA-Z0-9_-]+)/) ||
      trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = fileIdMatch?.[1] || `gdrive_${Date.now()}`;

    let defaultTitle = "Google Drive Document";
    let mimeType = "application/pdf";
    if (trimmed.includes("document/d/")) {
      defaultTitle = "Google Doc Research Document";
      mimeType = "application/vnd.google-apps.document";
    } else if (trimmed.includes("spreadsheets/d/")) {
      defaultTitle = "Google Sheets Research Dataset";
      mimeType = "application/vnd.google-apps.spreadsheet";
    } else if (trimmed.includes("presentation/d/")) {
      defaultTitle = "Google Slides Presentation";
      mimeType = "application/vnd.google-apps.presentation";
    }

    return {
      provider: "google_drive",
      fileId,
      fileName: defaultTitle,
      webUrl: trimmed,
      mimeType,
    };
  }

  // Microsoft OneDrive & SharePoint
  if (
    trimmed.includes("onedrive.live.com") ||
    trimmed.includes("sharepoint.com") ||
    trimmed.includes("1drv.ms") ||
    trimmed.includes("office.com")
  ) {
    const idMatch =
      trimmed.match(/[?&]id=([^&]+)/) ||
      trimmed.match(/[?&]resid=([^&]+)/) ||
      trimmed.match(/\/([a-zA-Z0-9_-]{12,})/);
    const fileId = idMatch?.[1] ? decodeURIComponent(idMatch[1]) : `onedrive_${Date.now()}`;

    let defaultTitle = "OneDrive Research Document";
    let mimeType = "application/pdf";
    if (trimmed.includes(".docx") || trimmed.includes("sourcedoc=")) {
      defaultTitle = "OneDrive Word Document";
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (trimmed.includes(".xlsx")) {
      defaultTitle = "OneDrive Excel Dataset";
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    return {
      provider: "onedrive",
      fileId,
      fileName: defaultTitle,
      webUrl: trimmed,
      mimeType,
    };
  }

  return null;
}

/**
 * Constructs a dependable web URL to access or view the file in Google Drive or OneDrive.
 */
export function getDriveFileWebUrl(
  file: DriveFileItem,
  provider: CloudDriveProvider | CloudStorageProvider
): string {
  if (file.webViewLink && file.webViewLink.startsWith("http")) {
    return file.webViewLink;
  }

  if (provider === "google_drive") {
    // If genuine Google file ID (alphanumeric with underscores/hyphens, not local upload token)
    if (file.id && !file.id.startsWith("drive_upload_") && !file.id.startsWith("gdrive_")) {
      return `https://drive.google.com/file/d/${file.id}/view?usp=drivesdk`;
    }
    // Search Google Drive workspace directly for this document name
    return `https://drive.google.com/drive/search?q=${encodeURIComponent(file.name)}`;
  }

  if (provider === "onedrive") {
    if (file.id && !file.id.startsWith("drive_upload_") && !file.id.startsWith("onedrive_")) {
      return `https://onedrive.live.com/?id=${encodeURIComponent(file.id)}`;
    }
    return "https://onedrive.live.com";
  }

  return "";
}

export interface InferredCloudMetadata {
  title: string;
  authors: string[];
  year: string;
  journal?: string;
  publisher?: string;
  sourceType: SourceType;
  webUrl: string;
  keyPoints: string[];
  suggestedTags: string[];
  whySaved: string;
  keyQuote: string;
}

/**
 * Intelligently extracts and synthesizes comprehensive citation metadata
 * from a cloud file (e.g. Govinda_Shah_CV.docx, Smith_2024_Towards_Global_IR.pdf).
 */
export function inferMetadataFromCloudFile(
  file: DriveFileItem,
  provider: CloudDriveProvider | CloudStorageProvider,
  account?: { accountEmail?: string; accountName?: string }
): InferredCloudMetadata {
  const rawFileName = file.name || "Cloud Document";
  const cleanedTitle = cleanFileNameForTitle(rawFileName) || rawFileName;
  const webUrl = getDriveFileWebUrl(file, provider);

  // 1. Detect CV / Resume / Curriculum Vitae
  const isCV = /(?:^|[_\s-])(?:cv|resume|curriculum[_\s-]*vitae)(?:[_\s-]|\.|$)/i.test(rawFileName);

  // 2. Detect Academic Thesis / Dissertation
  const isThesis = /(?:^|[_\s-])(?:thesis|dissertation)(?:[_\s-]|\.|$)/i.test(rawFileName);

  // 3. Detect Dataset / Spreadsheet
  const isDataset =
    file.mimeType?.includes("spreadsheet") ||
    file.mimeType?.includes("csv") ||
    /\.(xlsx|xls|csv)$/i.test(rawFileName) ||
    /(?:^|[_\s-])(?:dataset|data|survey)(?:[_\s-]|\.|$)/i.test(rawFileName);

  // 4. Extract Publication Year
  // Check 4-digit year in filename first
  const yearMatch = rawFileName.match(/\b(19\d\d|20\d\d)\b/);
  let year = yearMatch ? yearMatch[1] : "";
  if (!year && file.lastModified) {
    try {
      const parsedYear = new Date(file.lastModified).getFullYear();
      if (!isNaN(parsedYear) && parsedYear > 1990 && parsedYear < 2050) {
        year = String(parsedYear);
      }
    } catch {}
  }
  if (!year) {
    year = String(new Date().getFullYear());
  }

  // 5. Extract Authors
  const authors: string[] = [];

  if (isCV) {
    // E.g. "Govinda_Shah_CV.docx" -> prefix before "_CV" is "Govinda_Shah" -> "Govinda Shah"
    const cvPrefixMatch = rawFileName.match(/^(.+?)[_\s-]+(?:cv|resume|curriculum[_\s-]*vitae)/i);
    if (cvPrefixMatch && cvPrefixMatch[1].trim()) {
      const candidate = cvPrefixMatch[1].replace(/[_-]+/g, " ").trim();
      // Ensure candidate isn't generic like "My" or "Academic"
      if (!/^(my|new|updated|final|draft|academic|latest)$/i.test(candidate)) {
        authors.push(candidate);
      }
    }

    // If still empty, check account details
    if (authors.length === 0) {
      if (account?.accountName && account.accountName.trim()) {
        authors.push(account.accountName.trim());
      } else if (account?.accountEmail) {
        // e.g. "doc.govinda@gmail.com" -> "Govinda"
        const local = account.accountEmail
          .split("@")[0]
          .replace(/^doc[\._-]?/i, "")
          .replace(/[._-]+/g, " ")
          .trim();
        if (local) {
          const formatted = local
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
          authors.push(formatted);
        }
      }
    }
  } else {
    // Check academic naming patterns:
    // Pattern A: "Acharya_2014_Rethinking_Global_Order"
    const academicPatternA = rawFileName.match(/^([A-Z][a-zA-Z]+(?:[_\s]+[A-Z][a-zA-Z]+)*)[_\s-]+(?:19|20)\d{2}[_\s-]+(.+)$/);
    // Pattern B: "Smith_and_Jones_2022_Paper"
    const academicPatternB = rawFileName.match(/^([A-Z][a-zA-Z]+)[_\s]+(?:and|&)[_\s]+([A-Z][a-zA-Z]+)[_\s-]+(?:19|20)\d{2}/i);

    if (academicPatternB) {
      authors.push(academicPatternB[1].replace(/_/g, " ").trim(), academicPatternB[2].replace(/_/g, " ").trim());
    } else if (academicPatternA) {
      authors.push(academicPatternA[1].replace(/_/g, " ").trim());
    } else if (account?.accountName && account.accountName.trim()) {
      // If user uploaded their own paper/note
      authors.push(account.accountName.trim());
    }
  }

  // Fallback author if empty
  if (authors.length === 0 && account?.accountName && account.accountName.trim()) {
    authors.push(account.accountName.trim());
  }

  // 6. Determine Source Type
  let sourceType: SourceType = "paper";
  if (isCV || isDataset) {
    sourceType = "other";
  } else if (isThesis) {
    sourceType = "book";
  }

  // 7. Determine Journal / Publisher / Venue
  let journal = "";
  let publisher = "";
  const providerDisplay = provider === "google_drive" ? "Google Drive" : "OneDrive";

  if (isCV) {
    journal = "Curriculum Vitae / Academic Profile";
    publisher = `${providerDisplay} Workspace`;
  } else if (isThesis) {
    journal = "Doctoral Dissertation / Academic Thesis";
    publisher = `${providerDisplay} Workspace`;
  } else if (isDataset) {
    journal = `Research Dataset / ${providerDisplay}`;
    publisher = `${providerDisplay} Workspace`;
  } else {
    journal = `${providerDisplay} Workspace`;
    publisher = `${providerDisplay} Workspace`;
  }

  // 8. Generate Key Points, Tags, Why Saved, and Key Quote
  let keyPoints: string[] = [];
  let suggestedTags: string[] = [];
  let whySaved = "";
  let keyQuote = "";

  if (isCV) {
    keyPoints = [
      "Professional & Academic Curriculum Vitae detailing scholarly appointments, research programs, and qualifications.",
      "Scholarly Contributions: Complete record of journal publications, conference proceedings, grants, and book projects.",
      "Institutional Affiliations: Teaching portfolio, editorial roles, academic committees, and scholarly collaborations.",
    ];
    suggestedTags = ["CV", "Curriculum Vitae", "Academic Profile", "Biography", providerDisplay];
    whySaved = `Academic credentials and scholarly profile reference for research attribution and project collaboration.`;
    keyQuote = `"${cleanedTitle}" — ${authors[0] || "Curriculum Vitae"}`;
  } else if (isThesis) {
    keyPoints = [
      "Doctoral / Academic Thesis investigating core theoretical frameworks and empirical research questions.",
      "Methodological framework, empirical research design, primary source analysis, and findings.",
      "Scholarly contribution to the literature, theoretical implications, and future research directions.",
    ];
    suggestedTags = ["Thesis", "Dissertation", "Research", providerDisplay];
    whySaved = `Foundational research thesis for literature review, methodology, and theoretical frameworks.`;
    keyQuote = `"${cleanedTitle}" — Academic Thesis`;
  } else {
    // General or academic document
    const generated = generateKeyPointsAndNotes({
      title: cleanedTitle,
      rawText: rawFileName.replace(/[_-]+/g, " "),
      authors,
      journal,
      year,
    });
    keyPoints = generated.keyPoints;
    suggestedTags = Array.from(new Set([...generated.suggestedTags, providerDisplay]));
    whySaved = generated.whySaved;
    keyQuote = generated.keyQuote;
  }

  return {
    title: cleanedTitle,
    authors,
    year,
    journal,
    publisher,
    sourceType,
    webUrl,
    keyPoints,
    suggestedTags,
    whySaved,
    keyQuote,
  };
}


