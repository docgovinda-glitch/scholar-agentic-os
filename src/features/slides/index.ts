export * from './types/slides';
export * from './types/themes';
export {
  condenseToSixWords,
  extractSlidesFromAcademicText,
} from './services/semanticSlideExtractor';
export * from './services/universalDecomposer';
export * from './services/slideGenerator';
export * from './services/slideReplicaService';
export { default as SlideCanvas } from './components/SlideCanvas';

// 4-Step Apple/Airbnb Presentation Studio Workflow
export { default as Step01Understand } from './components/Step01Understand';
export { default as Step02Design } from './components/Step02Design';
export { default as Step03EditSlides } from './components/Step03EditSlides';
export { default as Step04Present } from './components/Step04Present';

export * from './services/imagePaletteExtractor';
export * from './hooks/usePresentationShortcuts';

// Gamma card engine: renderer, layouts, themes, .pptx export, presenter
export * from './gamma';

// Theme Studio & Copilot Components
export { default as AskScholarPresentationDrawer } from './components/AskScholarPresentationDrawer';
export { default as PresentationHeader } from './components/PresentationHeader';
export { default as AudienceQaSimulator, type AudienceQaQuestion, type AudienceQaSimulatorProps } from './components/AudienceQaSimulator';
export * from './services/deckProgressionService';
export * from './services/slideMutationService';
export * from './services/blankSheetService';
export * from './services/deckRecreatorService';

