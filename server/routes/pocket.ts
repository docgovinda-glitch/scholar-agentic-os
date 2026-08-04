/**
 * Pocket API Routes — Mobile-first approval queue, comments, chat, and sync
 * Handles: approvals, comments, chat streaming, push subscriptions, offline sync
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../src/middleware/auth.ts";
import { pool } from "../src/db.ts";

const router = Router();

// Middleware: require authentication for all Pocket endpoints
router.use(requireAuth);

/**
 * POST /api/pocket/projects/:projectId/approve-source
 * Submit an approval/rejection/deferral decision for a source
 */
router.post("/projects/:projectId/approve-source", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { sourceId, decision } = req.body;
    const userId = (req as any).user.id;

    // Validate decision
    if (!["approved", "rejected", "deferred"].includes(decision)) {
      return res.status(400).json({ error: "Invalid decision" });
    }

    // Check user owns project
    const projectCheck = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ error: "Project not found or access denied" });
    }

    // Upsert approval decision
    const result = await pool.query(
      `INSERT INTO pocket_approvals (project_id, source_id, user_decision, decided_at, user_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (project_id, source_id) DO UPDATE
       SET user_decision = EXCLUDED.user_decision, decided_at = NOW()
       RETURNING *`,
      [projectId, sourceId, decision, userId]
    );

    // If approved, add to corpus
    if (decision === "approved") {
      await pool.query(
        `INSERT INTO sources (project_id, external_id, approved_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        [projectId, sourceId]
      );
    }

    res.json({
      success: true,
      approval: result.rows[0],
      message: `Source ${decision}`,
    });
  } catch (error) {
    console.error("Approval error:", error);
    res.status(500).json({ error: "Failed to process approval" });
  }
});

/**
 * POST /api/pocket/documents/:docId/comments
 * Create a new comment on a document section
 */
router.post("/documents/:docId/comments", async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const { text, sectionId } = req.body;
    const userId = (req as any).user.id;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Comment text required" });
    }

    // Check user has access to document
    const docCheck = await pool.query(
      `SELECT id FROM documents
       WHERE id = $1 AND project_id IN (
         SELECT id FROM projects WHERE user_id = $2
       )`,
      [docId, userId]
    );

    if (docCheck.rows.length === 0) {
      return res.status(403).json({ error: "Document not found or access denied" });
    }

    // Create comment
    const result = await pool.query(
      `INSERT INTO pocket_comments (document_id, user_id, text, section_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, text, section_id, created_at, user_id`,
      [docId, userId, text, sectionId || null]
    );

    res.status(201).json({
      comment: result.rows[0],
    });
  } catch (error) {
    console.error("Comment creation error:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
});

/**
 * GET /api/pocket/documents/:docId/comments
 * Retrieve all comments for a document
 */
router.get("/documents/:docId/comments", async (req: Request, res: Response) => {
  try {
    const { docId } = req.params;
    const userId = (req as any).user.id;

    // Check access
    const docCheck = await pool.query(
      `SELECT id FROM documents
       WHERE id = $1 AND project_id IN (
         SELECT id FROM projects WHERE user_id = $2
       )`,
      [docId, userId]
    );

    if (docCheck.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get comments
    const result = await pool.query(
      `SELECT id, text, section_id, created_at, updated_at, resolved, user_id
       FROM pocket_comments
       WHERE document_id = $1
       ORDER BY created_at DESC`,
      [docId]
    );

    res.json({
      comments: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Comment retrieval error:", error);
    res.status(500).json({ error: "Failed to retrieve comments" });
  }
});

/**
 * PATCH /api/pocket/comments/:commentId
 * Resolve or update a comment
 */
router.patch("/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { resolved, text } = req.body;
    const userId = (req as any).user.id;

    // Check ownership
    const comment = await pool.query(
      "SELECT user_id FROM pocket_comments WHERE id = $1",
      [commentId]
    );

    if (comment.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Can only edit your own comments" });
    }

    // Update comment
    const updates: string[] = [];
    const values: any[] = [commentId];
    let paramCount = 1;

    if (resolved !== undefined) {
      updates.push(`resolved = $${++paramCount}`);
      values.push(resolved);
    }

    if (text !== undefined) {
      updates.push(`text = $${++paramCount}`);
      values.push(text);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    updates.push("updated_at = NOW()");

    const result = await pool.query(
      `UPDATE pocket_comments
       SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING *`,
      values
    );

    res.json({ comment: result.rows[0] });
  } catch (error) {
    console.error("Comment update error:", error);
    res.status(500).json({ error: "Failed to update comment" });
  }
});

/**
 * POST /api/pocket/chat/stream
 * Stream chat responses for a project conversation
 * Uses Server-Sent Events for streaming
 */
router.post("/chat/stream", async (req: Request, res: Response) => {
  try {
    const { projectId, messages } = req.body;
    const userId = (req as any).user.id;

    if (!projectId || !messages || messages.length === 0) {
      return res.status(400).json({ error: "projectId and messages required" });
    }

    // Check access
    const project = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(403).json({ error: "Project not found or access denied" });
    }

    // Store user message
    const lastMessage = messages[messages.length - 1];
    await pool.query(
      `INSERT INTO pocket_chat_messages (project_id, user_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [projectId, userId, lastMessage.role, lastMessage.content]
    );

    // Setup SSE response headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Stream mock response chunks (in production, call Claude API here)
    const mockResponse =
      "I've analyzed your research. Based on the documents you've submitted, here are key insights: " +
      "Your thesis structure appears solid. I recommend strengthening the literature review section " +
      "with 2-3 more recent sources. The methodology is clear and reproducible.";

    // Split into chunks and stream
    const chunks = mockResponse.match(/.{1,15}/g) || [];

    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate streaming delay
    }

    // Store assistant response
    await pool.query(
      `INSERT INTO pocket_chat_messages (project_id, user_id, role, content, created_at)
       VALUES ($1, $2, 'assistant', $3, NOW())`,
      [projectId, userId, mockResponse]
    );

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Chat stream error:", error);
    res.status(500).json({ error: "Failed to stream chat response" });
  }
});

