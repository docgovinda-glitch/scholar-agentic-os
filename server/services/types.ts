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
    [key: string]: any;
  };
  encryptedApiKeys?: {
    [provider: string]: string;
  };
  apiKeyHashes?: {
    [provider: string]: string;
  };
}