# Draft Security Notice to Users (`USER_NOTICE.md`)

> **Owner Editorial & Legal Note (Remove Before Sending)**:
> - **Status**: DRAFT — prepared for owner review. Do **not** send until you have completed the forensic checks in `COMPROMISE_CHECKS.md` and filled in the `[PLACEHOLDER]` sections below.
> - **Legal Notification Obligations**: Statutory breach-notification timelines and content requirements depend on the jurisdictions where affected users reside (for example: GDPR Article 34 for EU/EEA/UK residents when there is a high risk to rights and freedoms; US state data-breach statutes; Nepal's Individual Privacy Act 2075 / Electronic Transactions Act; or institutional research data agreements). Verify applicable legal obligations based on your user base's jurisdictions before sending.

---

**Subject**: Important Security Notice — Action Recommended for Your Scholar Core Account

Dear Scholar Core User,

We are writing to inform you of a security issue we identified during an internal security audit of Scholar Core (`scholar.gkshah.com.np`), the steps we have already taken to lock down the platform, and a few simple precautions we recommend you take to protect your account and connected services.

### 1. What Happened and When
During a comprehensive security review on **October 28, 2026**, we discovered two categories of exposure:
1. **Infrastructure Configuration Files in Public Repository History**: On **August 4, 2026**, setup documentation containing internal service credentials (including database administrative credentials and an encryption key) was briefly committed to our public source code repository before being removed from the active branch. Because git preserves historical commits, those credentials remained visible in the repository's commit history between **August 4, 2026** and **[PLACEHOLDER: Date of credential rotation & git history purge]**.
2. **Database & Storage Access Controls**: Certain research workspace metadata tables (`project_research_gaps`, `project_titles`, `project_journal_candidates`) and the `project-files` storage bucket lacked strict per-user Row Level Security policies, meaning an unauthorized party with knowledge of our public API endpoint could potentially query or access uploaded project files. Additionally, third-party API keys saved in account settings (`api_credentials`) and cloud storage OAuth tokens (`user_cloud_integrations` for Google Drive and Microsoft OneDrive) were stored without server-side encryption at rest.

### 2. What Information Was Potentially Involved
Depending on how you used Scholar Core between **August 4, 2026** and **October 28, 2026**, the following data could have been accessible if an unauthorized party exploited these exposures:
- Account profile details (name, username, email address, phone number, institutional affiliation, and—if submitted during early August 2026—institutional ID verification documents).
- Research project content, manuscripts, citations, and files uploaded to your projects.
- Third-party AI provider API keys (Bring-Your-Own-Key / BYOK credentials) if you saved them in your account settings.
- OAuth access/refresh tokens if you connected your **Google Drive** or **Microsoft OneDrive** account to the Scholar Core Vault.

*(Note: Scholar Core does not process or store payment card numbers or banking details.)*

### 3. Findings from Our Forensic Investigation
**[PLACEHOLDER — Choose Option A or Option B after running `COMPROMISE_CHECKS.md`]:**
- *[Option A — If no unauthorized access is found]*: We conducted a forensic review of our database audit logs, authentication records, storage buckets, and infrastructure logs dating back to August 4, 2026. **We found no evidence that these credentials or access gaps were exploited by any unauthorized third party.**
- *[Option B — If anomalous activity is identified]*: Our review of logs between August 4, 2026 and October 28, 2026 identified `[PLACEHOLDER: specific scope/dates of anomalous access]`.

### 4. What We Have Done to Fix This
We have implemented the following security measures to protect your data:
- **Enforced Strict Authentication & Project Ownership Checks**: Every API route, file upload/download endpoint, and project workspace now enforces strict server-side user authentication and project ownership verification.
- **Locked Down Database Tables & File Storage**: We enabled Row Level Security across all project tables, converted all storage buckets (`project-files` and `id-documents`) to private server-mediated access with short-lived signed links, and restricted account lookup functions so email addresses and phone numbers cannot be enumerated.
- **Upgraded Credential Protection**: **[PLACEHOLDER — Confirm once Task 4.7 & Task 5 land]** We have encrypted all stored integration tokens at rest, updated our BYOK key handling, and rotated all platform infrastructure credentials and encryption keys.

### 5. What You Should Do Now
Out of an abundance of caution, we strongly recommend taking the following steps:

1. **Rotate Any Saved AI Provider API Keys (BYOK)**:
   - If you ever entered a personal API key (such as OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, or Mistral) into Scholar Core:
     - Log in to that provider's dashboard and **revoke/delete the old API key immediately**, then generate a new key if needed.
     - Please note that when you use a personal (BYOK) API key in Scholar Core, your key is transmitted through our backend server on each AI request so our server can relay the call to the AI provider.
2. **Review and Reconnect Google Drive or Microsoft OneDrive (If Connected)**:
   - If you connected **Google Drive** or **Microsoft OneDrive** to the Scholar Core Vault:
     - **Google Drive**: Visit [https://myaccount.google.com/connections](https://myaccount.google.com/connections), select **Scholar Core** (or the corresponding OAuth app), and click **Delete all connections you have with Scholar Core**. Review your Google Drive activity log for any unfamiliar file access since August 4, 2026.
     - **Microsoft OneDrive**: Visit [https://account.live.com/consent/Manage](https://account.live.com/consent/Manage), locate the Scholar Core application, and click **Remove these permissions**.
     - You may reconnect your cloud drive inside Scholar Core once you are ready.
3. **Update Your Scholar Core Password (Optional but Recommended)**:
   - If you reuse your Scholar Core password on any other service, please change your password both on Scholar Core (via **Forgot Password** on the sign-in screen) and on those other websites.

### 6. Questions or Assistance
If you have any questions or need assistance rotating your keys or reviewing your account activity, please reply directly to this email or contact us at **[PLACEHOLDER: support/security email, e.g., doc.govinda@gmail.com]**.

We take our responsibility to safeguard your academic work seriously and sincerely apologize for the inconvenience and concern this causes.

Sincerely,  
**[PLACEHOLDER: Name / Title]**  
Scholar Core (`scholar.gkshah.com.np`)
