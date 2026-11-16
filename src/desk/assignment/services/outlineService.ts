/**
 * Public entry point of the Coursework (OT-01) outline engine. Pure TypeScript,
 * no React. Its parts live in focused modules:
 *
 *   dynamicStructure   generateDynamicAssignmentStructure (the brief-grounded outline)
 *   briefOutlineSpecs  buildBriefSpecificSpecs (one heading spec per question of the brief)
 *   adaptiveOutline    generateAdaptiveDefaultOutline (section list for the drafting stage)
 *   briefSemantics     reading the brief: question semantics, inquiries, headings, titles
 *   outlineEditing     the student's outline edits (add/remove/reorder/budget/frameworks)
 *   outlineTree        AssignmentStructure <-> outline tree, heading sanitising
 *
 * New code may import a module directly; this file keeps older imports working.
 */
export * from "./adaptiveOutline";
export * from "./briefOutlineSpecs";
export * from "./briefSemantics";
export * from "./dynamicStructure";
export * from "./outlineEditing";
export * from "./outlineTree";
