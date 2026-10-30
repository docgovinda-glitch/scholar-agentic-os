# Draft Security Notice to Users (`USER_NOTICE.md`)

> **Owner Editorial, Verification & Legal Checklist (Complete Before Sending)**:
> - **Status**: DRAFT — prepared for owner review. Nothing has been sent to users (the agent never sends anything to users). Do **not** send until every item in the **Claims-to-PR Pre-Send Checklist** below is checked off in production and the `[PLACEHOLDER]` sections are filled in.
> - **Legal Notification Obligations**: Statutory breach-notification timelines and content requirements depend on the jurisdictions where affected users reside (for example: GDPR Article 34 for EU/EEA/UK residents when there is a high risk to rights and freedoms; US state data-breach statutes; Nepal's Individual Privacy Act 2075 / Electronic Transactions Act; or institutional research data agreements). Verify applicable legal obligations based on your user base's jurisdictions before sending.

---

## Pre-Send Verification Checklist (Claims-to-PR & Production State Mapping)

Before sending the notice below, verify that every remedial claim in the letter is live in production:

| Notice Claim | Backing PR / Migration / Runbook Step | Pre-Send Verification Check |
| :--- | :--- | :--- |
| **"Enforced strict authentication and project ownership checks on all API routes and file uploads"** | **PR #71** (`5a642a0`) + **PR #80** (`cbf38da`: `uploadGuard.ts` hard 10 MB clamp, `requireAuth` on `/api/ai/*`, SSRF depth tests) | Run `HOTFIX_DEPLOY.md` Checks 1–6 and `POST_DEPLOY_80.md` Checks 3–4 against `https://scholar.gkshah.com.np`. |
| **"Rate-limited login & availability checks with anti-spoofing IP verification"** | **PR #80** (`cbf38da`: `proxy-addr` upgrade + `rateLimit.ts` right-most hop Cloudflare CIDR verification) + **PR #81** (`5 req / 5 min` login cap + Turnstile single-use passthrough) | Run `POST_DEPLOY_80.md` Check 2 (confirm `429` even with rotated `User-Agent`, spoofed `X-Forwarded-For`, and spoofed `CF-Connecting-IP`). |
| **"Locked down database tables, private file storage with short-lived signed links, and restricted account lookup functions"** | **PR #72** (`206deb6`) + **PR #80** (`cbf38da`) + **Hotfix 2 SQL** (`20261028000000_hotfix2_db_storage_rpc_lockdown.sql` + `HOTFIX2_DEPLOY.md` Steps 1–3) | Run `HOTFIX2_DEPLOY.md` Section 5 verification `SELECT`s and confirm `request-profile-update` Edge Function returns `HTTP 410 Gone`. |
| **"Removed server-side storage of personal AI keys (BYOK), purged legacy plaintext tokens, and encrypted cloud integration tokens at rest"** | **PR #80** (`cbf38da`) + **PR #81** (`CredentialResetNotice` + `/api/vault/cloud/connections`) + migration `20261028010000_purge_plaintext_credentials.sql` | Run `PROD_CHECKS.md` Check `2.3` (`has_unencrypted_plaintext_rows = false` for both tables). |
| **"Rotated all platform infrastructure credentials and encryption keys, and purged repository commit history"** | **`ROTATION_RUNBOOK.md` Steps 1–7 & Section 5** (`F-01` rotation + `git filter-repo`) | **CRITICAL**: Because `encryptCloudToken` derives its key from `MASTER_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, do **not** claim credential rotation or full at-rest protection is complete until `ROTATION_RUNBOOK.md` is executed (omit bullet 4 in Section 4 below if sending before rotation). |
| **Actual Institutional ID Documents (`id-documents`) Inventory Check** | **`PROD_CHECKS.md` Check `1.6`** (`SELECT COUNT(*) AS id_doc_count, MIN(created_at) AS earliest, MAX(created_at) AS latest FROM storage.objects WHERE bucket_id = 'id-documents';`) | Run the query in Production Supabase SQL Editor before sending:<br>- If `id_doc_count = 0`: **Delete** the parenthetical mention of institutional ID verification documents in Section 2 below.<br>- If `id_doc_count > 0`: Keep the bullet and notify the exact users (`(storage.foldername(name))[1]`) whose files were present in `id-documents`.<br>**T5 result (2026-10-29):** production has only the `project-files` and `vault-files` buckets (both private, 0 objects) and no `id-documents` bucket, so delete the parenthetical. |

---

**Subject**: Important Security Notice — Action Recommended for Your Scholar Core Account

Dear Scholar Core User,

We are writing to inform you of a security issue we identified during an internal security audit of Scholar Core (`scholar.gkshah.com.np`), the steps we have taken to secure the platform, and a few precautions we recommend you take to protect your account and connected services.

### 1. What Happened and When
During a comprehensive security review initiated on **October 28, 2026**, we identified two areas of exposure:
1. **Infrastructure Credentials in Public Repository Commit History**: On **August 4, 2026** (commits `01f851f` and `28cfaa5`), setup documentation containing internal infrastructure credentials (including administrative database credentials and an application encryption key) was committed to our public source code repository. Although the files were deleted from the active branch on **August 5, 2026** (`643bf1f`) and **August 10, 2026** (`6c5943a`), git preserves historical commits, meaning those credentials remained accessible in the repository's commit history between **August 4, 2026** and **[PLACEHOLDER: Date of credential rotation & git history purge]**.
2. **Database, File Storage, and Token Protection Gaps**: Certain research workspace records introduced on **August 17, 2026** (generated research gap analyses, candidate manuscript titles, and target journal lists) and the storage area introduced on **August 20, 2026** holding uploaded project documents lacked strict per-user access policies, meaning an unauthorized party with knowledge of our public API endpoint could potentially query those records or download uploaded project files. In addition, personal AI provider API keys saved in account settings (available since **July 21, 2026**) and connection tokens for third-party cloud drives (Google Drive, Microsoft OneDrive, Zotero, and Mendeley, available since **August 25, 2026**) were stored in the database without encryption at rest.

### 2. What Information Was Potentially Involved
Depending on how you used Scholar Core between **July 21, 2026** (or **August 4, 2026** for administrative credential exposure) and **[PLACEHOLDER: Date all database migrations & credential rotations are deployed]**, the following information could have been accessible if an unauthorized party exploited these exposures:
- **Account profile information**: Your name, username, email address, phone number, and institutional affiliation **[INCLUDE ONLY IF `PROD_CHECKS.md` Check 1.6 shows `id_doc_count > 0`: , as well as institutional ID verification documents uploaded on August 13, 2026 (between commits `b44484b` and `ffb3384`)]**.
- **Research workspace content**: Your projects, manuscript drafts, notes, citations, research gap analyses, and documents uploaded to your projects.
- **Saved personal AI API keys (Bring-Your-Own-Key / BYOK)**: Any third-party AI provider API key you previously saved in your Scholar Core account settings.
- **Cloud integration connection tokens**: OAuth access and refresh tokens if you connected **Google Drive**, **Microsoft OneDrive**, **Zotero**, or **Mendeley** to your Scholar Core Vault.

*(Note: Scholar Core does not process or store payment card numbers or bank account details.)*

### 3. Findings from Our Forensic Investigation
**[PLACEHOLDER — Choose Option A or Option B after running `COMPROMISE_CHECKS.md`]:**
- *[Option A — If no unauthorized access is found]*: We conducted a forensic review of our database audit logs, authentication records, storage buckets, and infrastructure logs dating back to August 4, 2026. **We found no evidence that these credentials or access gaps were exploited by any unauthorized third party.**
- *[Option B — If anomalous activity is identified]*: Our review of logs between August 4, 2026 and **[PLACEHOLDER: Audit completion date]** identified `[PLACEHOLDER: specific scope/dates of anomalous access]`.

### 4. What We Have Done to Fix This
We have deployed the following security updates:
- **Enforced Strict Authentication & Project Ownership Checks**: Every API endpoint, search route, and file upload/download action now verifies your signed-in session and confirms that you own the project being accessed.
- **Locked Down Database Records & Private File Storage**: We enabled per-user access controls across all research workspace tables, converted all file storage to private access served only via short-lived signed download links, and restricted account lookup endpoints so email addresses and phone numbers cannot be enumerated.
- **Eliminated Server Storage of Personal AI Keys & Purged Plaintext Tokens**: Personal AI API keys (BYOK) are no longer stored in our database; all previously stored personal AI keys and unencrypted cloud drive connection tokens have been deleted from our database, and newly connected cloud storage tokens are encrypted at rest.
- **[INCLUDE AFTER `ROTATION_RUNBOOK.md` IS COMPLETED: Rotated Platform Credentials & Purged Repository History]**: We rotated all database passwords, administrative service keys, and encryption keys, and permanently scrubbed the historical commits from our source code repository.

### 5. What You Should Do Now
Out of an abundance of caution, we strongly recommend taking the following steps:

1. **Rotate Any Personal AI Provider API Keys (BYOK) You Used in Scholar Core**:
   - If you ever entered a personal API key (such as OpenAI, Anthropic Claude, Google Gemini, OpenRouter, xAI (Grok), Qwen, DeepSeek, Groq, Mistral, or any other provider in AI Access) into Scholar Core:
     - Log in to that AI provider's dashboard and **revoke/delete the old API key immediately**, then generate a new key if needed.
     - Please note that when you use a personal (BYOK) API key in Scholar Core, your key is kept in your browser for the active session and sent over HTTPS to our backend server on each AI request so our server can relay the request to the AI provider.
2. **Revoke and Reconnect Google Drive, Microsoft OneDrive, Zotero, or Mendeley (If Connected)**:
   - Because we have cleared previously stored cloud connection tokens as a security precaution, you will need to reconnect your cloud integration the next time you use it. Before reconnecting, we recommend revoking the previous authorization in your provider's account settings:
     - **Google Drive**: Visit [https://myaccount.google.com/connections](https://myaccount.google.com/connections), select **Scholar Core** (or the corresponding OAuth app), and click **Delete all connections you have with Scholar Core**. Review your Google Drive activity log for any unfamiliar file access since August 4, 2026.
     - **Microsoft OneDrive**: Visit [https://account.live.com/consent/Manage](https://account.live.com/consent/Manage) (for personal Microsoft accounts) or [https://myapps.microsoft.com](https://myapps.microsoft.com) (for work/school accounts), locate the Scholar Core application, and remove its permissions.
     - **Zotero / Mendeley**: Visit [https://www.zotero.org/settings/keys](https://www.zotero.org/settings/keys) or your Elsevier/Mendeley account settings and revoke any API key or token previously used with Scholar Core.
3. **Update Your Scholar Core Password (If Reused Elsewhere)**:
   - Account passwords in Scholar Core are hashed by our authentication provider and were never stored in plaintext. However, if you reuse your Scholar Core password on other websites, we recommend changing your password in **Account Settings → Security** (or via **Forgot Password** on the sign-in screen).

### 6. Questions or Assistance
If you have any questions or need assistance rotating your keys or reviewing your account activity, please reply directly to this email or contact us at **[PLACEHOLDER: support/security email, e.g., doc.govinda@gmail.com]**.

We take our responsibility to safeguard your academic work seriously and sincerely apologize for the inconvenience and concern this causes.

Sincerely,  
**[PLACEHOLDER: Name / Title]**  
Scholar Core (`scholar.gkshah.com.np`)
