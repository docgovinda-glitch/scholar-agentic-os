/**
 * Authentication middleware for Pocket API
 * Verifies Supabase JWT tokens and adds user context to requests
 */

import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.slice(7);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      res.status(500).json({ error: "Auth service not configured" });
      return;
    }

    // Use Supabase server client to verify JWT
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Attach user to request
    (req as any).user = {
      id: data.user.id,
      email: data.user.email,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}
