# Production Deployment Guide — Scholar Agentic Operating System

This document outlines the environmental configurations and steps required to host Scholar in production environments (e.g., Render for Backend + DB, Netlify for Frontend). See `render.yaml` and `netlify.toml` at the repo root for the corresponding provider config.

---

## 🏛 Required Environment Variables

To make the application functional, the following environment variables must be configured in the cloud provider's console:

| Variable | Scope | Description |
|---|---|---|
| `DATABASE_URL` | Backend | Connection string to the PostgreSQL database (used to initialize approvals and settings tables). |
| `ENCRYPTION_KEY` | Backend | A secure, random 32-character string used as the symmetric encryption key for storing API credentials. |
| `RESEND_API_KEY` | Backend | Resend API gateway key (used to dispatch onboarding activation key emails to scholars). |
| `GEMINI_API_KEY` | Backend | Primary Google Gemini key (used for default server generation & special routing fallback). |
| `GEMINI_API_KEY_BACKUP` | Backend | Secondary Google Gemini key (enables load-balancing and redundancy). |
| `PORT` | Backend | Port number to bind the Express application to (defaults to `3000`). |

---

## 🚀 Step-by-Step Cloud Deployment

### 1. Database Initialization
1. Deploy a PostgreSQL instance (e.g., via Render Database, Supabase, or AWS RDS).
2. Execute the DDL schema commands from [`database_schema.sql`](database_schema.sql) to initialize the `admin_approvals` and `model_preferences` tables.
3. Retrieve the Postgres connection string and copy it to the `DATABASE_URL` env variable.

### 2. Backend Service (Render Deployment)
1. Link your repository to Render.
2. Select **Web Service** and choose **Node** environment.
3. Set the build command to `npm install && npm run build`.
4. Set the start command to `npm start`.
5. Add the required environment variables listed in the table above.
6. Trigger the deployment. Once deployed, note down the backend domain name (e.g., `https://scholar-assistant-backend.onrender.com`).

### 3. Frontend Service (Netlify Deployment)
1. Link your repository to Netlify.
2. The build settings should automatically read from [`netlify.toml`](netlify.toml):
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
3. Configure Single Page Application redirection rules (configured automatically in `netlify.toml`).
4. Trigger the build and deploy.

---

## 🔒 Security & Admin Validation
- Users who sign up will be placed in the **Admin Queue** with `is_approved: false`.
- The administrator must trigger approval by clicking the `/api/approve` link dispatched to the admin email, which flips `is_approved` to `true` and emails the scholar their Activation Key.
