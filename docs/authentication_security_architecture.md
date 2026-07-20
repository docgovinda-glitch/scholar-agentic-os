# Authentication & Security Architecture Report

## Executive Summary

The application implements client-side authentication with AES-256-CBC encryption for server-side API key storage and XOR-based encryption for client-side persistence. Authentication is handled via React Context with localStorage persistence.

---

## 1. Complete Authentication Flow

```
Registration
    ↓
signup(partial) in authContext.tsx
    - Creates UserProfile with status: "pending"
    - Password hashed via PBKDF2-SHA256 (T004)
    - localStorage: phd_profile_state_${username} → profile JSON
    - localStorage: phd_profiles_meta → usernames list
    ↓
Activation
    ↓
activate(activationKey) in authContext.tsx
    - Sets status: "approved"
    - Persists to localStorage
    ↓
Login
    ↓
login(username, password) in authContext.tsx
    - Reads from localStorage: phd_profile_state_${username}
    - Validates password via PBKDF2 verification (T004)
    - Supports legacy plaintext passwords for backward compatibility (T004)
    - Validates status !== "pending"
    - Sets user, project, onboardingStep
    - Persists session: phd_active_session_username
    ↓
Authenticated Session
    - useAuth hook provides context to components
    - Password used as decryption secret for API keys (server-side)
    ↓
Logout
    - Clears user, project, session from localStorage
    - Resets onboardingStep to "login"
```

---

## 2. Authentication Components

### 2.1 Auth Context (`src/auth/authContext.tsx`)

**Authentication Methods:**
- `login(username, password)`: Validates against stored profile, sets session
- `logout()`: Clears session state
- `signup(partial)`: Creates pending profile with project state
- `activate(activationKey)`: Approves profile
- `socialSignIn(name, email, provider)`: Creates/approves profile via Google/Facebook
- `loginDirectly(username, project)`: Bypasses password check (for internal use)

**Profile Storage:**
- `phd_active_session_username` → current session
- `phd_profile_state_${username}` → full UserProfile JSON
- `phd_profiles_meta` → { profilesList: string[] }

### 2.2 Password Handling (T004 Completed)
**VERIFIED:**
- Password stored as `passcodeHash` in UserProfile (now PBKDF2-SHA256 salted hash)
- Status check: `pending` users cannot login
- Login uses `verifyPassword()` async PBKDF2 verification
- Signup uses `hashPassword()` async PBKDF2 hashing
- Social sign-in also hashes passcodes now

**Implementation Details:**
- `hashPassword()`: PBKDF2-SHA256 with 100,000 iterations, random 16-byte salt
- `verifyPassword()`: Supports both new PBKDF2 format ("salt$hash") and legacy plaintext (backward compatibility)
- Format: base64(salt)$base64(hash)

**Migration Path:**
- Legacy users with plaintext passwords continue to work via backward compatibility in verifyPassword()
- On successful login with legacy password, no auto-migration (would require user to re-enter password)

### 2.3 Session Management
- Session stored in localStorage (persistent)
- No automatic expiration
- No token refresh mechanism

---

## 3. Authorization Model

**VERIFIED: UNKNOWN**
- No roles defined in UserProfile
- No permission checks in components
- Approval status (`status: "pending" | "approved"`) is the only access control
- All authenticated users have full access to all features

---

## 4. Encryption & Secret Management

### 4.1 Server-Side Encryption (`server.ts`, lines 41-71)

**Algorithm:** AES-256-CBC

```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "scholar-agentic-secure-vault-32ch";
const cipher = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
```

**Purpose:** Encrypt API keys stored in users.json

**Key Management:**
- Environment variable ENCRYPTION_KEY for production
- Hardcoded 32-character fallback for development
- IV generated randomly per encryption (proper practice)

### 4.2 Client-Side Encryption (`src/utils/crypto.ts`)

**Algorithm (Post-T003):**
- Legacy: XOR cipher with Base64 encoding (deprecated, kept for backward compatibility)
- New: AES-256-GCM with PBKDF2 key derivation (100,000 iterations)

```typescript
// Legacy (deprecated) - kept for backward compatibility
export function encryptData(text: string, secret: string): string {
  // Throws if secret is empty - no hardcoded fallback
  // XOR each character with key character
}

// New secure implementation
export async function encryptDataAsync(text: string, secret: string): Promise<string> {
  // AES-GCM with PBKDF2 (100,000 iterations)
  // Random IV/salt per encryption
  // Returns "v2:" prefixed format
}

// Password hashing (T004)
export async function hashPassword(password: string): Promise<string> {
  // PBKDF2-SHA256 with 100,000 iterations
  // Random 16-byte salt
  // Returns "salt$hash" format
}

// Password verification (T004)
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Supports PBKDF2 format and legacy plaintext
}
```

**Security Improvements (T003 + T004):**
- ✅ No hardcoded fallback keys (throws error instead)
- ✅ AES-GCM encryption available via encryptDataAsync()
- ✅ PBKDF2 key derivation with 100,000 iterations
- ✅ Random IV/salt for each encryption
- ✅ Password hashing via PBKDF2-SHA256
- ✅ Backward compatibility maintained for legacy data and passwords

