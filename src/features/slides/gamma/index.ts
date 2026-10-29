export * from './theme';
export * from './content';
export { computeCardGeometry, CANVAS_W, CANVAS_H, type CardGeometry, type CardElement } from './geometry';
export { GammaCard, GammaSlide, useFontsVersion, type GammaCardProps, type GammaSlideProps } from './GammaCard';
export { exportDeckToPptx, buildDeckPptx, pptxFileName } from './pptxExport';