/**
 * GET /api/pocket/chat/:projectId
 * Retrieve chat history for a project
 */
router.get("/chat/:projectId", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Check access
    const project = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get messages
    const result = await pool.query(
      `SELECT id, role, content, created_at
       FROM pocket_chat_messages
       WHERE project_id = $1
       ORDER BY created_at ASC
       LIMIT 100`,
      [projectId]
    );

    res.json({
      messages: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Chat retrieval error:", error);
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
});

/**
 * POST /api/pocket/push/subscribe
 * Register a device for push notifications
 */
router.post("/push/subscribe", async (req: Request, res: Response) => {
  try {
    const { subscription } = req.body;
    const userId = (req as any).user.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Valid subscription object required" });
    }

    // Store subscription
    await pool.query(
      `INSERT INTO pocket_push_subscriptions
       (user_id, endpoint, auth_key, p256dh_key, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, endpoint) DO NOTHING`,
      [
        userId,
        subscription.endpoint,
        subscription.keys?.auth || "",
        subscription.keys?.p256dh || "",
      ]
    );

    res.json({
      success: true,
      message: "Subscription registered",
    });
  } catch (error) {
    console.error("Push subscription error:", error);
    res.status(500).json({ error: "Failed to register subscription" });
  }
});

/**
 * POST /api/pocket/sync/actions
 * Sync offline queue of actions (approvals, comments, etc.)
 */
router.post("/sync/actions", async (req: Request, res: Response) => {
  try {
    const { actions } = req.body;
    const userId = (req as any).user.id;

    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ error: "actions array required" });
    }

    const results = { synced: 0, failed: 0 };

    for (const action of actions) {
      try {
        if (action.type === "approve") {
          await pool.query(
            `INSERT INTO pocket_approvals (project_id, source_id, user_decision, decided_at, user_id)
             VALUES ($1, $2, $3, NOW(), $4)
             ON CONFLICT (project_id, source_id) DO UPDATE
             SET user_decision = EXCLUDED.user_decision`,
            [action.projectId, action.sourceId, action.decision, userId]
          );
          results.synced++;
        } else if (action.type === "comment") {
          await pool.query(
            `INSERT INTO pocket_comments (document_id, user_id, text, section_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [action.docId, userId, action.text, action.sectionId || null]
          );
          results.synced++;
        }
      } catch (actionError) {
        console.error("Action sync failed:", actionError);
        results.failed++;
      }
    }

    res.json({
      synced: results.synced,
      failed: results.failed,
      total: actions.length,
    });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Failed to sync actions" });
  }
});

/**
 * GET /api/pocket/projects/:projectId/approval-queue
 * Get approval queue status for a project
 */
router.get("/projects/:projectId/approval-queue", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Check access
    const project = await pool.query(
      "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
      [projectId, userId]
    );

    if (project.rows.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get queue stats
    const stats = await pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN user_decision = 'approved' THEN 1 ELSE 0 END) as approved,
         SUM(CASE WHEN user_decision = 'rejected' THEN 1 ELSE 0 END) as rejected,
         SUM(CASE WHEN user_decision IS NULL THEN 1 ELSE 0 END) as pending
       FROM pocket_approvals
       WHERE project_id = $1`,
      [projectId]
    );

    res.json({
      projectId,
      stats: stats.rows[0],
    });
  } catch (error) {
    console.error("Queue stats error:", error);
    res.status(500).json({ error: "Failed to get queue stats" });
  }
});

/**
 * Register Pocket routes with Express app
 */
export function registerPocketRoutes(app: any) {
  app.use("/api/pocket", router);
}

export default router;
