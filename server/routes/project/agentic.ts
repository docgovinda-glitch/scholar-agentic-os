import express from "express";
import { rejectClientCredentials } from "../../src/middleware/rejectClientCredentials.ts";
import { registerProtocolHandlers } from "./agentic/protocolHandlers.ts";
import { registerEvidenceHandlers } from "./agentic/evidenceHandlers.ts";
import { registerDraftingHandlers } from "./agentic/draftingHandlers.ts";
import { registerRefereeHandlers } from "./agentic/refereeHandlers.ts";
import { registerExportHandlers } from "./agentic/exportHandlers.ts";

export * from "./agentic/types.ts";

const router = express.Router({ mergeParams: true });
router.use(rejectClientCredentials);

registerProtocolHandlers(router);
registerEvidenceHandlers(router);
registerDraftingHandlers(router);
registerRefereeHandlers(router);
registerExportHandlers(router);

export { router as agenticRouter };
export default router;
