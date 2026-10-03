export * from './types/slides';
export * from './types/themes';
export {
  condenseToSixWords,
  extractSlidesFromAcademicText,
} from './services/semanticSlideExtractor';
export * from './services/universalDecomposer';
export * from './services/slideGenerator';
export { default as SlideCanvas } from './components/SlideCanvas';
export { default as SlideCardBlock } from './components/SlideCardBlock';
export { default as PresentationController } from './components/PresentationController';
export { default as KeynoteController } from './components/KeynoteController'; // Deprecated alias
export { default as Step01Understand } from './components/Step01Understand';
export { default as Step01Scaffolding } from './components/Step01Scaffolding'; // Deprecated alias
export { default as Step02ThemeTemplate } from './components/Step02ThemeTemplate';
export { default as Step03StudioCanvas } from './components/Step03StudioCanvas';
export { default as Step04Delivery } from './components/Step04Delivery';
export * from './hooks/usePresentationShortcuts';
export * from './hooks/useKeynoteShortcuts'; // Deprecated alias
