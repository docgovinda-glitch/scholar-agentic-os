# Backend Stack
Express.js handles local dev and proxying. `api/generate.ts` provides serverless proxying on Vercel. Both use an identical `fetchWithRetry` pattern for resilience.