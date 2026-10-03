/**
 * Step02ThemeTemplate (Re-exporting Step02Design for Apple/Airbnb 4-Theme Workflow)
 */
import Step02Design, {
  type Step02DesignProps,
  CURATED_FOUR_THEMES,
  CURATED_ACCENT_DOTS,
} from './Step02Design';

export {
  Step02Design,
  type Step02DesignProps,
  type Step02DesignProps as Step02ThemeTemplateProps,
  CURATED_FOUR_THEMES,
  CURATED_FOUR_THEMES as FOUR_CLEAN_PRESETS,
  CURATED_ACCENT_DOTS,
};

export default Step02Design;