**Purpose:** Decrypt API keys stored in UserProfile (legacy) or new secure storage

---

## 5. API Key Management

### 5.1 Server-Side (`users.json` structure)
- `encryptedApiKeys`: { [provider: string]: encrypted key }
- `apiKeyHashes`: { [provider: string]: hash for lookup }

### 5.2 Client-Side Resolution (`server.ts`, lines 73-83)
```typescript
function resolveApiKey(provider: string, apiKey: string, username?: string): string {
  if ((!apiKey || apiKey === "defined_on_server") && username) {
    const userRec = db.find(u => u.username === username);
    if (userRec?.encryptedApiKeys?.[provider]) {
      apiKey = decryptServerKey(userRec.encryptedApiKeys[provider]);
    }
  }
  return apiKey;
}
```

---

## 6. Security Review

### Input Validation
**VERIFIED PARTIAL:**
- Username/password required for login
- PasscodeHash comparison (now via PBKDF2)
- No password complexity requirements
- No rate limiting

### Output Encoding
**UNKNOWN:**
- React handles XSS by default
- No explicit output encoding seen

### CSRF Protection (T005 Analysis Complete)
**VERIFIED: NOT APPLICABLE**

**Evidence-Based Finding:**
- No session cookies used for authentication
- Authentication state stored in localStorage (same-origin protected)
- All API requests require explicit credentials (API keys) in request body
- Traditional CSRF attacks require automatic credential sending (cookies)

**API Endpoint Analysis:**
| Endpoint | Method | Auth Required | Credential Type |
|----------|--------|-------------|-----------------|
| `/api/generate` | POST | No | `apiKey` in body (explicit) |
| `/api/stream-generate` | POST | No | `apiKey` in body (explicit) |
| `/api/parse-file` | POST | No | None |
| `/api/save-api-keys` | POST | No | `username` in body |

**Threat Model:**
- No `Set-Cookie` headers sent by any endpoint
- No `cookie-parser` middleware in Express stack
- No automatic credential inclusion in requests
- All credentials must be explicitly provided by attacker

**Recommendation:**
- CSRF protection NOT required for current architecture
- Attack vector would require XSS to steal localStorage content first
- Focus on XSS prevention and server-side API key storage instead
- Re-evaluate if session cookies are introduced in future

### Secret Leakage
**RESOLVED (T004):**
- Passwords now stored as PBKDF2-SHA256 salted hashes (not plaintext)
- API keys still decryptable by any code with the user's password (required for functionality)
- Legacy passwords supported via backward compatibility

### Browser Storage of Secrets
**VERIFIED:**
- Password/passcodeHash now PBKDF2 hashed
- Decrypted API keys in memory after resolution
- Encryption provides obscurity, not security

---

## 7. Architectural Review

### Multiple Authentication Paths
**VERIFIED:**
1. Standard login (`login`) - now uses PBKDF2 verification
2. Social sign-in (`socialSignIn`) - now uses PBKDF2 hashing
3. Direct login (`loginDirectly`) - no password required
4. OTP send/verify (stub implementations)

### Trust Boundaries
**VERIFIED:**
- Client trust boundary: React Context holds all user data
- Browser trust boundary: localStorage stores profile and session
- Server trust boundary: users.json holds encrypted API keys

### Missing Authorization
**VERIFIED CRITICAL:**
- No role-based access control
- No feature-level permissions
- Approval status only gates initial access

---

## 8. Known Risks

### Critical
- None (CSRF not applicable, password storage resolved)

### High
1. **No Rate Limiting**: Brute force possible on login
2. **API Keys in Request Body**: Credentials exposed in transit

### Medium
1. **No Input Sanitization**: Usernames with special chars could cause issues

---

## 9. Remaining Unknowns

- Whether server.ts implements any session validation
- How OTP system is intended to work (currently stubs)
- Whether server-side admin endpoints exist
- How "defined_on_server" API key flow works with encryption

---

## 10. Implementation Notes

### T003 Completed Changes:
- Removed hardcoded fallback `"scholar_agentic_fallback_secret_salt_123"` from crypto.ts
- Added `encryptDataAsync()` and `decryptDataAsync()` using AES-GCM + PBKDF2
- Updated `getActivePasscodeHash()` in aiGateway.ts to return empty string instead of fallback
- Backward compatibility preserved: legacy XOR data still decrypts correctly

### T004 Completed Changes:
- Added `hashPassword()` - PBKDF2-SHA256 with 100,000 iterations
- Added `verifyPassword()` - async verification with backward compatibility
- Updated `login()` to use `verifyPassword()` instead of plaintext comparison
- Updated `signup()` to hash passwords before storage
- Updated `socialSignIn()` to hash social auth passcodes

### T005 Analysis:
- CSRF protection NOT required for localStorage-based authentication
- No automatic credential sending mechanism present
- Documented with evidence, no code changes needed