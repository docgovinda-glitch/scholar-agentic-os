import crypto from "crypto";
import { readUsersDb, UserRecord } from "../services/userDb.js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "scholar-agentic-secure-vault-32ch";
const IV_LENGTH = 16;

export function encryptServerKey(text: string): string {
  let cipherKey = Buffer.alloc(32);
  cipherKey.write(ENCRYPTION_KEY, "utf-8");
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", cipherKey, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptServerKey(text: string): string {
  try {
    let cipherKey = Buffer.alloc(32);
    cipherKey.write(ENCRYPTION_KEY, "utf-8");
    
    const parts = text.split(":");
    const iv = Buffer.from(parts.shift() || "", "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", cipherKey, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("Failed to decrypt server key:", err);
    return "";
  }
}

export function resolveApiKey(provider: string, apiKey: string, username?: string): string {
  let activeApiKey = apiKey;
  if ((!activeApiKey || activeApiKey === "defined_on_server" || activeApiKey === "") && username) {
    const db = readUsersDb();
    const userRec = db.find(u => u.username === username.trim());
    if (userRec && userRec.encryptedApiKeys && userRec.encryptedApiKeys[provider]) {
      activeApiKey = decryptServerKey(userRec.encryptedApiKeys[provider]);
    }
  }
  return activeApiKey;
}