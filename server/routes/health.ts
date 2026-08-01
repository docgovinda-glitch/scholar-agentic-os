import express from "express";

export function registerHealthRoutes(app: express.Express): void {
  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      geminiKeySet: !!process.env.GEMINI_API_KEY
    });
  });
}
