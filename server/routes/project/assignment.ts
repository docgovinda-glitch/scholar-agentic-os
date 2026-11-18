import express from "express";
import { rejectClientCredentials } from "../../src/middleware/rejectClientCredentials.ts";
import extractRoutes from "./assignment/extractRoutes.ts";
import draftingRoutes from "./assignment/draftingRoutes.ts";
import submissionRoutes from "./assignment/submissionRoutes.ts";
import agentRoutes from "./assignment/agentRoutes.ts";
import buildRoutes from "./assignment/buildRoutes.ts";

export {
  isCorruptedOutlineHeadings,
  healCorruptedProjectStructure,
  deriveHeuristicTitle,
  autoUpdateProjectTitleIfUntitled,
} from "./assignment/helpers.ts";

const router = express.Router({ mergeParams: true });
router.use(rejectClientCredentials);

router.use(extractRoutes);
router.use(draftingRoutes);
router.use(submissionRoutes);
router.use(agentRoutes);
router.use(buildRoutes);

export default router;
