import express from "express";
import { rejectClientCredentials } from "../../src/middleware/rejectClientCredentials.ts";
import extractRoutes from "./assignment/extractRoutes.ts";
import understandRoutes from "./assignment/understandRoutes.ts";
import sourcesRoutes from "./assignment/sourcesRoutes.ts";
import draftingRoutes from "./assignment/draftingRoutes.ts";
import submissionRoutes from "./assignment/submissionRoutes.ts";

export {
  isCorruptedOutlineHeadings,
  healCorruptedProjectStructure,
  deriveHeuristicTitle,
  deriveSemanticAcademicTitle,
  autoUpdateProjectTitleIfUntitled,
} from "./assignment/helpers.ts";

const router = express.Router({ mergeParams: true });
router.use(rejectClientCredentials);

router.use(extractRoutes);
router.use(understandRoutes);
router.use(sourcesRoutes);
router.use(draftingRoutes);
router.use(submissionRoutes);

export default router;
