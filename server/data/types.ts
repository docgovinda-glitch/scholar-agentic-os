export interface UserRecord {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  affiliation: string;
  authenticId: string;
  is_approved: boolean;
  activationKeyHash: string;
  passcodeHash?: string;
  tempPasscodeHash?: string;
  resetApproved?: boolean;
  modelPreferences?: {
    provider?: string;
    model?: string;
    [key: string]: unknown;
  };
  encryptedApiKeys?: Record<string, string>;
  apiKeyHashes?: Record<string, string>;
}

export interface DataLayerStatus {
  ready: boolean;
  mode: "postgres" | "legacy";
  userCount: number;
  migratedFromLegacy: boolean;
  databaseUrlConfigured: boolean;
}

