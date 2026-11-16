import { allocateCleanWords } from "../../../domain/assignment/outlineBudget";
import type { AssignmentStructure, AssignmentSubheading, AssignmentMainHeading } from "../types";


/**
 * Add a new main heading to the structure.
 */

export function addMainHeading(
  structure: AssignmentStructure,
  title?: string
): AssignmentStructure {
  const nextNumber = structure.headings.length + 1;
  const headingId = `heading-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const defaultTitle = title?.trim() || `Analytical Component ${nextNumber}`;

  const defaultSub1: AssignmentSubheading = {
    id: `sub-${nextNumber}-1`,
    headingId,
    numberStr: `${nextNumber}.1`,
    title: `${defaultTitle}: Core Scope & Theoretical Grounding`,
    targetWordCount: 200,
    currentWordCount: 0,
    notes: "",
    guidance: `Foundational scope and theoretical grounding for ${defaultTitle}.`,
    keyPoints: ["Core definitions", "Analytical scope"],
    researchStatus: "not_researched",
    sourcesCount: 0,
    boundSourceIds: [],
    draftContent: "",
    draftStatus: "not_started",
  };

  const defaultSub2: AssignmentSubheading = {
    id: `sub-${nextNumber}-2`,
    headingId,
    numberStr: `${nextNumber}.2`,
    title: `${defaultTitle}: Empirical Analysis & Critical Evidence`,
    targetWordCount: 250,
    currentWordCount: 0,
    notes: "",
    guidance: `Empirical evaluation and evidence synthesis for ${defaultTitle}.`,
    keyPoints: ["Empirical findings", "Critical assessment"],
    researchStatus: "not_researched",
    sourcesCount: 0,
    boundSourceIds: [],
    draftContent: "",
    draftStatus: "not_started",
  };

  const newHeading: AssignmentMainHeading = {
    id: headingId,
    number: nextNumber,
    title: defaultTitle,
    notes: "",
    targetWordCount: 450,
    subheadings: [defaultSub1, defaultSub2],
  };

  const updatedHeadings = [...structure.headings, newHeading];
  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}
/**
 * Remove a main heading and renumber remaining headings.
 */

export function removeMainHeading(
  structure: AssignmentStructure,
  headingId: string
): AssignmentStructure {
  const remaining = structure.headings.filter((h) => h.id !== headingId);
  const renumbered = remaining.map((h, hIdx) => {
    const nextNum = hIdx + 1;
    const updatedSubs = h.subheadings.map((s, sIdx) => ({
      ...s,
      numberStr: `${nextNum}.${sIdx + 1}`,
    }));
    return {
      ...h,
      number: nextNum,
      subheadings: updatedSubs,
    };
  });

  const nextAllocated = renumbered.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: renumbered,
  };
}
/**
 * Update main heading title.
 */

export function updateMainHeadingTitle(
  structure: AssignmentStructure,
  headingId: string,
  title: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => (h.id === headingId ? { ...h, title } : h));
  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}
/**
 * Adjust an individual heading's word count (+50, -50, or direct number input)
 * and proportionally distribute the new budget across its subheadings.
 */

export function adjustHeadingWordCount(
  structure: AssignmentStructure,
  headingId: string,
  deltaOrExact: number | { exact: number; } | { delta: number; }
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    if (h.id !== headingId) return h;
    let newHeadingTotal: number;
    if (typeof deltaOrExact === "object" && "exact" in deltaOrExact) {
      newHeadingTotal = Math.max(0, Math.round(deltaOrExact.exact));
    } else if (typeof deltaOrExact === "object" && "delta" in deltaOrExact) {
      newHeadingTotal = Math.max(0, h.targetWordCount + deltaOrExact.delta);
    } else if (typeof deltaOrExact === "number") {
      if (deltaOrExact === 50 || deltaOrExact === -50 || deltaOrExact === 100 || deltaOrExact === -100 || deltaOrExact < 0) {
        newHeadingTotal = Math.max(0, h.targetWordCount + deltaOrExact);
      } else if (deltaOrExact >= 50) {
        newHeadingTotal = Math.max(0, Math.round(deltaOrExact));
      } else {
        newHeadingTotal = Math.max(0, h.targetWordCount + deltaOrExact);
      }
    } else {
      newHeadingTotal = h.targetWordCount;
    }

    if (h.subheadings.length === 0) {
      return { ...h, targetWordCount: newHeadingTotal };
    }

    const currentTotal = h.subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);
    let allocatedSoFar = 0;
    const updatedSubs = h.subheadings.map((s, idx) => {
      const isLast = idx === h.subheadings.length - 1;
      const ratio = currentTotal > 0 ? s.targetWordCount / currentTotal : 1 / h.subheadings.length;
      let subWords: number;
      if (isLast) {
        subWords = Math.max(0, newHeadingTotal - allocatedSoFar);
      } else {
        subWords = Math.max(0, Math.round(newHeadingTotal * ratio));
        allocatedSoFar += subWords;
      }
      return { ...s, targetWordCount: subWords };
    });

    const finalHeadingTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: finalHeadingTotal, subheadings: updatedSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);
  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}
/**
 * Add a new subheading to an existing main heading.
 */

export function addSubheading(
  structure: AssignmentStructure,
  headingId: string,
  title?: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    if (h.id !== headingId) return h;
    const subIdx = h.subheadings.length + 1;
    const subId = `sub-${h.number}-${subIdx}-${Date.now().toString(36).slice(-3)}`;
    const subTitle = title?.trim() || `Analytical Subsection ${h.number}.${subIdx}`;

    const newSub: AssignmentSubheading = {
      id: subId,
      headingId: h.id,
      numberStr: `${h.number}.${subIdx}`,
      title: subTitle,
      targetWordCount: 250,
      currentWordCount: 0,
      notes: "",
      guidance: `Develop reasoned analysis and evidence synthesis for ${subTitle}.`,
      keyPoints: ["Contextual evidence", "Critical analysis", "Synthesis"],
      researchStatus: "not_researched",
      sourcesCount: 0,
      boundSourceIds: [],
      draftContent: "",
      draftStatus: "not_started",
    };

    const nextSubs = [...h.subheadings, newSub];
    const hTotal = nextSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: nextSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}
/**
 * Remove a subheading and renumber remaining subheadings in that heading.
 */

export function removeSubheading(
  structure: AssignmentStructure,
  subheadingId: string
): AssignmentStructure {
  // A section keeps at least one part: with none, its budget would fall to 0
  // and the question it answers would be drafted with no words.
  const owner = structure.headings.find((h) => h.subheadings.some((s) => s.id === subheadingId));
  if (owner && owner.subheadings.length <= 1) return structure;

  const updatedHeadings = structure.headings.map((h) => {
    const remaining = h.subheadings.filter((s) => s.id !== subheadingId);
    if (remaining.length === h.subheadings.length) return h;

    const renumbered = remaining.map((s, idx) => ({
      ...s,
      numberStr: `${h.number}.${idx + 1}`,
    }));
    const hTotal = renumbered.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: renumbered };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}
/**
 * Update subheading title.
 */

export function updateSubheadingTitle(
  structure: AssignmentStructure,
  subheadingId: string,
  title: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => (s.id === subheadingId ? { ...s, title } : s));
    return { ...h, subheadings: updatedSubs };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}
/**
 * Update user instructions or research notes for a specific subheading.
 */

export function updateSubheadingNotes(
  structure: AssignmentStructure,
  subheadingId: string,
  notes: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => (s.id === subheadingId ? { ...s, notes } : s));
    return { ...h, subheadings: updatedSubs };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}
/**
 * Adjust an individual subheading's word count (+50, -50, or direct number input).
 */

export function adjustSubheadingWordCount(
  structure: AssignmentStructure,
  subheadingId: string,
  deltaOrExact: number | { exact: number; } | { delta: number; }
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    let touched = false;
    const updatedSubs = h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      touched = true;
      let nextWords: number;
      if (typeof deltaOrExact === "object" && "exact" in deltaOrExact) {
        nextWords = Math.max(0, Math.round(deltaOrExact.exact));
      } else if (typeof deltaOrExact === "object" && "delta" in deltaOrExact) {
        nextWords = Math.max(0, s.targetWordCount + deltaOrExact.delta);
      } else if (typeof deltaOrExact === "number") {
        if (deltaOrExact === 50 || deltaOrExact === -50 || deltaOrExact === 25 || deltaOrExact === -25 || deltaOrExact < 0) {
          nextWords = Math.max(0, s.targetWordCount + deltaOrExact);
        } else if (deltaOrExact >= 100) {
          nextWords = Math.max(0, Math.round(deltaOrExact));
        } else {
          nextWords = Math.max(0, s.targetWordCount + deltaOrExact);
        }
      } else {
        nextWords = s.targetWordCount;
      }
      return { ...s, targetWordCount: nextWords };
    });

    if (!touched) return h;
    const hTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: updatedSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}
/**
 * Reorder main headings (e.g., drag-and-drop or move up/down).
 */

export function reorderHeadings(
  structure: AssignmentStructure,
  sourceIdx: number,
  targetIdx: number
): AssignmentStructure {
  if (sourceIdx < 0 ||
    sourceIdx >= structure.headings.length ||
    targetIdx < 0 ||
    targetIdx >= structure.headings.length ||
    sourceIdx === targetIdx) {
    return structure;
  }

  const list = [...structure.headings];
  const [moved] = list.splice(sourceIdx, 1);
  list.splice(targetIdx, 0, moved);

  const renumbered = list.map((h, hIdx) => {
    const nextNum = hIdx + 1;
    const updatedSubs = h.subheadings.map((s, sIdx) => ({
      ...s,
      numberStr: `${nextNum}.${sIdx + 1}`,
    }));
    return {
      ...h,
      number: nextNum,
      subheadings: updatedSubs,
    };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: renumbered,
  };
}
/**
 * Reorder subheadings within a main heading.
 */

export function reorderSubheadings(
  structure: AssignmentStructure,
  headingId: string,
  sourceIdx: number,
  targetIdx: number
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    if (h.id !== headingId) return h;
    if (sourceIdx < 0 ||
      sourceIdx >= h.subheadings.length ||
      targetIdx < 0 ||
      targetIdx >= h.subheadings.length ||
      sourceIdx === targetIdx) {
      return h;
    }

    const list = [...h.subheadings];
    const [moved] = list.splice(sourceIdx, 1);
    list.splice(targetIdx, 0, moved);

    const renumbered = list.map((s, sIdx) => ({
      ...s,
      numberStr: `${h.number}.${sIdx + 1}`,
    }));

    return { ...h, subheadings: renumbered };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}
/**
 * Distribute unallocated remaining words evenly across all subheadings.
 */

export function distributeRemainingWords(
  structure: AssignmentStructure,
  targetWordCount?: number
): AssignmentStructure {
  const total = Math.max(200, Number(targetWordCount ?? structure.targetWordCount) || 2000);
  const allSubs = structure.headings.flatMap((h) => h.subheadings);
  if (allSubs.length === 0) return structure;

  const currentAllocated = allSubs.reduce((sum, s) => sum + (Number(s.targetWordCount) || 0), 0);
  const difference = total - currentAllocated;
  if (difference === 0) return structure;

  const perSub = Math.floor(difference / allSubs.length);
  let remainder = difference - perSub * allSubs.length;

  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => {
      const extra = perSub + (remainder !== 0 ? (remainder > 0 ? 1 : -1) : 0);
      if (remainder !== 0) remainder += remainder > 0 ? -1 : 1;
      const nextWordCount = Math.max(50, s.targetWordCount + extra);
      return { ...s, targetWordCount: nextWordCount };
    });
    const hTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: updatedSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    targetWordCount: total,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}
/**
 * Auto-balance all subheading word counts proportionally to match targetWordCount.
 */

export function autoBalanceStructure(
  structure: AssignmentStructure,
  targetWordCount: number
): AssignmentStructure {
  const total = Math.max(200, Number(targetWordCount) || 2000);
  const allSubs = structure.headings.flatMap((h) => h.subheadings);
  if (allSubs.length === 0) return structure;

  // Same proportions as before, in clean multiples that sum to the target exactly.
  const words = allocateCleanWords(allSubs.map((s) => Number(s.targetWordCount) || 1), total);
  let k = 0;
  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => ({ ...s, targetWordCount: words[k++] }));
    const hTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: updatedSubs };
  });

  return {
    ...structure,
    version: structure.version + 1,
    targetWordCount: total,
    totalAllocated: total,
    headings: updatedHeadings,
  };
}
/**
 * Keep one heading at the budget the student just set and fit every other
 * heading around it, so the total still equals the target. (Rescaling all
 * headings, edited one included, turned a "+50" click into about +30.)
 */

export function balanceAroundHeading(
  structure: AssignmentStructure,
  headingId: string,
  targetWordCount: number
): AssignmentStructure {
  const total = Math.max(200, Number(targetWordCount) || 2000);
  const pinned = structure.headings.find((h) => h.id === headingId);
  const others = structure.headings.filter((h) => h.id !== headingId);
  if (!pinned || others.length === 0) return autoBalanceStructure(structure, total);
  const otherSubs = others.flatMap((h) => h.subheadings);
  if (otherSubs.length === 0) return autoBalanceStructure(structure, total);
  const pinnedTotal = Math.min(
    Math.max(0, pinned.subheadings.reduce((n, s) => n + (Number(s.targetWordCount) || 0), 0)),
    total - otherSubs.length * 10
  );
  const words = allocateCleanWords(otherSubs.map((s) => Number(s.targetWordCount) || 1), total - pinnedTotal);
  let k = 0;
  const headings = structure.headings.map((h) => {
    if (h.id === headingId) return { ...h, targetWordCount: pinnedTotal };
    const subheadings = h.subheadings.map((s) => ({ ...s, targetWordCount: words[k++] }));
    return { ...h, subheadings, targetWordCount: subheadings.reduce((n, s) => n + s.targetWordCount, 0) };
  });
  return { ...structure, version: structure.version + 1, targetWordCount: total, totalAllocated: total, headings };
}
/**
 * Add an H3 specific argument, evidence, or focus point under a subheading.
 */

export function addKeyPoint(
  structure: AssignmentStructure,
  subheadingId: string,
  pointText: string
): AssignmentStructure {
  const clean = pointText.trim();
  if (!clean) return structure;

  const updatedHeadings = structure.headings.map((h) => ({
    ...h,
    subheadings: h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      const existing = s.keyPoints || [];
      return {
        ...s,
        keyPoints: [...existing, clean],
      };
    }),
  }));

  return {
    ...structure,
    headings: updatedHeadings,
    version: (structure.version || 1) + 1,
  };
}
/**
 * Update text of an H3 specific argument or focus point in a subheading.
 */

export function updateKeyPoint(
  structure: AssignmentStructure,
  subheadingId: string,
  pointIndex: number,
  newText: string
): AssignmentStructure {
  const clean = newText.trim();
  if (!clean) return structure;

  const updatedHeadings = structure.headings.map((h) => ({
    ...h,
    subheadings: h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      const existing = [...(s.keyPoints || [])];
      if (pointIndex >= 0 && pointIndex < existing.length) {
        existing[pointIndex] = clean;
      }
      return {
        ...s,
        keyPoints: existing,
      };
    }),
  }));

  return {
    ...structure,
    headings: updatedHeadings,
    version: (structure.version || 1) + 1,
  };
}
/**
 * Remove an H3 specific argument or focus point from a subheading.
 */

export function removeKeyPoint(
  structure: AssignmentStructure,
  subheadingId: string,
  pointIndex: number
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => ({
    ...h,
    subheadings: h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      const existing = s.keyPoints || [];
      return {
        ...s,
        keyPoints: existing.filter((_, idx) => idx !== pointIndex),
      };
    }),
  }));

  return {
    ...structure,
    headings: updatedHeadings,
    version: (structure.version || 1) + 1,
  };
}
/** Add a single target framework */

export function addTargetFramework(
  structure: AssignmentStructure,
  framework: string
): AssignmentStructure {
  const trimmed = framework.trim();
  if (!trimmed) return structure;
  const current = Array.isArray(structure.targetFrameworks) ? structure.targetFrameworks : [];
  if (current.includes(trimmed)) return structure;
  return {
    ...structure,
    targetFrameworks: [...current, trimmed],
  };
}
/** Remove a target framework by index */

export function removeTargetFramework(
  structure: AssignmentStructure,
  frameworkIndex: number
): AssignmentStructure {
  const current = Array.isArray(structure.targetFrameworks) ? structure.targetFrameworks : [];
  return {
    ...structure,
    targetFrameworks: current.filter((_, idx) => idx !== frameworkIndex),
  };
}
/** Update target frameworks in an existing structure */

export function updateTargetFrameworks(
  structure: AssignmentStructure,
  frameworks: string[]
): AssignmentStructure {
  return {
    ...structure,
    targetFrameworks: frameworks,
  };
}
/**
 * Update the working thesis statement in an existing assignment structure.
 */

export function updateThesisStatement(
  structure: AssignmentStructure,
  thesis: string
): AssignmentStructure {
  return {
    ...structure,
    thesisStatement: thesis,
    version: (structure.version || 1) + 1,
  };
}
